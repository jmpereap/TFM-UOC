import { NextResponse } from 'next/server'
import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'
import { distributeQuestions, distributeByDifficulty, type DifficultyDistribution } from 'lib/qa/distribute'
import { buildPrompt } from 'lib/qa/prompt'
import { callModel, type MCQItem } from 'lib/qa/callModel'
import { logEvent } from 'lib/logging/logger'
import { truncateByChars } from 'lib/utils/truncate'
import { withLimit } from 'lib/utils/withLimit'

type Block = { index: number; startPage: number; endPage: number; text: string }

const InputSchema = z.object({
  lawName: z.string().min(1),
  n: z.number().int().min(1).max(20),
  blocks: z
    .array(
      z.object({
        index: z.number().int().min(0),
        startPage: z.number().int().min(1),
        endPage: z.number().int().min(1),
        text: z.string().min(1),
      }),
    )
    .min(1),
  difficultyDistribution: z
    .object({
      basico: z.number().int().min(0),
      medio: z.number().int().min(0),
      avanzado: z.number().int().min(0),
    })
    .optional(),
})

export const runtime = 'nodejs'

export async function POST(req: Request) {
  const reqId = uuidv4()
  const t0 = Date.now()
  try {
    const json = await req.json()
    const { lawName, n, blocks, difficultyDistribution } = InputSchema.parse(json)
    const m = blocks.length
    
    // Si hay distribución de dificultad, usarla; si no, distribuir uniformemente
    let plan: number[]
    let difficultyPlan: DifficultyDistribution[] | null = null
    
    if (difficultyDistribution) {
      const total = difficultyDistribution.basico + difficultyDistribution.medio + difficultyDistribution.avanzado
      if (total !== n) {
        return NextResponse.json(
          { ok: false, error: `La suma de dificultades (${total}) debe ser igual a n (${n})` },
          { status: 400 }
        )
      }
      difficultyPlan = distributeByDifficulty(difficultyDistribution, m)
      // Calcular el total de preguntas por bloque
      plan = difficultyPlan.map(d => d.basico + d.medio + d.avanzado)
    } else {
      plan = distributeQuestions(n, m)
    }

    const tasks: Array<() => Promise<MCQItem[]>> = blocks.map((b, i) => async () => {
      const qi = plan[i]
      if (!qi) return []
      const pagesRange = `p. ${b.startPage}–${b.endPage}`
      const safeText = truncateByChars(b.text, 10000)
      const blockDifficultyDist = difficultyPlan ? difficultyPlan[i] : undefined
      const prompt = buildPrompt({ 
        lawName, 
        pagesRange, 
        blockText: safeText, 
        n: qi,
        difficultyDistribution: blockDifficultyDist
      })
      const pChars = prompt.length
      try {
        const itemsRaw = await callModel(prompt, 20000)
        const items = itemsRaw.map((it) => ({
          ...it,
          referencia: {
            ley: lawName,
            paginas: pagesRange,
            articulo: it.referencia?.articulo,
            parrafo: it.referencia?.parrafo,
          },
        }))
        logEvent('generate.block.success', {
          reqId,
          blockIndex: b.index,
          count: items.length,
          promptChars: pChars,
          responseChars: JSON.stringify(items).length,
          difficultyDistribution: blockDifficultyDist,
          itemsByDifficulty: {
            basico: items.filter(i => i.difficulty === 'basico').length,
            medio: items.filter(i => i.difficulty === 'medio').length,
            avanzado: items.filter(i => i.difficulty === 'avanzado').length,
          }
        })
        return items
      } catch (err) {
        logEvent('generate.block.error', {
          reqId,
          blockIndex: b.index,
          error: String(err),
        })
        return []
      }
    })

    const parts = await withLimit(4, tasks)
    const allItems = parts.flat()

    // Deduplicate por pregunta y recortar a n
    const seen = new Set<string>()
    const deduped: MCQItem[] = []
    for (const q of allItems) {
      const key = q.pregunta.trim().toLowerCase()
      if (!key) continue
      if (!seen.has(key)) {
        seen.add(key)
        deduped.push(q)
      }
      if (deduped.length >= n) break
    }

    if (deduped.length === 0) {
      const dt = Date.now() - t0
      logEvent('generate.empty', { reqId, latencyMs: dt, requested: n })
      return NextResponse.json({ ok: false, error: 'Sin preguntas generadas' }, { status: 502 })
    }

    const dt = Date.now() - t0
    logEvent('generate.done', { reqId, latencyMs: dt, requested: n, returned: deduped.length })

    return NextResponse.json({ ok: true, items: deduped })
  } catch (err: unknown) {
    const dt = Date.now() - t0
    logEvent('generate.error', { reqId, latencyMs: dt, error: String(err) })
    if (err instanceof z.ZodError) {
      return NextResponse.json({ ok: false, error: err.flatten() }, { status: 400 })
    }
    return NextResponse.json({ ok: false, error: 'Error generando preguntas' }, { status: 500 })
  }
}

