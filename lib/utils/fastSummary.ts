import type { LegalUnit } from '@/lib/utils/legalSegment'

export function unitScore(u: LegalUnit) {
  const t = (u.text || '').toLowerCase()
  let s = 0
  s += ((t.match(/art[íi]culo\s+\d+/g) || []).length) * 2
  if (/titulo\s+iv\b/.test(t)) s += 8
  if (/titulo\s+ii\b/.test(t)) s += 6
  if (/titulo\s+i\b/.test(t)) s += 5
  if (/titulo\s+vi\b/.test(t)) s += 4
  if (/disposici[óo]n\s+(adicional|transitoria|derogatoria|final)/.test(t)) s += 5
  s += Math.min(10, Math.floor(((u.text || '').length / 2000)))
  return s
}

export function extractiveSlice(text: string, maxChars = 1800) {
  if (!text) return ''
  const parts = text.split(/\n{2,}/)
  let out = ''
  for (const par of parts) {
    const sent = par.split(/(?<=[\.!?])\s+(?=[A-ZÁÉÍÓÚÑ])/)[0] || par
    if ((out + '\n' + sent).length > maxChars) break
    out += (out ? '\n' : '') + sent
  }
  return out.slice(0, maxChars)
}

export function pickFastUnits(units: any[], K: number) {
  return [...units].sort((a, b) => unitScore(b) - unitScore(a)).slice(0, K)
}

export function titleBucket(u: LegalUnit) {
  const t = (u.unidad || '').toLowerCase()
  if (/titulo\s+iv\b/.test(t)) return 'T4'
  if (/titulo\s+ii\b/.test(t)) return 'T2'
  if (/titulo\s+i\b/.test(t)) return 'T1'
  if (/titulo\s+vi\b/.test(t)) return 'T6'
  if (/disposici/.test(t)) return 'DISP'
  return 'OTROS'
}

export function pickStratified(units: LegalUnit[], K = 12) {
  const groups = new Map<string, LegalUnit[]>()
  for (const u of units) {
    const b = titleBucket(u)
    if (!groups.has(b)) groups.set(b, [])
    groups.get(b)!.push(u)
  }
  for (const arr of groups.values()) arr.sort((a, b) => b.text.length - a.text.length)
  const plan: Array<[string, number]> = [
    ['T4', 3],
    ['T2', 2],
    ['T1', 2],
    ['T6', 1],
    ['DISP', 2],
    ['OTROS', K],
  ]
  const pick: LegalUnit[] = []
  for (const [key, quota] of plan) {
    const arr = groups.get(key) || []
    while (pick.length < K && arr.length && (key !== 'OTROS' ? pick.filter((x) => titleBucket(x) === key).length < quota : true)) {
      pick.push(arr.shift()!)
    }
    if (pick.length >= K) break
  }
  return pick.slice(0, K)
}

export function extractArticleSummaries(text: string, limit = 6) {
  const results: Array<{ articulo: string; resumen: string }> = []
  if (!text) return results
  const regex = /(?:^|\n)\s*(ART[ÍI]CULO\s+\d+[A-Za-z]?)([^\n]*)([\s\S]*?)(?=\n\s*ART[ÍI]CULO\s+\d+[A-Za-z]?|$)/gi
  let match: RegExpExecArray | null
  while ((match = regex.exec(text)) && results.length < limit) {
    const art = match[1].replace(/\s+/g, ' ').trim()
    const body = (match[2] + ' ' + match[3]).replace(/\s+/g, ' ').trim()
    const sentence = body.split(/(?<=[\.!?])\s+/)[0]?.slice(0, 160) || body.slice(0, 160)
    results.push({ articulo: art, resumen: sentence })
  }
  return results
}

export function summarize(text: string, max = 200) {
  const clean = (text || '').replace(/\s+/g, ' ').trim()
  if (!clean) return ''
  const sentence = clean.split(/(?<=[\.!?])\s+/)[0] || clean
  return sentence.slice(0, max)
}


