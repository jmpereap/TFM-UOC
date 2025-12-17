import { NextRequest, NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { splitIntoBlocks } from 'lib/pdf/splitIntoBlocks'
import { parsePdf } from 'lib/pdf/parsePdf'
import { detectFrontMatter, defaultFrontmatterConfig } from '@/lib/legal/frontmatter'
import { computeAllStats } from '@/lib/utils/pageStats'
import { extractBookmarks } from 'lib/pdf/extractBookmarks'

export const runtime = 'nodejs'

function guessLegal(pagesFullRaw: Array<{ num: number; text: string }>, metaInfo: Record<string, any>, bookmarks: any[]) {
  let score = 0
  const title = String(metaInfo?.Title || metaInfo?.title || '').toLowerCase()
  const authors = String(metaInfo?.Author || metaInfo?.author || '').toLowerCase()
  const firstPagesText = pagesFullRaw
    .slice(0, 5)
    .map((p) => p.text)
    .join('\n')
    .toLowerCase()

  const legalPatterns = [
    /art[íi]culo\s+\d/,
    /disposici[oó]n\s+(adicional|transitoria|derogatoria|final)/,
    /bolet[ií]n oficial/,
    /t[íi]tulo\s+preliminar/,
    /\bcap[ií]tulo\b/,
    /\bsecci[oó]n\b/,
    /\bled\b/,
    /\bdecreto\b/,
    /\borden\b/,
    /\bles\s+(\d{4}|\d+)/,
  ]

  const hitsInText = legalPatterns.some((rx) => rx.test(firstPagesText))
  if (hitsInText) score += 2

  const matchesTitle = /ley|decreto|disposici[oó]n|boe|real decreto/.test(title)
  if (matchesTitle) score += 2

  const matchesAuthor = /ministerio|boe|juzgado|tribunal|c[oó]digo/.test(authors)
  if (matchesAuthor) score += 1

  const bookmarkText = JSON.stringify(bookmarks || []).toLowerCase()
  const hitsBookmarks = /(t[íi]tulo|cap[ií]tulo|art[íi]culo|disposici[oó]n)/.test(bookmarkText)
  if (hitsBookmarks) score += 2

  console.log('[Upload] guessLegal breakdown', {
    hitsInText,
    matchesTitle,
    matchesAuthor,
    hitsBookmarks,
    score,
    meta: {
      titleSample: title.slice(0, 80),
      authorSample: authors.slice(0, 80),
      pagesScanned: Math.min(5, pagesFullRaw.length),
      hasBookmarks: Array.isArray(bookmarks) && bookmarks.length > 0,
    },
  })

  return {
    isLegalGuess: score >= 2,
    legalScore: score,
  }
}

function normalizePageText(s: string) {
  return (s || '')
    .replace(/\f/g, '\n')
    .replace(/^\s*\d+\s*$/gm, '')
    .replace(/[·•◦]\s*/g, '• ')
    .replace(/[ \t]+/g, ' ')
    .trim()
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData()
    const file = form.get('file')
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: 'Fichero PDF requerido' }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const fileHash = crypto.createHash('sha1').update(buffer).digest('hex')

    const blockSizeRaw = form.get('blockSize')
    const overlapRaw = form.get('overlap')
    const blockSize = Number.isFinite(Number(blockSizeRaw)) ? Math.max(1, parseInt(String(blockSizeRaw), 10)) : 5
    const overlap = Number.isFinite(Number(overlapRaw)) ? Math.max(0, parseInt(String(overlapRaw), 10)) : 1

    const parsed = await parsePdf(buffer)
    const metaInfo = (parsed.info as any) || {}
    const pages = parsed.pages || []
    
    // Extraer bookmarks/marcadores del PDF
    const bookmarks = await extractBookmarks(buffer)
    
    // Logging para debug: verificar cuántas páginas se parsearon
    console.log('[Upload] PDF parseado:', {
      totalPagesFromMeta: parsed.numPages,
      pagesParsed: pages.length,
      note: pages.length < parsed.numPages ? 'ALERTA: Se parsearon menos páginas de las que indica el PDF' : 'OK'
    })
    
    // IMPORTANTE: Asegurar que tenemos todas las páginas del PDF
    // Si pages.length < parsed.numPages, hay un problema con el parser
    if (pages.length < parsed.numPages) {
      console.error('[Upload] ERROR: El PDF tiene', parsed.numPages, 'páginas pero solo se parsearon', pages.length)
      // Rellenar con páginas vacías si faltan
      while (pages.length < parsed.numPages) {
        pages.push('')
      }
    }
    
    const pagesFullRaw = pages.map((text, idx) => ({ num: idx + 1, text: normalizePageText(text) }))
    const frontCfg = defaultFrontmatterConfig()
    const frontMatter = detectFrontMatter(pagesFullRaw, frontCfg)
    const firstBodyIdx = pagesFullRaw.findIndex((p) => /Art[íi]culo\s+1\b/i.test(p.text) || /T[ÍI]TULO\s+PRELIMINAR/i.test(p.text))
    if (firstBodyIdx > 0) {
      for (let i = 0; i < firstBodyIdx; i += 1) {
        frontMatter.add(pagesFullRaw[i].num)
      }
    }
    const pagesFull = pagesFullRaw.filter((p) => !frontMatter.has(p.num))
    const blocks = splitIntoBlocks(pages, blockSize, overlap)
    const pdfSchema = buffer.toString('base64')
    const pageStats = computeAllStats(pagesFullRaw)
    const { isLegalGuess, legalScore } = guessLegal(pagesFullRaw, metaInfo, bookmarks)
    console.log('[Upload] guessLegal result', { isLegalGuess, legalScore })

    return NextResponse.json({
      blocks,
      pagesFull,
      pagesFullRaw, // Incluir también las páginas completas (con front matter) para que generate-direct pueda buscar el índice
      pdfSchema,
      meta: { numPages: parsed.numPages, info: metaInfo, blockSize, overlap, fileHash, isLegalGuess, legalScore },
      frontMatterDropped: Array.from(frontMatter),
      pageStats,
      bookmarks, // Marcadores/bookmarks del PDF
    })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error procesando PDF' }, { status: 500 })
  }
}

