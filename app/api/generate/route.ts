import { NextResponse } from 'next/server'
import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'
import { distributeQuestions, distributeByDifficulty, distributeByPreferredLevel, type DifficultyDistribution } from 'lib/qa/distribute'
import { buildPrompt } from 'lib/qa/prompt'
import { callModel, type MCQItem } from 'lib/qa/callModel'
import { logEvent } from 'lib/logging/logger'
import { truncateByChars } from 'lib/utils/truncate'
import { withLimit } from 'lib/utils/withLimit'

type Block = { index: number; startPage: number; endPage: number; text: string }

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

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
  preferredLevel: z.enum(['basico', 'medio', 'avanzado']).nullable().optional(),
})

export const runtime = 'nodejs'
export const maxDuration = 120 // Aumentar timeout a 120 segundos para permitir bloques grandes con timeout dinámico (hasta 90s)

export async function POST(req: Request) {
  const reqId = uuidv4()
  const t0 = Date.now()
  try {
    const json = await req.json()
    const { lawName, n, blocks, difficultyDistribution, preferredLevel } = InputSchema.parse(json)
    const m = blocks.length
    const requestedQuestions = n

    // Calcular límite máximo por bloque según tamaño de texto
    const perBlockMax = blocks.map((b) => {
      const textLen = typeof b?.text === 'string' ? b.text.length : 0
      return clamp(Math.floor(textLen / 800) + 1, 2, requestedQuestions)
    })
    const totalMaxQuestions = perBlockMax.reduce((acc, val) => acc + val, 0)
    const effectiveQuestions = Math.min(requestedQuestions, totalMaxQuestions)

    if (totalMaxQuestions === 0) {
      logEvent('generate.error', {
        reqId,
        error: 'No hay texto suficiente para generar preguntas',
        perBlockMax,
        totalMaxQuestions,
      })
      console.log('[generate] perBlockMax (no texto suficiente)', { reqId, perBlockMax, totalMaxQuestions })
      return NextResponse.json(
        { ok: false, error: 'El texto es demasiado corto para generar preguntas.' },
        { status: 400 }
      )
    }

    if (effectiveQuestions < requestedQuestions) {
      logEvent('generate.questions.capped', {
        reqId,
        requestedQuestions,
        effectiveQuestions,
        perBlockMax,
        totalMaxQuestions,
      })
      console.log('[generate] perBlockMax (capped)', { reqId, perBlockMax, totalMaxQuestions, requestedQuestions, effectiveQuestions })
    }

    // Log inicial: número de bloques vs preguntas solicitadas
    logEvent('generate.distribution.start', {
      reqId,
      requestedQuestions,
      effectiveQuestions,
      numberOfBlocks: m,
      blocksLessThanQuestions: m < effectiveQuestions,
      preferredLevel: preferredLevel || null,
      hasDifficultyDistribution: !!difficultyDistribution,
      perBlockMax,
      totalMaxQuestions,
    })
    console.log('[generate] perBlockMax', { reqId, perBlockMax, totalMaxQuestions, requestedQuestions, effectiveQuestions })
    
    // Prioridad: preferredLevel > difficultyDistribution > distribución uniforme
    let plan: number[]
    let difficultyPlan: DifficultyDistribution[] | null = null
    
    if (preferredLevel) {
      // Usar distribución por nivel preferido (al menos 90% del nivel seleccionado)
      difficultyPlan = distributeByPreferredLevel(effectiveQuestions, preferredLevel, m)
      // Calcular el total de preguntas por bloque
      plan = difficultyPlan.map(d => d.basico + d.medio + d.avanzado)
    } else if (difficultyDistribution) {
      // Lógica existente: usar distribución manual si está presente
      const total = difficultyDistribution.basico + difficultyDistribution.medio + difficultyDistribution.avanzado
      if (total !== effectiveQuestions) {
        return NextResponse.json(
          { ok: false, error: `La suma de dificultades (${total}) debe ser igual a n (${effectiveQuestions})` },
          { status: 400 }
        )
      }
      difficultyPlan = distributeByDifficulty(difficultyDistribution, m)
      // Calcular el total de preguntas por bloque
      plan = difficultyPlan.map(d => d.basico + d.medio + d.avanzado)
    } else {
      // Distribución uniforme (comportamiento por defecto)
      plan = distributeQuestions(effectiveQuestions, m)
    }
    
    // Log de la distribución resultante
    const planSum = plan.reduce((sum, val) => sum + val, 0)
    logEvent('generate.distribution.result', {
      reqId,
      requestedQuestions,
      effectiveQuestions,
      numberOfBlocks: m,
      distributionPlan: plan,
      distributionSum: planSum,
      distributionByBlock: plan.map((count, idx) => ({
        blockIndex: idx,
        questions: count,
        blockPages: blocks[idx] ? `${blocks[idx].startPage}–${blocks[idx].endPage}` : 'N/A',
      })),
      difficultyPlan: difficultyPlan ? difficultyPlan.map((d, idx) => ({
        blockIndex: idx,
        basico: d.basico,
        medio: d.medio,
        avanzado: d.avanzado,
        total: d.basico + d.medio + d.avanzado,
      })) : null,
    })

    const tasks: Array<() => Promise<MCQItem[]>> = blocks.map((b, i) => async () => {
      const blockStartTime = Date.now()
      const qiPlanned = plan[i]
      const blockCap = perBlockMax[i] ?? requestedQuestions
      if (!qiPlanned) {
        logEvent('generate.block.skipped', {
          reqId,
          blockIndex: i,
          reason: 'no_questions_assigned',
        })
        return []
      }
      const pagesRange = `p. ${b.startPage}–${b.endPage}`
      const safeText = truncateByChars(b.text, 10000)
      const blockTextChars = safeText.length
      const maxQuestionsByText = clamp(Math.floor(blockTextChars / 800) + 1, 2, requestedQuestions)
      const qi = clamp(qiPlanned, 0, Math.min(blockCap, maxQuestionsByText))
      const blockDifficultyDist = difficultyPlan ? difficultyPlan[i] : undefined
      if (!qi) {
        logEvent('generate.block.skipped', {
          reqId,
          blockIndex: i,
          reason: 'no_questions_after_clamp',
          planned: qiPlanned,
          blockCap,
          maxQuestionsByText,
          blockTextChars,
        })
        return []
      }
      const prompt = buildPrompt({
        lawName,
        pagesRange,
        blockText: safeText,
        n: qi,
        difficultyDistribution: blockDifficultyDist,
        preferredLevel: preferredLevel || undefined,
      })
      const pChars = prompt.length
      
      logEvent('generate.block.start', {
        reqId,
        blockIndex: i,
        questionsRequested: qi,
        questionsPlanned: qiPlanned,
        blockCap,
        maxQuestionsByText,
        blockPages: pagesRange,
        promptChars: pChars,
        blockTextChars: safeText.length,
        difficultyDistribution: blockDifficultyDist,
      })
      // Log en consola el tamaño del texto del bloque y el cap aplicado
      console.log('[generate] block caps', {
        reqId,
        blockIndex: i,
        blockTextChars: safeText.length,
        maxQuestionsByText,
        blockCap,
        questionsPlanned: qiPlanned,
        questionsRequested: qi,
      })
      
      try {
        // Calcular timeout dinámico: base 30s + 1s por cada 1000 caracteres de prompt
        // Mínimo 30s, máximo 90s
        const baseTimeout = 30000
        const promptBasedTimeout = Math.floor(pChars / 1000) * 1000
        const dynamicTimeout = Math.min(Math.max(baseTimeout + promptBasedTimeout, 30000), 90000)
        
        logEvent('generate.block.model.call', {
          reqId,
          blockIndex: i,
          timeoutMs: dynamicTimeout,
          promptChars: pChars,
        })
        
        const itemsRaw = await callModel(prompt, dynamicTimeout)
        const items = itemsRaw.map((it) => ({
          ...it,
          referencia: {
            ley: lawName,
            paginas: pagesRange,
            articulo: it.referencia?.articulo,
            parrafo: it.referencia?.parrafo,
          },
        }))
        const blockDuration = Date.now() - blockStartTime
        logEvent('generate.block.success', {
          reqId,
          blockIndex: b.index,
          count: items.length,
          promptChars: pChars,
          responseChars: JSON.stringify(items).length,
          durationMs: blockDuration,
          difficultyDistribution: blockDifficultyDist,
          itemsByDifficulty: {
            basico: items.filter(i => i.difficulty === 'basico').length,
            medio: items.filter(i => i.difficulty === 'medio').length,
            avanzado: items.filter(i => i.difficulty === 'avanzado').length,
          }
        })
        return items
      } catch (err) {
        const blockDuration = Date.now() - blockStartTime
        const errorMessage = err instanceof Error ? err.message : String(err)
        const isTimeout = errorMessage.includes('aborted') || errorMessage.includes('timeout')
        logEvent('generate.block.error', {
          reqId,
          blockIndex: b.index,
          error: errorMessage,
          durationMs: blockDuration,
          isTimeout,
          questionsRequested: qi,
          blockPages: pagesRange,
          promptChars: pChars,
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
      if (deduped.length >= effectiveQuestions) break
    }

    if (deduped.length === 0) {
      const dt = Date.now() - t0
      const blocksProcessed = parts.length
      const totalItemsFromBlocks = allItems.length
      const blocksWithItems = parts.filter(p => p.length > 0).length
      logEvent('generate.empty', { 
        reqId, 
        latencyMs: dt, 
        requested: requestedQuestions,
        effectiveQuestions,
        blocksProcessed,
        totalItemsFromBlocks,
        blocksWithItems,
        blocksEmpty: blocksProcessed - blocksWithItems,
      })
      return NextResponse.json({ 
        ok: false, 
        error: 'No se pudieron generar preguntas. El modelo devolvió respuestas vacías. Esto puede ocurrir si el texto es demasiado corto o no contiene suficiente contenido para generar preguntas.',
        details: {
          blocksProcessed,
          blocksWithItems,
          blocksEmpty: blocksProcessed - blocksWithItems,
        }
      }, { status: 502 })
    }

    const dt = Date.now() - t0
    logEvent('generate.done', {
      reqId,
      latencyMs: dt,
      requested: requestedQuestions,
      effectiveQuestions,
      returned: deduped.length,
      totalMaxQuestions,
      perBlockMax,
    })
    // Log en consola para inspección rápida
    console.log('[generate] total questions', {
      reqId,
      requested: requestedQuestions,
      effectiveQuestions,
      returned: deduped.length,
      totalMaxQuestions,
    })

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

