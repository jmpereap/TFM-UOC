import { NextRequest, NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { splitIntoBlocks } from 'lib/pdf/splitIntoBlocks'
import { parsePdf } from 'lib/pdf/parsePdf'
import { detectFrontMatter, defaultFrontmatterConfig } from '@/lib/legal/frontmatter'
import { computeAllStats } from '@/lib/utils/pageStats'

export const runtime = 'nodejs'

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

    return NextResponse.json({
      blocks,
      pagesFull,
      pagesFullRaw, // Incluir también las páginas completas (con front matter) para que generate-direct pueda buscar el índice
      pdfSchema,
      meta: { numPages: parsed.numPages, info: metaInfo, blockSize, overlap, fileHash },
      frontMatterDropped: Array.from(frontMatter),
      pageStats,
    })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error procesando PDF' }, { status: 500 })
  }
}

