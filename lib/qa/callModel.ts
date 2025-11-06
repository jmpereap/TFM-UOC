import OpenAI from 'openai'

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
      required: ['pregunta', 'opciones', 'correcta', 'justificacion', 'referencia'],
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

export async function callModel(prompt: string, timeoutMs = 20000): Promise<MCQItem[]> {
  const ctrl = new AbortController()
  const to = setTimeout(() => ctrl.abort(), timeoutMs)
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
      referencia: {
        ley: String(x?.referencia?.ley || ''),
        paginas: String(x?.referencia?.paginas || ''),
        articulo: x?.referencia?.articulo ? String(x?.referencia?.articulo) : undefined,
        parrafo: x?.referencia?.parrafo ? String(x?.referencia?.parrafo) : undefined,
      },
    }))
    return items
  } finally {
    clearTimeout(to)
  }
}

export async function callModelJSON(prompt: string, timeoutMs = 20000, maxTokens = 500): Promise<any> {
  const ctrl = new AbortController()
  const to = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
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
    return JSON.parse(txt)
  } finally {
    clearTimeout(to)
  }
}


