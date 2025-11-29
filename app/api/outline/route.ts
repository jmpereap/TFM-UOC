import { NextRequest, NextResponse } from 'next/server'
import { segmentLegalUnits, segmentLegalUnitsByHeaders, RX, type LegalUnit } from '@/lib/utils/legalSegment'
import { extractArticleSummaries, summarize } from '@/lib/utils/fastSummary'
import { buildOutlinePrompt } from '@/lib/qa/promptsOutline'
import { buildPromptConstitucion } from '@/lib/qa/promptsConstitucion'
import { callModelJSON } from '@/lib/qa/callModel'
import type { Outline, OutlineNode } from '@/types/outline'
import { logEvent } from '@/lib/logging/logger'
import { detectFrontMatter, defaultFrontmatterConfig } from '@/lib/legal/frontmatter'
import { buildDeterministicOutline } from '@/lib/outline/deterministic'
import { loadRulePack } from '@/lib/legal/rulePack'
import { buildFragmentsFromUnits, type Fragment, sliceBySentences, RX_BOE_FOOTER } from '@/lib/legal/fragments'

export const runtime = 'nodejs'

const outlineCache = new Map<string, Outline>()

const EXPECTED_TITLES = [
  'título preliminar',
  'título i',
  'título ii',
  'título iii',
  'título iv',
  'título v',
  'título vi',
  'título vii',
  'título viii',
  'título ix',
  'título x',
]
const EXPECTED_DISPOSITIONS = [
  'disposiciones adicionales',
  'disposiciones transitorias',
  'disposiciones derogatorias',
  'disposiciones finales',
]

function slugify(label: string, fallback: string) {
  const slug = (label || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || fallback
}

function nodeKindFromHeading(heading: string): OutlineNode['kind'] {
  const lower = heading.toLowerCase()
  if (RX.titulo.test(heading) || /t[íi]tulo/.test(lower)) return 'titulo'
  if (RX.cap.test(heading)) return 'capitulo'
  if (RX.sec.test(heading)) return 'seccion'
  if (RX.disp.test(heading)) return 'disposicion'
  return 'concepto'
}

function buildFallbackOutline(lawName: string, units: LegalUnit[]): Outline {
  const root: Outline = { root: { id: 'root', label: lawName, kind: 'root', children: [] } }
  for (const unit of units) {
    const heading = unit.unidad || 'Sección'
    const kind = nodeKindFromHeading(heading)
    const id = slugify(heading, `${kind}-${unit.startPage}`)
    const pages = `p. ${unit.startPage}–${unit.endPage}`
    const articleSummaries = extractArticleSummaries(unit.text, 6)
    const conceptSummary = summarize(unit.text, 180)
    const children: OutlineNode[] = []
    for (const art of articleSummaries) {
      children.push({
        id: `${id}-${slugify(art.articulo, 'art')}`,
        label: `${art.articulo}: ${art.resumen}`.slice(0, 120),
        kind: 'articulo',
        articulos: [art.articulo],
      })
    }
    if (!children.length && conceptSummary) {
      children.push({
        id: `${id}-concepto`,
        label: conceptSummary,
        kind: 'concepto',
      })
    }
    root.root.children!.push({
      id,
      label: heading,
      kind,
      pages,
      articulos: articleSummaries.map((a) => a.articulo),
      children,
    })
  }
  return root
}

function normalizeLabel(label: string) {
  return (label || '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')
}

function validateCoverage(outline: Outline | null) {
  if (!outline?.root?.children?.length) return false
  const titles = outline.root.children.filter((c) => c.kind === 'titulo').map((c) => normalizeLabel(c.label))
  const missingTitles = EXPECTED_TITLES.filter((title) => !titles.some((label) => label.includes(title)))
  if (missingTitles.length > 0) {
    return false
  }
  const disposGroups = outline.root.children.filter((c) => c.kind === 'disposiciones').map((c) => normalizeLabel(c.label))
  const missingDispos = EXPECTED_DISPOSITIONS.filter((disp) => !disposGroups.some((label) => label.includes(disp)))
  if (missingDispos.length > 0) {
    return false
  }
  return true
}

export async function POST(req: NextRequest) {
  try {
    const { lawName, pagesFull, blocks, fileHash } = await req.json()
    const cacheKey = fileHash ? String(fileHash) : null
    if (cacheKey && outlineCache.has(cacheKey)) {
      return NextResponse.json({ ok: true, outline: outlineCache.get(cacheKey), cached: true })
    }

    const rawPages = Array.isArray(pagesFull) && pagesFull.length
      ? pagesFull
      : Array.isArray(blocks)
        ? blocks.map((b: any, i: number) => ({ num: b.startPage ?? i + 1, text: b.text }))
        : []

    if (!rawPages.length) {
      return NextResponse.json({ ok: false, error: 'Sin texto para generar esquema' }, { status: 400 })
    }

    const frontCfg = defaultFrontmatterConfig()
    const frontMatter = detectFrontMatter(rawPages as Array<{ num: number; text: string }>, frontCfg)
    const firstBodyIdx = rawPages.findIndex((p: { num: number; text: string }) => /Art[íi]culo\s+1\b/i.test(p.text) || /T[ÍI]TULO\s+PRELIMINAR/i.test(p.text))
    if (firstBodyIdx > 0) {
      for (let i = 0; i < firstBodyIdx; i += 1) {
        frontMatter.add(rawPages[i].num)
      }
    }
    const rawPagesArray = rawPages as Array<{ num: number; text: string }>
    const pages = rawPagesArray.filter((p) => !frontMatter.has(p.num))
    if (frontMatter.size) {
      logEvent('outline.frontmatter.filtered', { count: frontMatter.size, pages: Array.from(frontMatter) })
    }
    const logPages = pages.length ? pages : rawPagesArray
    logPages.slice(0, 2).forEach((p) => {
      logEvent('outline.page.sample', { num: p.num, text: (p.text || '').slice(0, 200) })
    })
    const effectivePages = pages.length ? pages : rawPagesArray

    const normName = (lawName || '')
       .toLowerCase()
       .normalize('NFD')
       .replace(/\p{Diacritic}/gu, '')
     let prompt: string
    const isConstitucion = /constitucion\s+espanola/.test(normName)
    const pack = loadRulePack('ley')

    const buildFragments = (maxFragments: number, sliceChars: number) => {
      const res = buildFragmentsFromUnits(effectivePages, pack, { maxFragments, sliceChars })
      const filtered = res.fragments.filter((f) => !/^Contenido previo/i.test(f.text))
      return { fragments: filtered, units: res.units }
    }

    const ensureDispoFragment = (fragments: Array<{ pages: string; text: string }>, units: LegalUnit[], sliceChars: number) => {
      if (fragments.some((f) => /Disposici[óo]n/i.test(f.text))) return
      const dispoUnit = units.find((u) => /disposici/.test((u.unidad || '').toLowerCase()))
      if (!dispoUnit) return
      let txt = (dispoUnit.text || '').replace(RX_BOE_FOOTER, '').trim()
      if (!txt) return
      const lines = txt.split(/\n+/).map((l) => l.trim()).filter(Boolean)
      const head = lines[0] || dispoUnit.unidad
      const rest = sliceBySentences(lines.slice(1).join('\n'), Math.max(200, sliceChars - head.length - 1))
      const snippet = rest ? `${head}\n${rest}` : head
      fragments.push({
        pages: `p. ${dispoUnit.startPage}${dispoUnit.endPage && dispoUnit.endPage !== dispoUnit.startPage ? `–${dispoUnit.endPage}` : ''}`,
        text: snippet.slice(0, sliceChars),
      })
    }

    const evaluateCoverage = (candidate: any) => {
      if (!candidate?.root?.children?.length) {
        return { ok: false, missingTitles: EXPECTED_TITLES, missingDispos: EXPECTED_DISPOSITIONS, nodes: 0 }
      }
      const titles = candidate.root.children.filter((c: any) => c.kind === 'titulo').map((c: any) => normalizeLabel(c.label))
      const missingTitles = isConstitucion
        ? EXPECTED_TITLES.filter((title) => !titles.some((label: string) => label.startsWith(normalizeLabel(title))))
        : []
      const disposGroups = candidate.root.children.filter((c: any) => c.kind === 'disposiciones').map((c: any) => normalizeLabel(c.label))
      const missingDispos = isConstitucion
        ? EXPECTED_DISPOSITIONS.filter((disp) => !disposGroups.some((label: string) => label.includes(normalizeLabel(disp))))
        : []
      const countNodes = (node: any): number => {
        if (!node) return 0
        const children = Array.isArray(node.children) ? node.children : []
        return 1 + children.reduce((sum: number, child: any) => sum + countNodes(child), 0)
      }
      const nodes = countNodes(candidate.root)
      return { ok: !missingTitles.length && !missingDispos.length, missingTitles, missingDispos, nodes }
    }

    const TO = Number(process.env.FAST_DEADLINE_MS ?? 28000)
    const baseFragments = buildFragments(isConstitucion ? 16 : 12, isConstitucion ? 1900 : 1500)
    const fallbackPages = effectivePages.length ? effectivePages : rawPagesArray

    if (!baseFragments.fragments.length) {
      const outline = isConstitucion
        ? buildDeterministicOutline(lawName, fallbackPages, pack)
        : buildFallbackOutline(lawName, segmentLegalUnits(fallbackPages))
      let childrenCount = outline.root?.children?.length ?? 0
      if (childrenCount === 0) {
        const basicFallback = buildFallbackOutline(lawName, segmentLegalUnits(fallbackPages))
        childrenCount = basicFallback.root?.children?.length ?? 0
        if (cacheKey) outlineCache.set(cacheKey, basicFallback)
        logEvent('outline.fallback', { lawName, reason: 'no_fragments', strategy: 'fallback-basic', nodes: childrenCount })
        return NextResponse.json({ ok: true, outline: basicFallback, degraded: true })
      }
      if (cacheKey) outlineCache.set(cacheKey, outline)
      logEvent('outline.fallback', { lawName, reason: 'no_fragments', strategy: isConstitucion ? 'deterministic' : 'generic', nodes: childrenCount })
      return NextResponse.json({ ok: true, outline, degraded: true })
    }

    const attempts: Array<{ fragments: Fragment[]; units: LegalUnit[]; maxTokens: number; label: string }> = []
    attempts.push({ fragments: baseFragments.fragments, units: baseFragments.units, maxTokens: isConstitucion ? 1000 : 700, label: 'base' })

    const runAttempt = async (fragments: Fragment[], attemptLabel: string, maxTokens: number) => {
      const fragmentsJson = JSON.stringify(fragments)
      logEvent('outline.fragments', { lawName, attempt: attemptLabel, count: fragments.length, bytes: fragmentsJson.length })
      if (isConstitucion) {
        logEvent('outline.prompt.strategy', { lawName, strategy: 'constitucion', fragments: fragments.length })
        const { system, user } = buildPromptConstitucion(fragments)
        prompt = `${system}\n\n${user}`
      } else {
        prompt = buildOutlinePrompt({ lawName, snippets: fragments.map((f) => ({ unidad: '', rango: f.pages, texto: f.text })) })
      }
      return callModelJSON(prompt, TO, maxTokens, {
        endpoint: 'outline',
        attempt: attemptLabel,
        lawName,
        fragments: fragments.length,
      }).catch(() => null)
    }

    const results: Array<{ outline: any; coverage: ReturnType<typeof evaluateCoverage>; attempt: string }> = []

    for (let i = 0; i < attempts.length; i += 1) {
      const attemptInfo = attempts[i]
      const tree = await runAttempt(attemptInfo.fragments, attemptInfo.label, attemptInfo.maxTokens)
      const coverage = evaluateCoverage(tree)
      results.push({ outline: tree, coverage, attempt: attemptInfo.label })
      logEvent('outline.response', { lawName, attempt: attemptInfo.label, nodes: coverage.nodes, missingTitles: coverage.missingTitles, missingDispos: coverage.missingDispos })
      if (coverage.ok) {
        if (cacheKey) outlineCache.set(cacheKey, tree as Outline)
        return NextResponse.json({ ok: true, outline: tree as Outline, degraded: false })
      }

      if (isConstitucion && attempts.length === 1 && coverage.missingTitles.length >= 3) {
        const expanded = buildFragments(isConstitucion ? 20 : 14, isConstitucion ? 2200 : 1700)
        attempts.push({ fragments: expanded.fragments, units: expanded.units, maxTokens: 1050, label: 'retry-titles' })
        continue
      }

      if (isConstitucion && coverage.missingDispos.length && attempts.length === 1) {
        const cloned = { fragments: [...attemptInfo.fragments], units: attemptInfo.units }
        ensureDispoFragment(cloned.fragments, cloned.units, isConstitucion ? 2200 : 1700)
        attempts.push({ fragments: cloned.fragments, units: cloned.units, maxTokens: 1050, label: 'retry-dispos' })
        continue
      }
    }

    const outline = isConstitucion
      ? buildDeterministicOutline(lawName, fallbackPages, pack)
      : buildFallbackOutline(lawName, segmentLegalUnits(fallbackPages))
    let childrenCount = outline.root?.children?.length ?? 0
    if (childrenCount === 0) {
      const basicFallback = buildFallbackOutline(lawName, segmentLegalUnits(fallbackPages))
      childrenCount = basicFallback.root?.children?.length ?? 0
      if (cacheKey) outlineCache.set(cacheKey, basicFallback)
      logEvent('outline.fallback', { lawName, reason: 'degraded-empty', strategy: 'fallback-basic', nodes: childrenCount })
      return NextResponse.json({ ok: true, outline: basicFallback, degraded: true })
    }
    if (cacheKey) outlineCache.set(cacheKey, outline)
    logEvent('outline.fallback', { lawName, reason: 'degraded', strategy: isConstitucion ? 'deterministic' : 'generic', nodes: childrenCount })
    return NextResponse.json({ ok: true, outline, degraded: true })
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}
