export type BuildPromptParams = {
  lawName: string
  pagesRange: string // "p. 12–16"
  blockText: string
  n: number
  difficultyDistribution?: {
    basico: number
    medio: number
    avanzado: number
  }
  preferredLevel?: 'basico' | 'medio' | 'avanzado'
}

export function buildPrompt({ lawName, pagesRange, blockText, n, difficultyDistribution, preferredLevel }: BuildPromptParams) {
  const distText = difficultyDistribution
    ? `\nDistribución de dificultad requerida:
- ${difficultyDistribution.basico} pregunta(s) de nivel "basico"
- ${difficultyDistribution.medio} pregunta(s) de nivel "medio"
- ${difficultyDistribution.avanzado} pregunta(s) de nivel "avanzado"`
    : ''

  const preferredLevelText = preferredLevel
    ? (() => {
        const percentage = preferredLevel === 'basico' ? '95%' : '90%'
        return `\n\nIMPORTANTE - Nivel preferido: La mayoría (al menos ${percentage}) de las preguntas deben ser de nivel "${preferredLevel}". El resto puede ser de otros niveles si es necesario, pero prioriza el nivel "${preferredLevel}".`
      })()
    : ''

  return `
Eres un sistema que genera preguntas tipo test sobre documentación técnica, material de estudio para exámenes/oposiciones y legislación española (cuando el bloque sea normativo).

Objetivo: crear ${n} preguntas (máx. 4 opciones A–D, exactamente 1 correcta), sin repetición, basadas SOLO en el texto del bloque proporcionado.${distText}${preferredLevelText}

NIVELES DE DIFICULTAD

Cada pregunta tipo test debe ir etiquetada con uno de estos niveles: "basico", "medio" o "avanzado".

Definición de cada nivel:

- "basico":
  - Pregunta de RECUERDO DIRECTO del texto.
  - El enunciado pregunta casi literalmente por algo que aparece en uno o dos párrafos.
  - Ejemplos típicos:
    - "¿Qué ocurre si...?"
    - "¿Cuál es el plazo para...?"
    - "¿Qué órgano es competente para...?"
  - Opciones cortas, con un único dato cambiado (número, órgano, plazo…).
  - NO requiere interpretar un caso práctico ni combinar varios artículos.

- "medio":
  - Pregunta de COMPRENSIÓN / APLICACIÓN sencilla.
  - Puede combinar 2–3 condiciones del mismo artículo o de artículos muy próximos.
  - Buen formato: "¿Cuál de las siguientes afirmaciones sobre X es correcta/incorrecta según la ley?".
  - Las opciones mezclan condiciones verdaderas/falsas, plazos, requisitos, excepciones…
  - Requiere leer con atención y entender la norma, pero sin caso práctico largo.

- "avanzado":
  - Pregunta de APLICACIÓN CON RAZONAMIENTO.
  - Usa un PEQUEÑO CASO PRÁCTICO o escenario (1–3 frases) y pregunta qué consecuencia jurídica procede según la ley.
  - El enunciado describe una situación concreta (quién hace qué, plazos, requisitos que se cumplen o no).
  - Solo una opción encaja plenamente con la norma; las demás contienen errores sutiles (plazo equivocado, órgano incorrecto, condición que no se cumple, etc.).
  - Puede requerir combinar varios apartados del mismo artículo o de 2–3 artículos relacionados del mismo Título/Capítulo.

INSTRUCCIONES ESPECÍFICAS

- Para "avanzado", el enunciado debe incluir SIEMPRE un mini-supuesto práctico.
- Evita pistas obvias (no repitas palabras exactas del artículo solo en la opción correcta).
- No hagas preguntas de tipo "Todas las anteriores" o "Ninguna de las anteriores".

Instrucciones estrictas:
- Cada pregunta debe incluir: "pregunta", "opciones" (A–D), "correcta", "justificacion", "difficulty" ("basico"|"medio"|"avanzado"), "referencia" {ley: "${lawName}", paginas: "${pagesRange}", articulo?: string, parrafo?: string}.
- No inventes contenido fuera del bloque.
- Evita preguntas triviales repetidas.
- Devuelve EXCLUSIVAMENTE JSON válido con este esquema:
[
  {
    "pregunta": "...",
    "opciones": {"A": "...", "B": "...", "C": "...", "D": "..."},
    "correcta": "A|B|C|D",
    "justificacion": "...",
    "difficulty": "basico|medio|avanzado",
    "referencia": {"ley": "${lawName}", "paginas": "${pagesRange}", "articulo": "opcional", "parrafo": "opcional"}
  }
]

BLOQUE:
<<<BLOQUE>>> ${blockText} <<<BLOQUE>>>
`.trim()
}

