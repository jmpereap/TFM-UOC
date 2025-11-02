import { logEvent } from 'lib/logging/logger'

export type MCQItem = {
  pregunta: string
  opciones: { A: string; B: string; C: string; D: string }
  correcta: 'A' | 'B' | 'C' | 'D'
  justificacion: string
  referencia: { ley: string; paginas: string; articulo?: string; parrafo?: string }
}

function extractJsonArray(text: string): unknown[] {
  // Intenta parseo directo primero
  try {
    const parsed = JSON.parse(text)
    if (Array.isArray(parsed)) return parsed
  } catch {}
  // Heurística: toma el primer '[' y el último ']'
  const start = text.indexOf('[')
  const end = text.lastIndexOf(']')
  if (start >= 0 && end > start) {
    const slice = text.slice(start, end + 1)
    try {
      const parsed = JSON.parse(slice)
      if (Array.isArray(parsed)) return parsed
    } catch {}
  }
  throw new Error('No se pudo extraer un JSON array válido')
}

async function callOpenAI(prompt: string, model: string, apiKey: string): Promise<{ raw: string }> {
  const body = {
    model,
    temperature: 0,
    messages: [
      { role: 'system', content: 'Responde SOLO con un JSON array válido, sin texto adicional.' },
      { role: 'user', content: prompt },
    ],
  }
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`OpenAI error ${res.status}: ${errText}`)
  }
  const json = await res.json()
  const content: string = json?.choices?.[0]?.message?.content ?? ''
  return { raw: content }
}

export async function callModel(prompt: string): Promise<{ items: MCQItem[]; raw: string; provider: string; model: string }>{
  const provider = process.env.LLM_PROVIDER || 'openai'
  const openaiKey = process.env.OPENAI_API_KEY
  const openaiModel = process.env.OPENAI_MODEL || 'gpt-4o-mini'

  let raw = ''
  let model = ''
  try {
    if (provider === 'openai' && openaiKey) {
      model = openaiModel
      const out = await callOpenAI(prompt, openaiModel, openaiKey)
      raw = out.raw
    } else {
      // Fallback mock: genera 1 pregunta mínima
      model = 'mock-local'
      raw = JSON.stringify([
        {
          pregunta: '¿Pregunta de ejemplo basada en el bloque? (mock)',
          opciones: { A: 'Opción A', B: 'Opción B', C: 'Opción C', D: 'Opción D' },
          correcta: 'A',
          justificacion: 'Explicación de ejemplo.',
          referencia: { ley: 'N/A', paginas: 'p. 1–1' },
        },
      ])
    }
    const arr = extractJsonArray(raw)
    // Filtrado a MCQItem básico
    const items: MCQItem[] = arr
      .filter((x) => x && typeof x === 'object')
      .map((x: any) => ({
        pregunta: String(x.pregunta || '').trim(),
        opciones: {
          A: String(x?.opciones?.A || ''),
          B: String(x?.opciones?.B || ''),
          C: String(x?.opciones?.C || ''),
          D: String(x?.opciones?.D || ''),
        },
        correcta: (String(x.correcta || 'A') as 'A' | 'B' | 'C' | 'D'),
        justificacion: String(x.justificacion || ''),
        referencia: {
          ley: String(x?.referencia?.ley || ''),
          paginas: String(x?.referencia?.paginas || ''),
          articulo: x?.referencia?.articulo ? String(x?.referencia?.articulo) : undefined,
          parrafo: x?.referencia?.parrafo ? String(x?.referencia?.parrafo) : undefined,
        },
      }))
      .filter((q) => q.pregunta && q.opciones.A && q.opciones.B && q.opciones.C && q.opciones.D)

    return { items, raw, provider, model }
  } catch (err) {
    logEvent('model.error', { provider, model: model || 'unknown', error: String(err) })
    throw err
  }
}

