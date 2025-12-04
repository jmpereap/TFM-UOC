[1mdiff --git a/lib/utils/legalSegment.ts b/lib/utils/legalSegment.ts[m
[1mindex 753d1e4..b154ee1 100644[m
[1m--- a/lib/utils/legalSegment.ts[m
[1m+++ b/lib/utils/legalSegment.ts[m
[36m@@ -1,45 +1,255 @@[m
[31m-export const RX = {[m
[31m-  titulo: /^[ \t]*T[ÍI]TULO\s+(PRELIMINAR|[IVXLC]+)\b/i,[m
[31m-  capitulo: /^[ \t]*CAP[ÍI]TULO\s+[IVXLC]+\b/i,[m
[31m-  seccion: /^[ \t]*SECCI[ÓO]N\s+[IVXLC]+\b/i,[m
[31m-  articulo: /^[ \t]*ART[ÍI]CULO\s+\d+[A-Za-z]?\b/,[m
[31m-  disp: /^[ \t]*DISPOSICI[ÓO]N\s+(ADICIONAL|TRANSITORIA|DEROGATORIA|FINAL)\b/i,[m
[32m+[m[32mimport type { PageTxt } from '@/lib/utils/pageStats'[m
[32m+[m[32mimport type { RulePack } from '@/lib/legal/rulePack'[m
[32m+[m[32mimport { compileHeaderUnion } from '@/lib/legal/headers'[m
[32m+[m
[32m+[m[32mexport type HeaderKind = 'titulo' | 'capitulo' | 'seccion' | 'articulo' | 'disposiciones' | 'disposicion'[m
[32m+[m
[32m+[m[32mexport type LegalUnit = {[m
[32m+[m[32m  unidad: string[m
[32m+[m[32m  startPage: number[m
[32m+[m[32m  endPage: number[m
[32m+[m[32m  text: string[m
[32m+[m[32m  kind?: HeaderKind[m
[32m+[m[32m}[m
[32m+[m
[32m+[m[32mexport type HeaderHit = {[m
[32m+[m[32m  kind: HeaderKind[m
[32m+[m[32m  label: string[m
[32m+[m[32m  pageIndex: number[m
[32m+[m[32m  lineIndex: number[m
[32m+[m[32m  pageNum: number[m
[32m+[m[32m}[m
[32m+[m
[32m+[m[32mfunction compilePatterns(patterns: string[] | undefined) {[m
[32m+[m[32m  return (patterns || []).map((pattern) => new RegExp(pattern, 'iu'))[m
[32m+[m[32m}[m
[32m+[m
[32m+[m[32mfunction matchAny(regexes: RegExp[], line: string) {[m
[32m+[m[32m  return regexes.some((rx) => rx.test(line))[m
[32m+[m[32m}[m
[32m+[m
[32m+[m[32mfunction classifyHeader(line: string, pack: RulePack, caches: {[m
[32m+[m[32m  titles: RegExp[][m
[32m+[m[32m  chapters: RegExp[][m
[32m+[m[32m  sections: RegExp[][m
[32m+[m[32m  articles: RegExp[][m
[32m+[m[32m  disposGroups: RegExp[][m
[32m+[m[32m  disposItems: RegExp[][m
[32m+[m[32m}): HeaderKind | null {[m
[32m+[m[32m  if (matchAny(caches.titles, line)) return 'titulo'[m
[32m+[m[32m  if (matchAny(caches.chapters, line)) return 'capitulo'[m
[32m+[m[32m  if (matchAny(caches.sections, line)) return 'seccion'[m
[32m+[m[32m  if (matchAny(caches.disposGroups, line)) return 'disposiciones'[m
[32m+[m[32m  if (matchAny(caches.disposItems, line)) return 'disposicion'[m
[32m+[m[32m  if (matchAny(caches.articles, line)) return 'articulo'[m
[32m+[m[32m  return null[m
[32m+[m[32m}[m
[32m+[m
[32m+[m[32mfunction normalizeText(text: string) {[m
[32m+[m[32m  return (text || '').normalize('NFC')[m
 }[m
 [m
[31m-export function normalizePageText(s: string) {[m
[31m-  return (s || '')[m
[31m-    .replace(/\f/g, '\n')[m
[31m-    .replace(/^\s*\d+\s*$/gm, '')[m
[31m-    .replace(/[·•◦]\s*/g, '• ')[m
[31m-    .replace(/[ \t]+/g, ' ')[m
[31m-    .trim()[m
[32m+[m[32mfunction collectText([m
[32m+[m[32m  pages: Array<{ num: number; lines: string[] }>,[m
[32m+[m[32m  start: { pageIndex: number; lineIndex: number },[m
[32m+[m[32m  end?: { pageIndex: number; lineIndex: number },[m
[32m+[m[32m) {[m
[32m+[m[32m  const startPageIdx = start.pageIndex[m
[32m+[m[32m  const endPageIdx = end ? end.pageIndex : pages.length - 1[m
[32m+[m[32m  const endLineIdx = end ? end.lineIndex : pages[endPageIdx].lines.length[m
[32m+[m[32m  const chunks: string[] = [][m
[32m+[m
[32m+[m[32m  for (let pageIdx = startPageIdx; pageIdx <= endPageIdx; pageIdx += 1) {[m
[32m+[m[32m    const page = pages[pageIdx][m
[32m+[m[32m    const fromLine = pageIdx === startPageIdx ? start.lineIndex : 0[m
[32m+[m[32m    const toLine = pageIdx === endPageIdx ? endLineIdx : page.lines.length[m
[32m+[m[32m    if (toLine <= fromLine) continue[m
[32m+[m[32m    const slice = page.lines.slice(fromLine, toLine).join('\n').trimEnd()[m
[32m+[m[32m    if (slice.length) {[m
[32m+[m[32m      chunks.push(slice)[m
[32m+[m[32m    }[m
[32m+[m[32m  }[m
[32m+[m
[32m+[m[32m  const text = chunks.join('\n').replace(/\n{3,}/g, '\n\n')[m
[32m+[m[32m  const startPage = pages[Math.min(startPageIdx, pages.length - 1)].num[m
[32m+[m[32m  const endPage = pages[Math.min(endPageIdx, pages.length - 1)].num[m
[32m+[m[32m  return { text, startPage, endPage }[m
[32m+[m[32m}[m
[32m+[m
[32m+[m[32mexport function segmentLegalUnitsByHeaders(pages: PageTxt[], pack: RulePack): LegalUnit[] {[m
[32m+[m[32m  if (!pages?.length) return [][m
[32m+[m[32m  const headUnion = compileHeaderUnion(pack)[m
[32m+[m[32m  const headRegex = new RegExp(headUnion.source, headUnion.flags.includes('g') ? headUnion.flags : `${headUnion.flags}g`)[m
[32m+[m
[32m+[m[32m  const caches = {[m
[32m+[m[32m    titles: compilePatterns(pack.title_patterns),[m
[32m+[m[32m    chapters: compilePatterns(pack.chapter_patterns),[m
[32m+[m[32m    sections: compilePatterns(pack.section_patterns),[m
[32m+[m[32m    articles: compilePatterns(pack.article_patterns),[m
[32m+[m[32m    disposGroups: compilePatterns(pack.dispositions_groups?.map((g) => g.group_pattern)),[m
[32m+[m[32m    disposItems: compilePatterns(pack.dispositions_groups?.map((g) => g.item_pattern)),[m
[32m+[m[32m  }[m
[32m+[m
[32m+[m[32m  const pageData = pages.map((p) => ({[m
[32m+[m[32m    num: p.num,[m
[32m+[m[32m    lines: normalizeText(p.text).split(/\r?\n/),[m
[32m+[m[32m  }))[m
[32m+[m
[32m+[m[32m  const headers: HeaderHit[] = [][m
[32m+[m[32m  pageData.forEach((page, pageIndex) => {[m
[32m+[m[32m    page.lines.forEach((rawLine, lineIndex) => {[m
[32m+[m[32m      const line = rawLine.trim()[m
[32m+[m[32m      if (!line) return[m
[32m+[m[32m      if (!looksLikeStandaloneHeader(rawLine)) return[m
[32m+[m[32m      headRegex.lastIndex = 0[m
[32m+[m[32m      if (!headRegex.test(line)) return[m
[32m+[m[32m      const kind = classifyHeader(line, pack, caches)[m
[32m+[m[32m      if (!kind) return[m
[32m+[m[32m      headers.push({ kind, label: line.replace(/\s+/g, ' ').trim(), pageIndex, lineIndex, pageNum: page.num })[m
[32m+[m[32m    })[m
[32m+[m[32m  })[m
[32m+[m
[32m+[m[32m  if (!headers.length) return [][m
[32m+[m
[32m+[m[32m  headers.sort((a, b) => (a.pageIndex === b.pageIndex ? a.lineIndex - b.lineIndex : a.pageIndex - b.pageIndex))[m
[32m+[m
[32m+[m[32m  const units: LegalUnit[] = [][m
[32m+[m
[32m+[m[32m  const first = headers[0][m
[32m+[m[32m  if (first.pageIndex > 0 || first.lineIndex > 0) {[m
[32m+[m[32m    const pre = collectText(pageData, { pageIndex: 0, lineIndex: 0 }, { pageIndex: first.pageIndex, lineIndex: first.lineIndex })[m
[32m+[m[32m    if (pre.text.trim().length) {[m
[32m+[m[32m      units.push({ unidad: 'Contenido previo', startPage: pre.startPage, endPage: pre.endPage, text: pre.text, kind: undefined })[m
[32m+[m[32m    }[m
[32m+[m[32m  }[m
[32m+[m
[32m+[m[32m  for (let i = 0; i < headers.length; i += 1) {[m
[32m+[m[32m    const start = headers[i][m
[32m+[m[32m    const next = headers[i + 1][m
[32m+[m[32m    const collected = collectText([m
[32m+[m[32m      pageData,[m
[32m+[m[32m      { pageIndex: start.pageIndex, lineIndex: start.lineIndex },[m
[32m+[m[32m      next ? { pageIndex: next.pageIndex, lineIndex: next.lineIndex } : undefined,[m
[32m+[m[32m    )[m
[32m+[m[32m    const text = collected.text.trim()[m
[32m+[m[32m    if (!text) continue[m
[32m+[m[32m    units.push({ unidad: start.label, startPage: collected.startPage, endPage: collected.endPage, text, kind: start.kind })[m
[32m+[m[32m  }[m
[32m+[m
[32m+[m[32m  return units[m
 }[m
 [m
[31m-export type LegalUnit = { unidad: string; startPage: number; endPage: number; text: string }[m
[32m+[m[32m// Legacy segmented units kept for backward compatibility[m
[32m+[m[32mexport const RX = {[m
[32m+[m[32m  titulo: /^T[ÍI]TULO\s+(PRELIMINAR|[IVXLC]+)\b.*$/i,[m
[32m+[m[32m  cap: /^CAP[ÍI]TULO\s+([IVXLC]+|PRIMERO|SEGUNDO|TERCERO|CUARTO|QUINTO|SEXTO|S[ÉE]PTIMO|OCTAVO|NOVENO|D[ÉE]CIMO)\b.*$/i,[m
[32m+[m[32m  sec: /^Secci[oó]n\s+\d+\.ª\b.*$/i,[m
[32m+[m[32m  dispGroup: /^Disposiciones\s+(adicionales|transitorias|derogatorias|finales)\b.*$/i,[m
[32m+[m[32m  disp: /^Disposici[oó]n\s+(adicional|transitoria|derogatoria|final)\s+([A-Za-záéíóúñ]+|\d+\.ª)\b.*$/i,[m
[32m+[m[32m  articulo: /^Art[íi]culo\s+\d+[A-Za-z]?\.?\b.*$/i,[m
[32m+[m[32m  preambulo: /^PRE[ÁA]MBULO\b.*$/i,[m
[32m+[m[32m  heading: /^([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\s\d\.,;:-]{6,})$/,[m
[32m+[m[32m}[m
 [m
[31m-export function segmentLegalUnits(pages: { num: number; text: string }[]): LegalUnit[] {[m
[32m+[m[32m// Existing segmenter retained for other parts of the codebase[m
[32m+[m[32mexport function segmentLegalUnits(pages: Array<{ num: number; text: string }>): LegalUnit[] {[m
   const units: LegalUnit[] = [][m
   let current: LegalUnit | null = null[m
[31m-  for (const p of pages) {[m
[31m-    const text = normalizePageText(p.text)[m
[31m-    const lines = text.split('\n')[m
[31m-    for (const line of lines) {[m
[31m-      const header = RX.titulo.test(line) || RX.capitulo.test(line) || RX.seccion.test(line) || RX.disp.test(line)[m
[31m-      if (header) {[m
[32m+[m
[32m+[m[32m  for (const page of pages) {[m
[32m+[m[32m    const lines = (page.text || '')[m
[32m+[m[32m      .split(/\n+/)[m
[32m+[m[32m      .map((s) => s.trim())[m
[32m+[m[32m      .filter(Boolean)[m
[32m+[m
[32m+[m[32m    for (const rawLine of lines) {[m
[32m+[m[32m      const line = rawLine.replace(/\s+/g, ' ').trim()[m
[32m+[m[32m      const heading = (() => {[m
[32m+[m[32m        if (RX.preambulo.test(line)) return { kind: 'preambulo', label: line }[m
[32m+[m[32m        if (RX.titulo.test(line)) return { kind: 'titulo', label: line }[m
[32m+[m[32m        if (RX.cap.test(line)) return { kind: 'capitulo', label: line }[m
[32m+[m[32m        if (RX.sec.test(line)) return { kind: 'seccion', label: line }[m
[32m+[m[32m        if (RX.dispGroup.test(line)) return { kind: 'disposiciones', label: line }[m
[32m+[m[32m        if (RX.disp.test(line)) return { kind: 'disposicion', label: line }[m
[32m+[m[32m        if (RX.heading.test(line)) return { kind: 'heading', label: line }[m
[32m+[m[32m        if (RX.articulo.test(line)) return { kind: 'articulo', label: line }[m
[32m+[m[32m        return null[m
[32m+[m[32m      })()[m
[32m+[m
[32m+[m[32m      if (heading) {[m
[32m+[m[32m        if (heading.kind === 'preambulo') {[m
[32m+[m[32m          if (current) {[m
[32m+[m[32m            current.endPage = page.num[m
[32m+[m[32m            units.push(current)[m
[32m+[m[32m          }[m
[32m+[m[32m          current = null[m
[32m+[m[32m          continue[m
[32m+[m[32m        }[m
[32m+[m[32m        if (heading.kind === 'articulo') {[m
[32m+[m[32m          if (!current) {[m
[32m+[m[32m            current = {[m
[32m+[m[32m              unidad: 'Contenido previo',[m
[32m+[m[32m              startPage: page.num,[m
[32m+[m[32m              endPage: page.num,[m
[32m+[m[32m              text: '',[m
[32m+[m[32m            }[m
[32m+[m[32m          }[m
[32m+[m[32m          current.text += (current.text ? '\n' : '') + heading.label[m
[32m+[m[32m          continue[m
[32m+[m[32m        }[m
[32m+[m[32m        if (heading.kind === 'heading') {[m
[32m+[m[32m          if (!current) {[m
[32m+[m[32m            current = {[m
[32m+[m[32m              unidad: heading.label,[m
[32m+[m[32m              startPage: page.num,[m
[32m+[m[32m              endPage: page.num,[m
[32m+[m[32m              text: heading.label + '\n',[m
[32m+[m[32m            }[m
[32m+[m[32m          } else {[m
[32m+[m[32m            current.text += (current.text ? '\n' : '') + heading.label[m
[32m+[m[32m          }[m
[32m+[m[32m          continue[m
[32m+[m[32m        }[m
         if (current) {[m
[31m-          current.endPage = p.num[m
[32m+[m[32m          current.endPage = page.num[m
           units.push(current)[m
         }[m
[31m-        current = { unidad: line.trim(), startPage: p.num, endPage: p.num, text: line + '\n' }[m
[31m-      } else {[m
[31m-        if (!current) current = { unidad: 'Preámbulo / Portada', startPage: p.num, endPage: p.num, text: '' }[m
[31m-        current.text += line + '\n'[m
[32m+[m[32m        current = {[m
[32m+[m[32m          unidad: heading.label,[m
[32m+[m[32m          startPage: page.num,[m
[32m+[m[32m          endPage: page.num,[m
[32m+[m[32m          text: heading.label + '\n',[m
[32m+[m[32m        }[m
[32m+[m[32m        continue[m
[32m+[m[32m      }[m
[32m+[m
[32m+[m[32m      if (!current) {[m
[32m+[m[32m        current = {[m
[32m+[m[32m          unidad: 'Contenido previo',[m
[32m+[m[32m          startPage: page.num,[m
[32m+[m[32m          endPage: page.num,[m
[32m+[m[32m          text: '',[m
[32m+[m[32m        }[m
       }[m
[32m+[m[32m      current.text += (current.text ? '\n' : '') + rawLine[m
     }[m
[31m-    if (current) current.endPage = p.num[m
[32m+[m
[32m+[m[32m    if (current) current.endPage = page.num[m
   }[m
[31m-  if (current) units.push(current)[m
[31m-  return units[m
[32m+[m
[32m+[m[32m  if (current) {[m
[32m+[m[32m    units.push(current)[m
[32m+[m[32m  }[m
[32m+[m
[32m+[m[32m  const filtered = units.filter((u) => {[m
[32m+[m[32m    const name = u.unidad.toLowerCase()[m
[32m+[m[32m    if (!u.text.trim()) return false[m
[32m+[m[32m    if (/pre[áa]mbulo/.test(name)) return false[m
[32m+[m[32m    if (/contenido previo/.test(name) && u.text.trim().length < 200) return false[m
[32m+[m[32m    return true[m
[32m+[m[32m  })[m
[32m+[m
[32m+[m[32m  return filtered[m
 }[m
 [m
 [m
