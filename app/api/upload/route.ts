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
    const { text, numPages, info } = await parsePdf(buffer)
    const blocks = splitIntoBlocks(text)

    return NextResponse.json({ blocks, meta: { numPages, info } })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error procesando PDF' }, { status: 500 })
  }
}

