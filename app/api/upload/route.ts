import { NextResponse } from 'next/server'
import { parsePdf } from 'lib/pdf/parsePdf'
import { splitIntoBlocks } from 'lib/pdf/splitIntoBlocks'
import crypto from 'node:crypto'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  try {
    const form = await req.formData()
    const file = form.get('file')
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: 'Fichero PDF requerido' }, { status: 400 })
    }

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const fileHash = crypto.createHash('sha1').update(buffer).digest('hex')

    const blockSizeRaw = form.get('blockSize')
    const overlapRaw = form.get('overlap')
    const blockSize = Number.isFinite(Number(blockSizeRaw)) ? Math.max(1, parseInt(String(blockSizeRaw), 10)) : 5
    const overlap = Number.isFinite(Number(overlapRaw)) ? Math.max(0, parseInt(String(overlapRaw), 10)) : 1

    const { pages, numPages, info } = await parsePdf(buffer)
    const blocks = splitIntoBlocks(pages, blockSize, overlap)

    function normalizePageText(s: string) {
      return (s || '')
        .replace(/\f/g, '\n')
        .replace(/^\s*\d+\s*$/gm, '')
        .replace(/[·•◦]\s*/g, '• ')
        .replace(/[ \t]+/g, ' ')
        .trim()
    }
    const pagesFull = pages.map((t, i) => ({ num: i + 1, text: normalizePageText(t).slice(0, 20000) }))

    // Compat: expone pages (número) además de meta.numPages para clientes existentes
    return NextResponse.json({
      blocks,
      pages: numPages,
      pagesFull,
      meta: { numPages, info, blockSize, overlap, fileHash },
    })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error procesando PDF' }, { status: 500 })
  }
}

