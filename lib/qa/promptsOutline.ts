type Snippet = {
  unidad: string
  rango: string
  texto: string
  articulos?: Array<{ articulo: string; resumen: string }>
}

export function buildOutlinePrompt({ lawName, snippets }: { lawName: string; snippets: Snippet[] }) {
  const body = JSON.stringify(snippets).slice(0, 20000)
  return `SYSTEM: Responde SOLO con un objeto JSON válido.
USER:
Construye un ESQUEMA JERÁRQUICO (mapa mental) de: ${lawName}. Usa SOLO la info de los fragmentos.
Niveles: root -> TÍTULOS -> CAPÍTULOS/SECCIONES -> CONCEPTOS o ARTÍCULOS.
Salida base: {"root":{"id":"root","label":"${lawName}","kind":"root","children":[{"id":"titulo-preliminar","label":"TÍTULO PRELIMINAR","kind":"titulo","pages":"p.i–j","children":[{"id":"cap-i","label":"Capítulo I","kind":"capitulo","children":[{"id":"concepto-1","label":"Fundamento","kind":"concepto","articulos":["Art. 1"]}]}]}]}}
Reglas mínimas:
- Incluir Títulos I–X y Disposiciones si aparecen; cada Título con ≥1 hijo.
- Al menos 12 nodos hoja (concepto/artículo); cada hoja ≤90 caracteres, resume idea clave y referencia articular.
- Usa el campo "articulos" de los fragmentos para crear nodos Artículo cuando sea pertinente.
Fragmentos: ${body}`
}


