export const RX = {
  titulo: /^[ \t]*T[ÍI]TULO\s+(PRELIMINAR|[IVXLC]+)\b/i,
  capitulo: /^[ \t]*CAP[ÍI]TULO\s+[IVXLC]+\b/i,
  seccion: /^[ \t]*SECCI[ÓO]N\s+[IVXLC]+\b/i,
  articulo: /^[ \t]*ART[ÍI]CULO\s+\d+[A-Za-z]?\b/,
  disp: /^[ \t]*DISPOSICI[ÓO]N\s+(ADICIONAL|TRANSITORIA|DEROGATORIA|FINAL)\b/i,
}

export function normalizePageText(s: string) {
  return (s || '')
    .replace(/\f/g, '\n')
    .replace(/^\s*\d+\s*$/gm, '')
    .replace(/[·•◦]\s*/g, '• ')
    .replace(/[ \t]+/g, ' ')
    .trim()
}

export type LegalUnit = { unidad: string; startPage: number; endPage: number; text: string }

export function segmentLegalUnits(pages: { num: number; text: string }[]): LegalUnit[] {
  const units: LegalUnit[] = []
  let current: LegalUnit | null = null
  for (const p of pages) {
    const text = normalizePageText(p.text)
    const lines = text.split('\n')
    for (const line of lines) {
      const header = RX.titulo.test(line) || RX.capitulo.test(line) || RX.seccion.test(line) || RX.disp.test(line)
      if (header) {
        if (current) {
          current.endPage = p.num
          units.push(current)
        }
        current = { unidad: line.trim(), startPage: p.num, endPage: p.num, text: line + '\n' }
      } else {
        if (!current) current = { unidad: 'Preámbulo / Portada', startPage: p.num, endPage: p.num, text: '' }
        current.text += line + '\n'
      }
    }
    if (current) current.endPage = p.num
  }
  if (current) units.push(current)
  return units
}


