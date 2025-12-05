export type PageTxt = {
  num: number
  text: string
}

export type PageStats = {
  num: number
  chars: number
  lines: number
  idxLines: number
  idxMatches: number
  upperHits: number
  hasArticulo: boolean
  hasTitulo: boolean
  hasCapitulo: boolean
  hasSeccion: boolean
}

const RX_IDX = /\.{2,}\s*\d+$/
const RX_UPPER = /^(ÍNDICE|SUMARIO|CONTENIDOS|TABLA DE CONTENIDOS|LEGISLACIÓN CONSOLIDADA|BOLETÍN OFICIAL DEL ESTADO)\b/i
const RX_ART = /\bArt[íi]culo\s+\d+[A-Za-z]?\.?\b/
const RX_TIT = /^T[ÍI]TULO\s+(PRELIMINAR|[IVXLC]+)\b/i
const RX_CAP = /^CAP[ÍI]TULO\s+([IVXLC]+|PRIMERO|SEGUNDO|TERCERO|CUARTO|QUINTO|SEXTO|S[ÉE]PTIMO|OCTAVO|NOVENO|D[ÉE]CIMO)\b/i
const RX_SEC = /^Secci[oó]n\s+\d+\.ª\b/i

export function computePageStats(page: PageTxt): PageStats {
  const lines = (page.text || '')
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean)
  const idxLines = lines.filter((line) => RX_IDX.test(line)).length
  const idxMatches = (page.text.match(/\.{2,}\s*\d+/g) || []).length
  const upperHits = lines.filter((line) => RX_UPPER.test(line)).length
  const hasArticulo = RX_ART.test(page.text || '')
  const hasTitulo = lines.some((line) => RX_TIT.test(line))
  const hasCapitulo = lines.some((line) => RX_CAP.test(line))
  const hasSeccion = lines.some((line) => RX_SEC.test(line))

  return {
    num: page.num,
    chars: (page.text || '').length,
    lines: lines.length,
    idxLines,
    idxMatches,
    upperHits,
    hasArticulo,
    hasTitulo,
    hasCapitulo,
    hasSeccion,
  }
}

export function computeAllStats(pages: PageTxt[]): PageStats[] {
  return (pages || []).map(computePageStats)
}
