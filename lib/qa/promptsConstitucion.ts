import type { Fragment } from '@/lib/legal/fragments'

export function buildPromptConstitucion(fragments: Fragment[]) {
  const fragmentsJson = JSON.stringify(fragments).slice(0, 20000)
  const system = `Eres un asistente jurídico estricto. Devuelve SIEMPRE y SOLO un único objeto JSON válido que cumpla el esquema. No inventes niveles/no devuelvas texto fuera del JSON. Incluye rangos de páginas (“p. X–Y”) cuando estén claros. Si algo no aparece en los fragmentos, omítelo.`
  const user = `Estructura el texto de la «Constitución Española (1978)» en niveles:

TÍTULO → CAPÍTULO → SECCIÓN (opcional) → ARTÍCULO; y Disposiciones (adicionales / transitorias / derogatorias / finales) → disposición (primera/segunda/…).

Identifica encabezados exactos (BOE) usando estos patrones:

^TÍTULO\s+(PRELIMINAR|[IVXLC]+)\b
^CAPÍTULO\s+([IVXLC]+|PRIMERO|SEGUNDO|TERCERO|CUARTO|QUINTO|SEXTO|SÉPTIMO|OCTAVO|NOVENO|DÉCIMO)\b
^Sección\s+\d+\.ª\b
^Artículo\s+\d+\.?\n^Disposiciones\s+(adicionales|transitorias|derogatorias|finales)
^Disposición\s+(adicional|transitoria|derogatoria|final)\s+(primera|segunda|tercera|cuarta|quinta|…)

Salida JSON exacta con nodos { id, label, kind, pages?, children? } y kinds permitidos:
root | titulo | capitulo | seccion | articulo | disposiciones | disposicion.

id: slug corto en minúsculas con guiones. label: rótulo literal (≤120 caracteres).

Cobertura mínima si aparece en los fragmentos: TÍTULO PRELIMINAR; TÍTULOS I–X (al menos un nodo por título); en TÍTULO I, sus cinco capítulos y Sección 1.ª y 2.ª; Disposiciones adicionales/transitorias/derogatorias/finales con sus disposiciones.

No incluyas texto de pie de página como “BOLETÍN OFICIAL DEL ESTADO… Página X”.

Ejemplo mini (formato esperado):
{"root":{"id":"root","label":"Constitución Española (1978)","kind":"root","children":[{"id":"titulo-i","label":"TÍTULO I. De los derechos y deberes fundamentales","kind":"titulo","children":[{"id":"cap-primero","label":"CAPÍTULO PRIMERO. De los españoles y los extranjeros","kind":"capitulo","children":[{"id":"art-11","label":"Artículo 11","kind":"articulo"}]}]}]}}

FRAGMENTOS (cada uno con rango y texto truncado):
${fragmentsJson}`
  return { system, user }
}
