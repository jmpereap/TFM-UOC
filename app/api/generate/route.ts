import { NextResponse } from 'next/server'
import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'
import { distributeQuestions } from 'lib/qa/distribute'
import { buildPrompt } from 'lib/qa/prompt'
import { callModel, type MCQItem } from 'lib/qa/model'
import { logEvent } from 'lib/logging/logger'

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
})

export const runtime = 'nodejs'

export async function POST(req: Request) {
  const reqId = uuidv4()
  const t0 = Date.now()
  try {
    const json = await req.json()
    const { lawName, n, blocks } = InputSchema.parse(json)
    const m = blocks.length
    const distribution = distributeQuestions(n, m)

    const allItems: MCQItem[] = []

    for (let i = 0; i < m; i++) {
      const qi = distribution[i]
      if (qi <= 0) continue
      const b = blocks[i]
      const pagesRange = `p. ${b.startPage}–${b.endPage}`
      const prompt = buildPrompt({ lawName, pagesRange, blockText: b.text, n: qi })
      const pChars = prompt.length
      let raw = ''
      let provider = 'unknown'
      let model = 'unknown'
      try {
        const r = await callModel(prompt)
        raw = r.raw
        provider = r.provider
        model = r.model
        const items = r.items.map((it) => ({
          ...it,
          // Asegura referencia consistente
          referencia: {
            ley: lawName,
            paginas: pagesRange,
            articulo: it.referencia?.articulo,
            parrafo: it.referencia?.parrafo,
          },
        }))
        allItems.push(...items)
        logEvent('generate.block.success', {
          reqId,
          blockIndex: b.index,
          count: items.length,
          provider,
          model,
          promptChars: pChars,
          responseChars: raw.length,
        })
      } catch (err) {
        logEvent('generate.block.error', {
          reqId,
          blockIndex: b.index,
          error: String(err),
        })
      }
    }

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

    const dt = Date.now() - t0
    logEvent('generate.done', {
      reqId,
      latencyMs: dt,
      requested: n,
      returned: deduped.length,
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

