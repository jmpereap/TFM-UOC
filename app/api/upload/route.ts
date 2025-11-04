import { NextResponse } from 'next/server'
import { parsePdf } from 'lib/pdf/parsePdf'
import { splitIntoBlocks } from 'lib/pdf/splitIntoBlocks'

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

    const blockSizeRaw = form.get('blockSize')
    const overlapRaw = form.get('overlap')
    const blockSize = Number.isFinite(Number(blockSizeRaw)) ? Math.max(1, parseInt(String(blockSizeRaw), 10)) : 5
    const overlap = Number.isFinite(Number(overlapRaw)) ? Math.max(0, parseInt(String(overlapRaw), 10)) : 1

    const { pages, numPages, info } = await parsePdf(buffer)
    const blocks = splitIntoBlocks(pages, blockSize, overlap)

    // Compat: expone pages (número) además de meta.numPages para clientes existentes
    return NextResponse.json({
      blocks,
      pages: numPages,
      meta: { numPages, info, blockSize, overlap },
    })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error procesando PDF' }, { status: 500 })
  }
}

