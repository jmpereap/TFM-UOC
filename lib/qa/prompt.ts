export type BuildPromptParams = {
  lawName: string
  pagesRange: string // "p. 12–16"
  blockText: string
  n: number
}

export function buildPrompt({ lawName, pagesRange, blockText, n }: BuildPromptParams) {
  return `
Eres un sistema que genera preguntas tipo test sobre legislación española.

Objetivo: crear ${n} preguntas (máx. 4 opciones A–D, exactamente 1 correcta), sin repetición, basadas SOLO en el texto del bloque proporcionado.

Instrucciones estrictas:
- Cada pregunta debe incluir: "pregunta", "opciones" (A–D), "correcta", "justificacion", "referencia" {ley: "${lawName}", paginas: "${pagesRange}", articulo?: string, parrafo?: string}.
- No inventes contenido fuera del bloque.
- Evita preguntas triviales repetidas.
- Devuelve EXCLUSIVAMENTE JSON válido con este esquema:
[
  {
    "pregunta": "...",
    "opciones": {"A": "...", "B": "...", "C": "...", "D": "..."},
    "correcta": "A|B|C|D",
    "justificacion": "...",
    "referencia": {"ley": "${lawName}", "paginas": "${pagesRange}", "articulo": "opcional", "parrafo": "opcional"}
  }
]

BLOQUE:
<<<BLOQUE>>> ${blockText} <<<BLOQUE>>>
`.trim()
}

