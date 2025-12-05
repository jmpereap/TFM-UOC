import type { PageTxt } from '@/lib/utils/pageStats'
import type { RulePack } from '@/lib/legal/rulePack'
import { segmentLegalUnitsByHeaders, type LegalUnit } from '@/lib/utils/legalSegment'

export type Fragment = {
  pages: string
  text: string
}

export type BuildFragmentsOpts = {
  maxFragments?: number
  sliceChars?: number
}

export type BuildFragmentsResult = {
  fragments: Fragment[]
  units: LegalUnit[]
}

const RX_BOE_FOOTER = /BOLET[ÍI]N\s+OFICIAL\s+DEL\s+ESTADO.*?P(?:[áa]gina|\.)\s*\d+/gim

function sliceBySentences(text: string, maxChars: number): string {
  const clean = (text || '').replace(/\s+/g, ' ').trim()
  if (!clean) return ''
  if (clean.length <= maxChars) return clean
  const sentences = clean.split(/(?<=[\.\!\?])\s+/)
  let acc = ''
  for (const sentence of sentences) {
    if (!sentence) continue
    const next = acc ? `${acc} ${sentence}` : sentence
    if (next.length > maxChars) break
    acc = next
  }
  if (!acc) {
    return clean.slice(0, maxChars)
  }
  return acc
}

export function buildFragmentsFromUnits(
  pages: PageTxt[],
  pack: RulePack,
  opts: BuildFragmentsOpts = {},
): BuildFragmentsResult {
  const { maxFragments = 14, sliceChars = 1800 } = opts
  const units = segmentLegalUnitsByHeaders(pages, pack)
  const priorityOrder = (u: LegalUnit) => {
    const label = (u.unidad || '').toLowerCase()
    if (/t[íi]tulo\s+preliminar/.test(label)) return 0
    if (/t[íi]tulo\s+i\b/.test(label)) return 1
    if (/disposici/.test(label)) return 2
    return 3
  }

  const sorted = [...units]
    .filter((u) => !/contenido\s+previo/i.test(u.unidad || ''))
    .sort((a, b) => {
      const pr = priorityOrder(a) - priorityOrder(b)
      if (pr !== 0) return pr
      return (a.startPage || 0) - (b.startPage || 0)
    })

  const fragments: Fragment[] = []

  for (const unit of sorted) {
    let txt = (unit.text || '').replace(RX_BOE_FOOTER, '').trim()
    if (!txt || txt.length < 120) continue

    const lines = txt.split(/\n+/).map((l) => l.trim()).filter(Boolean)
    if (!lines.length) continue
    const headLine = lines[0]
    const body = lines.slice(1).join('\n')
    const head = headLine || (unit.unidad || '').trim()
    const rest = sliceBySentences(body, Math.max(200, sliceChars - head.length - 1))
    const snippet = rest ? `${head}\n${rest}` : head
    fragments.push({
      pages: `p. ${unit.startPage ?? '?'}` + (unit.endPage && unit.endPage !== unit.startPage ? `–${unit.endPage}` : ''),
      text: snippet.slice(0, sliceChars).trim(),
    })
    if (fragments.length >= maxFragments) break
  }

  return { fragments, units }
}

export { sliceBySentences, RX_BOE_FOOTER }










