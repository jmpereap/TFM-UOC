import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { callModelJSON } from '@/lib/qa/callModel'
import { logEvent } from '@/lib/logging/logger'

export const runtime = 'nodejs'

const InputSchema = z.object({
  title: z.string().optional(),
  blocks: z
    .array(
      z.object({
        text: z.string().min(1),
        startPage: z.number().int().optional(),
        endPage: z.number().int().optional(),
      }),
    )
    .min(1),
})

const MAX_TEXT_LEN = 12000

function buildPrompt(title: string, text: string) {
  return `
Eres una persona experta en docencia que elabora “esquemas mentales” claros y sintéticos a partir de materiales didácticos (apuntes, temas de oposición, manuales técnicos).

OBJETIVO
- A partir del texto proporcionado, debes generar un esquema jerárquico en formato lista de viñetas, muy similar a un mapa mental, en español.
- El esquema debe servir como resumen visual para estudiar, NO como texto legal.

REGLAS GENERALES
- No inventes contenido que no aparezca en el texto.
- Prioriza conceptos clave, definiciones, tipos, relaciones y ventajas/inconvenientes.
- Usa frases muy cortas (2–8 palabras), no párrafos.
- Máximo 6–8 ramas principales por esquema.
- Mantén un tono neutro y didáctico, sin jerga innecesaria.

FORMATO
- Primera línea: título del esquema con el emoji de cerebro.
  Ejemplo: "🧠 Esquema mental: ${title}"
- Después, listas con viñetas usando este estilo:
  • Tema principal
    • Subtema
      • Detalle breve
      • Otro detalle
    • Otro subtema
  • Segundo tema principal
    • ...
- No añadas explicación fuera del esquema ni comentarios meta.

CATEGORÍAS SUGERIDAS (SI APARECEN EN EL TEXTO)
- Conceptos básicos / definiciones
- Estructuras / elementos / componentes
- Arquitectura / modelo
- Funciones / usos / aplicaciones
- Ventajas / inconvenientes
- Ejemplos o casos típicos
Si alguna categoría no aparece en el texto, simplemente no la uses.

Texto fuente:
<<<TEXTO>>> ${text} <<<TEXTO>>>

Devuelve SOLO un objeto JSON válido con este esquema:
{
  "title": "🧠 Esquema mental: ${title}",
  "outline": "líneas con viñetas ya formateadas en texto plano"
}
`.trim()
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    const parsed = InputSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: 'Payload inválido' }, { status: 400 })
    }
    const { title, blocks } = parsed.data
    const mergedText = blocks.map((b) => b.text).join('\n\n')
    const text = mergedText.slice(0, MAX_TEXT_LEN)
    const derivedTitle = title || 'Documento'

    const prompt = buildPrompt(derivedTitle, text)
    const result = await callModelJSON(prompt, 40000, 800, { kind: 'non-legal-outline' }).catch((err) => {
      logEvent('nonlegal.error', { error: String(err) })
      throw err
    })

    const outline = (result?.outline as string) || (result?.esquema as string) || (result?.mapa as string) || ''
    if (!outline) {
      return NextResponse.json({ ok: false, error: 'Respuesta vacía de la IA' }, { status: 502 })
    }

    return NextResponse.json({
      ok: true,
      title: result?.title || `🧠 Esquema mental: ${derivedTitle}`,
      outline,
    })
  } catch (err) {
    logEvent('nonlegal.exception', { error: String(err) })
    return NextResponse.json({ ok: false, error: 'Error generando esquema no legal' }, { status: 500 })
  }
}




