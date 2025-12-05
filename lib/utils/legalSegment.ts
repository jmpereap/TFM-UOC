import type { PageTxt } from '@/lib/utils/pageStats'
import type { RulePack } from '@/lib/legal/rulePack'
import { compileHeaderUnion } from '@/lib/legal/headers'

export type HeaderKind = 'titulo' | 'capitulo' | 'seccion' | 'articulo' | 'disposiciones' | 'disposicion'

export type LegalUnit = {
  unidad: string
  startPage: number
  endPage: number
  text: string
  kind?: HeaderKind
}

export type HeaderHit = {
  kind: HeaderKind
  label: string
  pageIndex: number
  lineIndex: number
  pageNum: number
}

export function normalizePageText(s: string) {
  return (s || '')
    .replace(/\f/g, '\n')
    .replace(/^\s*\d+\s*$/gm, '')
    .replace(/[·•◦]\s*/g, '• ')
    .replace(/[ \t]+/g, ' ')
    .trim()
}

function compilePatterns(patterns: string[] | undefined) {
  return (patterns || []).map((pattern) => new RegExp(pattern, 'iu'))
}

function matchAny(regexes: RegExp[], line: string) {
  return regexes.some((rx) => rx.test(line))
}

const SENTENCE_LIKE_RX = /[.;:?!]\s+[a-záéíóúñ]/iu
const ENUMERATION_LIKE_RX = /\b\d+\./

const HEADER_HYPHEN_FIXES: RegExp[] = [
  /Art[íi]-?culo/giu,
  /T[íi]-?tulo/giu,
  /Cap[íi]-?tulo/giu,
  /Se-?cci[oó]n/giu,
  /Dis-?posici[oó]n/giu,
  /Dis-?posiciones/giu,
]

function normalizeHeaderKeywords(line: string) {
  if (!line) return ''
  let result = joinBrokenCaps(line)
  for (const pattern of HEADER_HYPHEN_FIXES) {
  result = result.replace(pattern, (match) => match.replace(/[-\s]+/g, ''))
  }
  return result
}

const BROKEN_CAPS_RX = /\b(?:[A-ZÁÉÍÓÚÑ]\s+){2,}[A-ZÁÉÍÓÚÑ]\b/g

function joinBrokenCaps(input: string) {
  return (input || '').replace(BROKEN_CAPS_RX, (chunk) => chunk.replace(/\s+/g, ''))
}

function collapseWhitespace(text: string) {
  return (text || '').replace(/\s+/g, ' ').trim()
}

function firstAlphabetical(text: string) {
  const match = (text || '').match(/[A-Za-zÁÉÍÓÚÑáéíóúñ]/u)
  return match ? match[0] : undefined
}

function looksLikeParagraphContinuation(text: string) {
  if (!text) return false
  if (text.length > 200) return true
  if (SENTENCE_LIKE_RX.test(text)) return true
  if (ENUMERATION_LIKE_RX.test(text)) return true
  return false
}

function normalizeArticleLabel(line: string) {
  const match = line.match(/^(Art[íi]culo\s+\d+[A-Za-z]?)(\.?)(.*)$/i)
  if (!match) return collapseWhitespace(line)
  const head = `${match[1].trim()}${match[2] ? '.' : ''}`
  const rest = collapseWhitespace(match[3] || '')
  if (!rest) return head
  if (looksLikeParagraphContinuation(rest)) return head
  const firstAlpha = firstAlphabetical(rest)
  if (firstAlpha && firstAlpha === firstAlpha.toLocaleUpperCase('es-ES')) {
    return `${head} ${rest}`.trim()
  }
  return head
}

function normalizeStructuralLabel(kind: HeaderKind, line: string) {
  const compact = collapseWhitespace(line)
  if (kind === 'articulo') return normalizeArticleLabel(compact)
  if (kind === 'disposicion') {
    const match = compact.match(/^(Disposición\s+[^\s]+)(\.?)(.*)$/i)
    if (!match) return compact
    const head = `${match[1].trim()}${match[2] ? '.' : ''}`
    const rest = collapseWhitespace(match[3] || '')
    if (!rest || looksLikeParagraphContinuation(rest)) return head
    return `${head} ${rest}`.trim()
  }
  if (kind === 'disposiciones') {
    return compact
  }
  if (kind === 'titulo' || kind === 'capitulo' || kind === 'seccion') {
    const match = compact.match(/^([^\.]+?)(\.?)(.*)$/u)
    if (!match) return compact
    const head = `${match[1].trim()}${match[2] ? '.' : ''}`
    const rest = collapseWhitespace(match[3] || '')
    if (!rest || looksLikeParagraphContinuation(rest)) return head
    return `${head} ${rest}`.trim()
  }
  return compact
}

function shouldAcceptHeader(kind: HeaderKind, line: string) {
  if (kind === 'articulo') {
    const match = line.match(/^(Art[íi]culo\s+\d+[A-Za-z]?)(\.?)(.*)$/i)
    if (!match) return false
    const punctuation = match[2]
    const rest = collapseWhitespace(match[3] || '')
    if (!punctuation && rest) return false
    if (!rest) return true
    const firstAlpha = firstAlphabetical(rest)
    if (firstAlpha && firstAlpha === firstAlpha.toLocaleLowerCase('es-ES')) {
      return false
    }
    return true
  }
  if (kind === 'titulo') {
  const remainder = collapseWhitespace(line.replace(/^T[ÍI]TULO\s+/i, '')).replace(/[.:–-]+$/u, '').trim()
  if (!remainder) return false
  if (/^PRELIMINAR$/i.test(remainder)) return true
  if (/^[IVXLCDM]+$/i.test(remainder)) return true
  return false
  }
  return true
}

function classifyHeader(line: string, pack: RulePack, caches: {
  titles: RegExp[]
  chapters: RegExp[]
  sections: RegExp[]
  articles: RegExp[]
  disposGroups: RegExp[]
  disposItems: RegExp[]
}): HeaderKind | null {
  if (matchAny(caches.titles, line)) return 'titulo'
  if (matchAny(caches.chapters, line)) return 'capitulo'
  if (matchAny(caches.sections, line)) return 'seccion'
  if (matchAny(caches.disposGroups, line)) return 'disposiciones'
  if (matchAny(caches.disposItems, line)) return 'disposicion'
  if (matchAny(caches.articles, line)) return 'articulo'
  return null
}

function normalizeText(text: string) {
  return (text || '').normalize('NFC')
}

function collectText(
  pages: Array<{ num: number; lines: string[] }>,
  start: { pageIndex: number; lineIndex: number },
  end?: { pageIndex: number; lineIndex: number },
) {
  const startPageIdx = start.pageIndex
  const endPageIdx = end ? end.pageIndex : pages.length - 1
  const endLineIdx = end ? end.lineIndex : pages[endPageIdx].lines.length
  const chunks: string[] = []

  for (let pageIdx = startPageIdx; pageIdx <= endPageIdx; pageIdx += 1) {
    const page = pages[pageIdx]
    const fromLine = pageIdx === startPageIdx ? start.lineIndex : 0
    const toLine = pageIdx === endPageIdx ? endLineIdx : page.lines.length
    if (toLine <= fromLine) continue
    const slice = page.lines.slice(fromLine, toLine).join('\n').trimEnd()
    if (slice.length) {
      chunks.push(slice)
    }
  }

  const text = chunks.join('\n').replace(/\n{3,}/g, '\n\n')
  const startPage = pages[Math.min(startPageIdx, pages.length - 1)].num
  const endPage = pages[Math.min(endPageIdx, pages.length - 1)].num
  return { text, startPage, endPage }
}

export function segmentLegalUnitsByHeaders(pages: PageTxt[], pack: RulePack): LegalUnit[] {
  if (!pages?.length) return []
  const headUnion = compileHeaderUnion(pack)
  const headRegex = new RegExp(
    headUnion.source,
    headUnion.flags.includes('g') ? headUnion.flags : `${headUnion.flags}g`,
  )

  const caches = {
    titles: compilePatterns(pack.title_patterns),
    chapters: compilePatterns(pack.chapter_patterns),
    sections: compilePatterns(pack.section_patterns),
    articles: compilePatterns(pack.article_patterns),
    disposGroups: compilePatterns(pack.dispositions_groups?.map((g) => g.group_pattern)),
    disposItems: compilePatterns(pack.dispositions_groups?.map((g) => g.item_pattern)),
  }

  const pageData = pages.map((p) => ({
    num: p.num,
    lines: normalizeText(p.text).split(/\r?\n/),
  }))

  const headers: HeaderHit[] = []
  pageData.forEach((page, pageIndex) => {
    page.lines.forEach((rawLine, lineIndex) => {
      const normalized = normalizeHeaderKeywords(rawLine ?? '')
      const trimmed = normalized.trim()
      if (!trimmed) return
      const compact = collapseWhitespace(trimmed)
      headRegex.lastIndex = 0
      if (!headRegex.test(compact)) return
      const kind = classifyHeader(compact, pack, caches)
      if (!kind) return
      if (!shouldAcceptHeader(kind, compact)) return
      const label = normalizeStructuralLabel(kind, compact)
      headers.push({ kind, label, pageIndex, lineIndex, pageNum: page.num })
    })
  })

  if (!headers.length) return []

  headers.sort((a, b) => (a.pageIndex === b.pageIndex ? a.lineIndex - b.lineIndex : a.pageIndex - b.pageIndex))

  const units: LegalUnit[] = []

  const first = headers[0]
  if (first.pageIndex > 0 || first.lineIndex > 0) {
    const pre = collectText(
      pageData,
      { pageIndex: 0, lineIndex: 0 },
      { pageIndex: first.pageIndex, lineIndex: first.lineIndex },
    )
    if (pre.text.trim().length) {
      units.push({
        unidad: 'Contenido previo',
        startPage: pre.startPage,
        endPage: pre.endPage,
        text: pre.text,
        kind: undefined,
      })
    }
  }

  for (let i = 0; i < headers.length; i += 1) {
    const start = headers[i]
    const next = headers[i + 1]
    const collected = collectText(
      pageData,
      { pageIndex: start.pageIndex, lineIndex: start.lineIndex },
      next ? { pageIndex: next.pageIndex, lineIndex: next.lineIndex } : undefined,
    )
    const text = collected.text.trim()
    if (!text) continue
    units.push({
      unidad: start.label,
      startPage: collected.startPage,
      endPage: collected.endPage,
      text,
      kind: start.kind,
    })
  }

  return units
}

// Legacy segmented units kept for backward compatibility
export const RX = {
  titulo: /^T[\u00cdI]TULO\s+(PRELIMINAR|[IVXLC]+)\b.*$/i,
  cap: /^CAP[\u00cdI]TULO\s+([IVXLC]+|PRIMERO|SEGUNDO|TERCERO|CUARTO|QUINTO|SEXTO|S[\u00c9E]PTIMO|OCTAVO|NOVENO|D[\u00c9E]CIMO)\b.*$/i,
  sec: /^Secci[o\u00f3]n\s+\d+\.\u00aa\b.*$/i,
  dispGroup: /^Disposiciones\s+(adicionales|transitorias|derogatorias|finales)\b.*$/i,
  disp: /^Disposici[o\u00f3]n\s+(adicional|transitoria|derogatoria|final)\s+([A-Za-z\u00e1\u00e9\u00ed\u00f3\u00fa\u00f1]+|\d+\.\u00aa)\b.*$/i,
  articulo: /^Art[\u00edi]culo\s+\d+[A-Za-z]?\.?\b.*$/i,
  preambulo: /^PRE[\u00c1A]MBULO\b.*$/i,
  heading: /^([A-Z\u00c1\u00c9\u00cd\u00d3\u00da\u00d1][A-Z\u00c1\u00c9\u00cd\u00d3\u00da\u00d1\s\d.,;:-]{6,})$/,
}

// Existing segmenter retained for other parts of the codebase
export function segmentLegalUnits(pages: Array<{ num: number; text: string }>): LegalUnit[] {
  const units: LegalUnit[] = []
  let current: LegalUnit | null = null

  for (const page of pages) {
    const lines = (page.text || '')
      .split(/\n+/)
      .map((s) => s.trim())
      .filter(Boolean)

    for (const rawLine of lines) {
      const line = rawLine.replace(/\s+/g, ' ').trim()
      const heading = (() => {
        if (RX.preambulo.test(line)) return { kind: 'preambulo', label: line }
        if (RX.titulo.test(line)) return { kind: 'titulo', label: line }
        if (RX.cap.test(line)) return { kind: 'capitulo', label: line }
        if (RX.sec.test(line)) return { kind: 'seccion', label: line }
        if (RX.dispGroup.test(line)) return { kind: 'disposiciones', label: line }
        if (RX.disp.test(line)) return { kind: 'disposicion', label: line }
        if (RX.heading.test(line)) return { kind: 'heading', label: line }
        if (RX.articulo.test(line)) return { kind: 'articulo', label: line }
        return null
      })()

      if (heading) {
        if (heading.kind === 'preambulo') {
          if (current) {
            current.endPage = page.num
            units.push(current)
          }
          current = null
          continue
        }
        if (heading.kind === 'articulo') {
          if (!current) {
            current = {
              unidad: 'Contenido previo',
              startPage: page.num,
              endPage: page.num,
              text: '',
            }
          }
          current.text += (current.text ? '\n' : '') + heading.label
          continue
        }
        if (heading.kind === 'heading') {
          if (!current) {
            current = {
              unidad: heading.label,
              startPage: page.num,
              endPage: page.num,
              text: heading.label + '\n',
            }
          } else {
            current.text += (current.text ? '\n' : '') + heading.label
          }
          continue
        }
        if (current) {
          current.endPage = page.num
          units.push(current)
        }
        current = {
          unidad: heading.label,
          startPage: page.num,
          endPage: page.num,
          text: heading.label + '\n',
        }
        continue
      }

      if (!current) {
        current = {
          unidad: 'Contenido previo',
          startPage: page.num,
          endPage: page.num,
          text: '',
        }
      }
      current.text += (current.text ? '\n' : '') + rawLine
    }

    if (current) current.endPage = page.num
  }

  if (current) {
    units.push(current)
  }

  const filtered = units.filter((u) => {
    const name = u.unidad.toLowerCase()
    if (!u.text.trim()) return false
    if (/pre[áa]mbulo/.test(name)) return false
    if (/contenido previo/.test(name) && u.text.trim().length < 200) return false
    return true
  })

  return filtered
}