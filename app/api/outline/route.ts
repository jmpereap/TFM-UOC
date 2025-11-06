import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { segmentLegalUnits, RX } from '@/lib/utils/legalSegment'
import { pickStratified, extractiveSlice, extractArticleSummaries, summarize } from '@/lib/utils/fastSummary'
import { buildOutlinePrompt } from '@/lib/qa/promptsOutline'
import { callModelJSON } from '@/lib/qa/callModel'
import type { Outline, OutlineNode } from '@/types/outline'
import { logEvent } from '@/lib/logging/logger'

export const runtime = 'nodejs'

function slugify(input: string, fallback: string) {
  const slug = (input || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || fallback
}

function buildFallbackOutline(lawName: string, units: any[]): Outline {
  const root: Outline = { root: { id: 'root', label: lawName, kind: 'root', children: [] } }
  let titleCount = 0
  let chapterCount = 0
  let conceptCount = 0

  let currentTitle: OutlineNode | null = null
  let currentChapter: OutlineNode | null = null

  const ensureTitle = () => {
    if (!currentTitle) {
      const id = `titulo-${++titleCount}`
      currentTitle = {
        id,
        label: 'Preámbulo / Portada',
        kind: 'titulo',
        children: [],
      }
      root.root.children!.push(currentTitle)
    }
  }

  for (const u of units) {
    const heading = String(u.unidad || '').trim()
    const lower = heading.toLowerCase()
    const pages = `p. ${u.startPage ?? 'i'}–${u.endPage ?? 'j'}`
    const articles = extractArticleSummaries(u.text, 8)
    const articleNodes: OutlineNode[] = articles.map((a, idx) => ({
      id: `art-${slugify(a.articulo, `${conceptCount}-${idx}`)}`,
      label: `${a.articulo}: ${a.resumen}`.slice(0, 100),
      kind: 'articulo',
      articulos: [a.articulo],
    }))

    if (RX.titulo.test(heading) || /t[íi]tulo\s+/i.test(heading)) {
      const id = `titulo-${slugify(heading, `${++titleCount}`)}`
      currentTitle = {
        id,
        label: heading || `Título ${++titleCount}`,
        kind: 'titulo',
        pages,
        children: [...articleNodes],
      }
      root.root.children!.push(currentTitle)
      currentChapter = null
      continue
    }

    if (RX.capitulo.test(heading)) {
      ensureTitle()
      const id = `cap-${slugify(heading, `${++chapterCount}`)}`
      currentChapter = {
        id,
        label: heading,
        kind: 'capitulo',
        pages,
        children: [...articleNodes],
      }
      currentTitle!.children = currentTitle!.children || []
      currentTitle!.children!.push(currentChapter)
      continue
    }

    if (RX.seccion.test(heading)) {
      ensureTitle()
      const id = `sec-${slugify(heading, `${++chapterCount}`)}`
      const sectionNode: OutlineNode = {
        id,
        label: heading,
        kind: 'seccion',
        pages,
        children: [...articleNodes],
      }
      const parent = currentChapter || currentTitle
      if (parent) {
        parent.children = parent.children || []
        parent.children!.push(sectionNode)
      } else {
        root.root.children!.push(sectionNode)
      }
      continue
    }

    if (RX.disp.test(heading)) {
      const id = `disp-${slugify(heading, `${++titleCount}`)}`
      const node: OutlineNode = {
        id,
        label: heading,
        kind: 'disposicion',
        pages,
        children: [...articleNodes],
      }
      if (!node.children?.length) {
        const summary = extractArticleSummaries(u.text, 6)[0]?.resumen || ''
        if (summary) {
          node.children = [{
            id: `${id}-concepto`,
            label: summary,
            kind: 'concepto',
          }]
        }
      }
      root.root.children!.push(node)
      continue
    }

    // Concepto genérico dentro del contexto actual
    ensureTitle()
    const parent = currentChapter || currentTitle
    const summary = heading || extractArticleSummaries(u.text, 6)[0]?.resumen || ''
    if (!summary) continue
    const id = `concepto-${slugify(summary.slice(0, 40), `${++conceptCount}`)}`
    const conceptNode: OutlineNode = {
      id,
      label: summary.slice(0, 90),
      kind: 'concepto',
      pages,
      children: articleNodes.length ? articleNodes : undefined,
    }
    parent!.children = parent!.children || []
    parent!.children!.push(conceptNode)
  }

  return root
}

export async function POST(req: NextRequest) {
  const reqId = randomUUID()
  const t0 = Date.now()
  let lawLabel = 'Documento'
  try {
    const body = await req.json()
    const { lawName, pagesFull, blocks } = body || {}
    lawLabel = lawName || lawLabel
    const pages = Array.isArray(pagesFull) && pagesFull.length
      ? pagesFull
      : Array.isArray(blocks) ? blocks.map((b: any, i: number) => ({ num: b.startPage ?? i + 1, text: b.text })) : []
    if (!pages.length) {
      return NextResponse.json({ ok: false, error: 'Sin páginas para generar esquema' }, { status: 400 })
    }

    const units = segmentLegalUnits(pages).map((u) => ({
      ...u,
      startPage: u.startPage ?? u.num ?? 1,
      endPage: u.endPage ?? u.startPage ?? u.num ?? 1,
    }))

    const FAST_K = Number(process.env.FAST_UNITS_K ?? 12)
    const FAST_SLICE = Number(process.env.FAST_UNIT_SLICE ?? 1800)
    const FAST_BUDGET = Number(process.env.FAST_SUMMARY_CHAR_BUDGET ?? 16000)
    const FAST_DEADLINE = Number(process.env.FAST_DEADLINE_MS ?? 28000)

    const chosen = pickStratified(units, FAST_K)
    const snippets: Array<{ unidad: string; rango: string; texto: string; articulos?: Array<{ articulo: string; resumen: string }> }> = []
    let used = 0
    for (const u of chosen) {
      const articulos = extractArticleSummaries(u.text, 8)
      const resumenUnidad = summarize(u.text, 220)
      const articuloTexto = articulos.map((a) => `${a.articulo}: ${a.resumen}`).join('\n')
      const base = [resumenUnidad ? `Resumen: ${resumenUnidad}` : '', articuloTexto].filter(Boolean).join('\n')
      const textoBase = base || extractiveSlice(u.text, FAST_SLICE)
      const texto = textoBase.slice(0, FAST_SLICE)
      if (!texto) continue
      if (used + texto.length > FAST_BUDGET) break
      used += texto.length
      const rango = `p. ${u.startPage ?? 'i'}–${u.endPage ?? 'j'}`
      snippets.push({ unidad: u.unidad, rango, texto, articulos })
    }

    if (!snippets.length) {
      const outline = buildFallbackOutline(lawName, units)
      return NextResponse.json({ ok: true, outline, fallback: true })
    }

    const prompt = buildOutlinePrompt({ lawName, snippets })
    const outline = await callModelJSON(prompt, FAST_DEADLINE, 800).catch((err) => {
      logEvent('outline.call.error', { reqId, error: String(err) })
      return null
    })

    if (!outline?.root) {
      const fallback = buildFallbackOutline(lawName, chosen)
      logEvent('outline.fallback', { reqId, ms: Date.now() - t0 })
      return NextResponse.json({ ok: true, outline: fallback, degraded: true })
    }

    logEvent('outline.done', { reqId, ms: Date.now() - t0, snippets: snippets.length })
    return NextResponse.json({ ok: true, outline })
  } catch (e) {
    logEvent('outline.error', { reqId, error: String(e) })
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 })
  }
}


