import { NextRequest, NextResponse } from 'next/server'
import { withLimit } from '@/lib/utils/withLimit'
import { logEvent } from '@/lib/logging/logger'
import { randomUUID } from 'node:crypto'
import { smartTruncateLegal } from '@/lib/utils/textBudget'
import { callModelJSON } from '@/lib/qa/callModel'
import { segmentLegalUnits } from '@/lib/utils/legalSegment'
import { buildMapPromptLite, buildMapPromptRich, buildReducePrompt, buildFastStructuredPromptV2 } from '@/lib/qa/promptsSummary'
import { pickStratified, extractiveSlice } from '@/lib/utils/fastSummary'
import { detectFrontMatter, defaultFrontmatterConfig } from '@/lib/legal/frontmatter'

type Block = { index: number; startPage: number; endPage: number; text: string }

export const runtime = 'nodejs'

// Prompts importados desde lib/qa/promptsSummary

function chunk<T>(arr: T[], size: number) {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

export async function POST(req: NextRequest) {
  const reqId = randomUUID()
  const t0 = Date.now()
  try {
    const body = await req.json()
    const { lawName, fileHash, pagesFull, blocks, mode = 'estructurado', length = 'largo', summaryMode = 'exhaustivo' } = body || {}
    const norm = (x: string) => (x || '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')
    const _mode = norm(mode), _length = norm(length), _summaryMode = norm(summaryMode)
    const hasPages = Array.isArray(pagesFull) && pagesFull?.length > 0
    const hasBlocks = Array.isArray(blocks) && blocks?.length > 0
    if (!hasPages && !hasBlocks) {
      return NextResponse.json({ ok: false, error: 'No blocks/pages' }, { status: 400 })
    }

    const CONCURRENCY = Number(process.env.SUMMARY_CONCURRENCY ?? 6)
    const MAP_TIMEOUT_MS = Number(process.env.SUMMARY_MAP_TIMEOUT_MS ?? 28000)
    const GROUP_SIZE = Number(process.env.SUMMARY_GROUP_SIZE ?? 6)

    const rawPages = hasPages
      ? (pagesFull as Array<{ num: number; text: string }>)
      : (blocks as Block[]).map((b, i) => ({ num: b.startPage ?? i + 1, text: (b as any).text }))

    const frontCfg = defaultFrontmatterConfig()
    const frontMatter = detectFrontMatter(rawPages, frontCfg)
    const firstBodyIdx = rawPages.findIndex((p) => /Art[íi]culo\s+1\b/i.test(p.text) || /T[ÍI]TULO\s+PRELIMINAR/i.test(p.text))
    if (firstBodyIdx > 0) {
      for (let i = 0; i < firstBodyIdx; i += 1) {
        frontMatter.add(rawPages[i].num)
      }
    }
    const pages = rawPages.filter((p) => !frontMatter.has(p.num))
    const effectivePages = pages.length ? pages : rawPages

    // Coherencia básica nombre/contenido (p.ej., CE vs Estatut)
    try {
      const head = effectivePages.slice(0, 5).map((p) => p.text).join('\n').toLowerCase()
      if (/constituci[óo]n espa[nñ]ola/.test(head) && /estatuto/i.test(String(lawName))) {
        return NextResponse.json({ ok: false, error: 'Nombre vs contenido no coinciden (CE detectada).' }, { status: 422 })
      }
    } catch {}

    const units = segmentLegalUnits(effectivePages).map((u) => ({
      ...u,
      startPage: u.startPage ?? 1,
      endPage: u.endPage ?? u.startPage ?? 1,
    }))

    // Fast-path: estructurado corto rápido → un solo llamado
    const FAST_BUDGET = Number(process.env.FAST_SUMMARY_CHAR_BUDGET ?? 12000)
    const FAST_K = Number(process.env.FAST_UNITS_K ?? 8)
    const FAST_SLICE = Number(process.env.FAST_UNIT_SLICE ?? 1500)
    const FAST_DL_MS = Number(process.env.FAST_DEADLINE_MS ?? 28000)
    const isFastPath = (_mode === 'estructurado' && _length === 'corto' && _summaryMode === 'rapido')
    if (isFastPath) {
      const chosen = pickStratified(units, FAST_K)
      const snippets: any[] = []
      let used = 0
      for (const u of chosen) {
        const texto = extractiveSlice(u.text, FAST_SLICE)
        const rango = `p. ${u.startPage ?? 'i'}–${u.endPage ?? 'j'}`
        if (used + texto.length > FAST_BUDGET) break
        used += texto.length
        snippets.push({ unidad: u.unidad, rango, texto })
      }
      if (!snippets.length) {
        const outline = units.slice(0, 8).map((u) => ({
          titulo: String((u as any).unidad || '').trim(),
          resumen: String((u as any).text || '').split('\n').slice(0, 3).join(' ').slice(0, 240),
          articulos: Array.from(String((u as any).text || '').matchAll(/ART[ÍI]CULO\s+\d+[A-Za-z]?/g)).slice(0, 6).map((m) => m[0].replace(/\s+/g, ' ')),
        }))
        return NextResponse.json({ ok: true, lawName, mode, length, summary: { tipo: 'estructurado', titular: lawName, resumen: '', puntos_clave: [], estructura: outline, citas: [] }, fast: true, localOutline: true })
      }
      const prompt = buildFastStructuredPromptV2({ lawName, snippets })
      const fast = await callModelJSON(prompt, FAST_DL_MS, 700).catch(() => null)
      if (!fast || !Array.isArray(fast.estructura) || fast.estructura.length < 3) {
        const outline = snippets.map((s) => ({
          titulo: s.unidad,
          resumen: s.texto.split('\n').slice(0, 2).join(' ').slice(0, 200),
          articulos: Array.from(s.texto.matchAll(/ART[ÍI]CULO\s+\d+[A-Za-z]?/g)).slice(0, 5).map((m) => m[0].replace(/\s+/g, ' ')),
        }))
        return NextResponse.json({ ok: true, lawName, mode, length, summary: { tipo: 'estructurado', titular: lawName, resumen: '', puntos_clave: [], estructura: outline, citas: [] }, fast: true, degraded: true })
      }
      logEvent('summarize.fast.done', { reqId, units: chosen.length, used, ms: Date.now() - t0 })
      return NextResponse.json({ ok: true, lawName, mode, length, summary: fast, fast: true, budget: used })
    }
    const useUnits = Array.isArray(units) && units.length > 0
    let itemsForMap: any[] = (summaryMode === 'exhaustivo' && useUnits) ? units : (blocks as any[])

    // Modo rápido: muestreo uniforme y presupuesto global ~40s
    const GLOBAL_CAP_MS = summaryMode === 'rapido' ? 40000 : 120000
    function sampleEvenly<T>(arr: T[], k: number): T[] {
      if (!Array.isArray(arr) || arr.length <= k) return arr
      const out: T[] = []
      const step = (arr.length - 1) / (k - 1)
      for (let i = 0; i < k; i++) out.push(arr[Math.round(i * step)])
      // dedup por referencia si hubiera redondeos repetidos
      return out.filter((v, i, a) => a.indexOf(v) === i)
    }
    if (summaryMode === 'rapido') {
      const MAX_ITEMS = 8
      itemsForMap = sampleEvenly(itemsForMap, MAX_ITEMS)
    }

    const tasks = itemsForMap.map((u: any) => async () => {
      if (Date.now() - t0 > GLOBAL_CAP_MS) {
        logEvent('summarize.map.skip.deadline', { reqId, idx: u.index ?? u.startPage })
        return null
      }
      const range = `p. ${u.startPage}–${u.endPage}`
      const safe = smartTruncateLegal(u.text || u.blockText || '', summaryMode === 'rapido' ? 1800 : 2800)
      const prompt = summaryMode === 'exhaustivo'
        ? buildMapPromptRich({ lawName, unidad: String(u.unidad || 'Unidad'), pagesRange: range, text: safe })
        : buildMapPromptLite({ lawName, pagesRange: range, blockText: safe })
      try {
        const perMapTimeout = summaryMode === 'rapido' ? Math.min(MAP_TIMEOUT_MS, 14000) : MAP_TIMEOUT_MS
        const perMapTokens = summaryMode === 'rapido' ? 160 : (summaryMode === 'exhaustivo' ? 450 : 220)
        const partial = await callModelJSON(prompt, perMapTimeout, perMapTokens)
        logEvent('summarize.map.success', { reqId, idx: u.index ?? u.startPage, ms: Date.now() - t0 })
        return partial
      } catch (e) {
        logEvent('summarize.map.error', { reqId, idx: u.index ?? u.startPage, error: String(e) })
        return null
      }
    })

    const partials = (await withLimit(CONCURRENCY, tasks)).filter(Boolean) as any[]

    // Reduce en 2 niveles
    const groups = chunk(partials, GROUP_SIZE)
    const inter = (
      await withLimit(
        Math.min(CONCURRENCY, 4),
        groups.map((g) => async () => callModelJSON(
          buildReducePrompt({ lawName, partials: g, mode, length }),
          summaryMode === 'rapido' ? 14000 : 24000,
          summaryMode === 'rapido' ? 350 : 600,
        )),
      )
    ).filter(Boolean)

    const finalSummary = await callModelJSON(
      buildReducePrompt({ lawName, partials: inter, mode, length }),
      summaryMode === 'rapido' ? 16000 : 26000,
      summaryMode === 'rapido' ? 500 : 900,
    )

    // Validación de cobertura mínima en modo estructurado
    function validateStructured(summary: any) {
      const ok = summary?.tipo === 'estructurado' && Array.isArray(summary?.estructura)
      const disp = summary?.estructura?.some((x: any) => /disposici[óo]n/i.test(String(x?.titulo)))
      const minTit = (summary?.estructura || []).filter((x: any) => /t[íi]tulo/i.test(String(x?.titulo))).length >= 6
      const citasOk = Array.isArray(summary?.citas) && summary.citas.length >= 6
      return ok && disp && minTit && citasOk
    }

    if (mode === 'estructurado' && !validateStructured(finalSummary)) {
      const retry = await callModelJSON(buildReducePrompt({ lawName, partials: inter, mode, length }), 30000, summaryMode === 'exhaustivo' ? 1100 : 700)
      if (!validateStructured(retry)) {
        // Fallback suave: fusiona estructuras y citas de los intermedios
        const merged = {
          tipo: 'estructurado',
          titular: `Resumen de ${lawName}`,
          resumen: '',
          puntos_clave: [] as string[],
          estructura: [] as any[],
          definiciones: [] as any[],
          derechos: [] as any[],
          obligaciones: [] as any[],
          plazos: [] as any[],
          autoridades: [] as any[],
          sanciones: [] as any[],
          glosario: [] as any[],
          citas: [] as any[],
        }
        const seen = new Set<string>()
        for (const r of inter as any[]) {
          const estr = Array.isArray(r?.estructura) ? r.estructura : []
          for (const e of estr) {
            const key = String(e?.titulo || '').toLowerCase()
            if (!key) continue
            if (seen.has(key)) continue
            seen.add(key)
            merged.estructura.push({ titulo: e?.titulo, resumen: e?.resumen, articulos: e?.articulos || [] })
            if (merged.estructura.length >= 40) break
          }
          if (Array.isArray(r?.citas)) {
            for (const c of r.citas) {
              if (merged.citas.length >= 60) break
              merged.citas.push(c)
            }
          }
        }
        logEvent('summarize.reduce.fallback', { reqId, parts: partials.length, groups: groups.length })
        return NextResponse.json({ ok: true, lawName, mode, length, summary: merged, note: 'fallback' })
      }
      logEvent('summarize.reduce.success.retry', { reqId, parts: partials.length, groups: groups.length, totalMs: Date.now() - t0 })
      return NextResponse.json({ ok: true, lawName, mode, length, summary: retry })
    }

    logEvent('summarize.reduce.success', { reqId, parts: partials.length, groups: groups.length, totalMs: Date.now() - t0 })
    return NextResponse.json({ ok: true, lawName, mode, length, summary: finalSummary })
  } catch (e) {
    logEvent('summarize.error', { reqId, error: String(e) })
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 })
  }
}


