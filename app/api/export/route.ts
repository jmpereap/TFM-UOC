import { NextRequest, NextResponse } from 'next/server'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import type { MCQItem, OptionKey } from '@/types/mcq'

export const runtime = 'nodejs'

function stripCorrect(items: MCQItem[]): Omit<MCQItem, 'correcta'>[] {
  return items.map((it) => ({
    pregunta: it.pregunta,
    opciones: it.opciones,
    difficulty: it.difficulty,
    justificacion: it.justificacion,
    referencia: it.referencia,
  }))
}

function itemsToCSV(items: MCQItem[], includeCorrect: boolean): string {
  const escape = (s: string) => '"' + String(s ?? '').replace(/"/g, '""') + '"'
  const header = includeCorrect
    ? ['pregunta', 'A', 'B', 'C', 'D', 'correcta', 'justificacion', 'ley', 'paginas', 'articulo', 'parrafo']
    : ['pregunta', 'A', 'B', 'C', 'D', 'justificacion', 'ley', 'paginas', 'articulo', 'parrafo']
  const rows = items.map((it) => {
    const base = [it.pregunta, it.opciones.A, it.opciones.B, it.opciones.C, it.opciones.D]
    const tail = [
      it.justificacion,
      it.referencia.ley,
      it.referencia.paginas,
      it.referencia.articulo ?? '',
      it.referencia.parrafo ?? '',
    ]
    const arr = includeCorrect ? [...base, it.correcta, ...tail] : [...base, ...tail]
    return arr.map(escape).join(',')
  })
  return [header.join(','), ...rows].join('\n')
}

async function itemsToPDF(items: MCQItem[], lawName?: string): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create()
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
  const margin = 50
  const lineHeight = 14
  const pageWidth = 595.28
  const pageHeight = 841.89

  const addPageWithHeader = () => {
    const page = pdfDoc.addPage([pageWidth, pageHeight])
    let y = pageHeight - margin
    const title = lawName ? `Preguntas — ${lawName}` : 'Preguntas'
    page.drawText(title, { x: margin, y, size: 12, font: fontBold })
    y -= 24
    return { page, y }
  }

  let { page, y } = addPageWithHeader()

  const drawWrapped = (txt: string, opts: { bold?: boolean } = {}) => {
    const maxWidth = pageWidth - 2 * margin
    const usedFont = opts.bold ? fontBold : font
    const words = (txt || '').split(/\s+/)
    let line = ''
    for (let i = 0; i < words.length; i++) {
      const next = line ? line + ' ' + words[i] : words[i]
      const width = usedFont.widthOfTextAtSize(next, 11)
      if (width > maxWidth) {
        if (y < margin + lineHeight * 2) {
          const p = addPageWithHeader()
          page = p.page
          y = p.y
        }
        page.drawText(line, { x: margin, y, size: 11, font: usedFont })
        y -= lineHeight
        line = words[i]
      } else {
        line = next
      }
    }
    if (line) {
      if (y < margin + lineHeight * 2) {
        const p = addPageWithHeader()
        page = p.page
        y = p.y
      }
      page.drawText(line, { x: margin, y, size: 11, font: usedFont })
      y -= lineHeight
    }
  }

  items.forEach((it, idx) => {
    drawWrapped('Q' + (idx + 1) + '. ' + it.pregunta, { bold: true })
    drawWrapped('A) ' + it.opciones.A)
    drawWrapped('B) ' + it.opciones.B)
    drawWrapped('C) ' + it.opciones.C)
    drawWrapped('D) ' + it.opciones.D)
    let ref = 'Referencia: ' + it.referencia.ley + ', ' + it.referencia.paginas
    if (it.referencia.articulo) ref += ', art. ' + it.referencia.articulo
    if (it.referencia.parrafo) ref += ', párr. ' + it.referencia.parrafo
    drawWrapped(ref)
    y -= lineHeight
    if (y < margin + lineHeight * 6) {
      const p = addPageWithHeader()
      page = p.page
      y = p.y
    }
  })

  return await pdfDoc.save()
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 })
  const { format, items, lawName, includeCorrect } = body || {}
  if (!Array.isArray(items) || items.length === 0)
    return NextResponse.json({ ok: false, error: 'No items' }, { status: 400 })
  if (!['json', 'csv', 'pdf'].includes(format))
    return NextResponse.json({ ok: false, error: 'Invalid format' }, { status: 400 })

  if (format === 'json') {
    const payload = includeCorrect ? (items as MCQItem[]) : stripCorrect(items as MCQItem[])
    const buff = Buffer.from(JSON.stringify(payload, null, 2), 'utf-8')
    return new NextResponse(buff, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': 'attachment; filename=preguntas.json',
      },
    })
  }

  if (format === 'csv') {
    const csv = itemsToCSV(items as MCQItem[], !!includeCorrect)
    const buff = Buffer.from(csv, 'utf-8')
    return new NextResponse(buff, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename=preguntas.csv',
      },
    })
  }

  const pdfBytes = await itemsToPDF(items as MCQItem[], lawName)
  return new NextResponse(pdfBytes, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename=preguntas.pdf',
    },
  })
}













