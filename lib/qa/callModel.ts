import OpenAI from 'openai'
import { logEvent } from '@/lib/logging/logger'

// Cliente compatible con Edge y Node (usa fetch por defecto)
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL || undefined,
})

export type MCQItem = {
  pregunta: string
  opciones: { A: string; B: string; C: string; D: string }
  correcta: 'A' | 'B' | 'C' | 'D'
  justificacion: string
  difficulty: 'basico' | 'medio' | 'avanzado'
  referencia: { ley: string; paginas: string; articulo?: string; parrafo?: string }
}

const questionSchema = {
  name: 'mcq_items',
  schema: {
    type: 'array',
    items: {
      type: 'object',
      properties: {
        pregunta: { type: 'string' },
        opciones: {
          type: 'object',
          properties: {
            A: { type: 'string' },
            B: { type: 'string' },
            C: { type: 'string' },
            D: { type: 'string' },
          },
          required: ['A', 'B', 'C', 'D'],
          additionalProperties: false,
        },
        correcta: { type: 'string', enum: ['A', 'B', 'C', 'D'] },
        justificacion: { type: 'string' },
        difficulty: { type: 'string', enum: ['basico', 'medio', 'avanzado'] },
        referencia: {
          type: 'object',
          properties: {
            ley: { type: 'string' },
            paginas: { type: 'string' },
            articulo: { type: 'string' },
            parrafo: { type: 'string' },
          },
          required: ['ley', 'paginas'],
          additionalProperties: true,
        },
      },
      required: ['pregunta', 'opciones', 'correcta', 'justificacion', 'difficulty', 'referencia'],
      additionalProperties: false,
    },
  },
} as const

function extractJsonArray(text: string): unknown[] {
  try {
    const parsed = JSON.parse(text)
    if (Array.isArray(parsed)) return parsed
  } catch {}
  const start = text.indexOf('[')
  const end = text.lastIndexOf(']')
  if (start >= 0 && end > start) {
    const slice = text.slice(start, end + 1)
    try {
      const parsed = JSON.parse(slice)
      if (Array.isArray(parsed)) return parsed
    } catch {}
  }
  return []
}

export async function callModel(prompt: string, timeoutMs = 30000): Promise<MCQItem[]> {
  const startTime = Date.now()
  const ctrl = new AbortController()
  const to = setTimeout(() => {
    const elapsed = Date.now() - startTime
    logEvent('model.timeout', {
      timeoutMs,
      elapsedMs: elapsed,
      promptLength: prompt.length,
    })
    ctrl.abort()
  }, timeoutMs)
  try {
    const res = await client.chat.completions.create(
      {
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'Responde SOLO con un array JSON válido (sin texto adicional).' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.2,
        top_p: 1,
        max_tokens: 1200,
      },
      { signal: ctrl.signal } as any,
    )
    const txt = res.choices[0]?.message?.content || '[]'
    const arr = extractJsonArray(txt)
    // Función para normalizar y validar difficulty
    const normalizeDifficulty = (difficulty: any): 'basico' | 'medio' | 'avanzado' => {
      const d = String(difficulty || '').toLowerCase().trim()
      if (d === 'basico' || d === 'básico' || d === 'basico' || d === 'basic') return 'basico'
      if (d === 'medio' || d === 'medium' || d === 'intermedio') return 'medio'
      if (d === 'avanzado' || d === 'advanced' || d === 'avanzado') return 'avanzado'
      // Por defecto, si no se puede determinar, usar 'medio'
      return 'medio'
    }

    const items: MCQItem[] = arr.map((x: any) => ({
      pregunta: String(x?.pregunta || ''),
      opciones: {
        A: String(x?.opciones?.A || ''),
        B: String(x?.opciones?.B || ''),
        C: String(x?.opciones?.C || ''),
        D: String(x?.opciones?.D || ''),
      },
      correcta: (String(x?.correcta || 'A') as 'A' | 'B' | 'C' | 'D'),
      justificacion: String(x?.justificacion || ''),
      difficulty: normalizeDifficulty(x?.difficulty),
      referencia: {
        ley: String(x?.referencia?.ley || ''),
        paginas: String(x?.referencia?.paginas || ''),
        articulo: x?.referencia?.articulo ? String(x?.referencia?.articulo) : undefined,
        parrafo: x?.referencia?.parrafo ? String(x?.referencia?.parrafo) : undefined,
      },
    }))
    const duration = Date.now() - startTime
    logEvent('model.success', {
      durationMs: duration,
      itemsCount: items.length,
      promptLength: prompt.length,
    })
    return items
  } catch (err) {
    const duration = Date.now() - startTime
    const errorMessage = err instanceof Error ? err.message : String(err)
    logEvent('model.error', {
      error: errorMessage,
      durationMs: duration,
      timeoutMs,
      isAborted: errorMessage.includes('aborted'),
      promptLength: prompt.length,
    })
    throw err
  } finally {
    clearTimeout(to)
  }
}

export async function callModelJSON(
  prompt: string,
  timeoutMs = 20000,
  maxTokens = 500,
  meta?: Record<string, unknown>,
): Promise<any> {
  const ctrl = new AbortController()
  const to = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    logEvent('ai.call.json', {
      meta,
      prompt_preview: prompt.slice(0, 1200),
      prompt_length: prompt.length,
    })
    const res = await client.chat.completions.create(
      {
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'Responde SOLO con un objeto JSON válido.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0,
        top_p: 1,
        max_tokens: maxTokens,
        response_format: { type: 'json_object' } as any,
      },
      { signal: ctrl.signal } as any,
    )
    const txt = res.choices[0]?.message?.content || '{}'
    logEvent('ai.response.json', {
      meta,
      response_preview: txt.slice(0, 1200),
      response_length: txt.length,
    })
    
    // Intentar parsear el JSON
    try {
      return JSON.parse(txt)
    } catch (parseError: any) {
      // Si el JSON está incompleto, intentar repararlo básicamente
      if (parseError.message && parseError.message.includes('Unterminated')) {
        logEvent('ai.response.json.incomplete', {
          meta,
          error: parseError.message,
          response_length: txt.length,
          response_preview: txt.slice(-500) // Últimos 500 caracteres para debug
        })
        // Intentar cerrar strings y objetos incompletos
        let repaired = txt
        // Cerrar strings abiertos
        const openQuotes = (repaired.match(/"/g) || []).length
        if (openQuotes % 2 !== 0) {
          repaired += '"'
        }
        // Cerrar objetos y arrays
        const openBraces = (repaired.match(/{/g) || []).length
        const closeBraces = (repaired.match(/}/g) || []).length
        for (let i = 0; i < openBraces - closeBraces; i++) {
          repaired += '}'
        }
        const openBrackets = (repaired.match(/\[/g) || []).length
        const closeBrackets = (repaired.match(/\]/g) || []).length
        for (let i = 0; i < openBrackets - closeBrackets; i++) {
          repaired += ']'
        }
        
        try {
          return JSON.parse(repaired)
        } catch (repairedError: any) {
          // Si aún falla, lanzar el error original
          throw new Error(`JSON parse error: ${parseError.message}. Response length: ${txt.length}. Last 200 chars: ${txt.slice(-200)}`)
        }
      }
      throw parseError
    }
  } finally {
    clearTimeout(to)
  }
}


