export function buildMapPromptRich({
  lawName,
  unidad,
  pagesRange,
  text,
}: {
  lawName: string
  unidad: string
  pagesRange: string
  text: string
}) {
  return `SYSTEM: Responde SOLO con un objeto JSON válido.
USER:
Ley/norma: ${lawName}
Unidad: ${unidad}
Rango de páginas: ${pagesRange}
Objetivo: Resumir SOLO esta unidad con rigor jurídico y citas literales por artículo cuando sea clave. No inventes.
Esquema: {"tipo":"parcial","unidad":"string","rango_articulos":["Art. 1"],"resumen":"string","instituciones":[{"nombre":"string","competencias":["string"],"articulos":["Art. X"]}],"competencias":[{"tipo":"exclusiva|compartida|ejecucion","materias":["string"],"articulos":["Art. X"]}],"organizacion_territorial":[{"ambito":"Consells insulars|Municipios|Islas","claves":["string"],"articulos":["Art. X"]}],"hacienda":[{"tema":"ingresos|fondos|principios","claves":["string"],"articulos":["Art. X"]}],"derechos_deberes":[{"categoria":"derechos|deberes|principios","claves":["string"],"articulos":["Art. X"]}],"relaciones":[{"ambito":"Estado|UE|cooperacion","claves":["string"],"articulos":["Art. X"]}],"reforma":[{"procedimiento":"string","mayorias":"string","articulos":["Art. X"]}],"citas":[{"articulo":"Art. X","frase":"\"literal\""}] }
Texto de la unidad:
${text}
Criterios: - Mantén términos legales exactos entre comillas. - Si no hay datos de un campo, []. - Responde SOLO con JSON.`
}

export function buildMapPromptLite({
  lawName,
  pagesRange,
  blockText,
}: {
  lawName: string
  pagesRange: string
  blockText: string
}) {
  return `SYSTEM: Responde SOLO con JSON válido.
USER:
Ley/norma: ${lawName}
Rango: ${pagesRange}
Objetivo: Resumir SOLO este rango con rigor jurídico. Sin inventar.
Esquema: {"tipo":"parcial","paginas":"p.i–j","estructura":[{"titulo":string,"articulos":[string],"resumen":string}],"puntos":[string],"definiciones":[{"t":string,"d":string,"art":string|null}],"citas":[{"paginas":"p.i–j","art":string|null,"frase":string}]}
Texto del bloque:
${blockText}
Criterios:
- Mantén términos legales exactos entre comillas cuando sea clave.
- Si no hay datos de un campo, usa [].
- Responde con UN único objeto JSON, sin texto extra.`
}

export function buildReducePrompt({
  lawName,
  partials,
  mode,
  length,
}: {
  lawName: string
  partials: any[]
  mode: 'ejecutivo' | 'estructurado'
  length: 'corto' | 'medio' | 'largo'
}) {
  const partialsJSON = JSON.stringify(partials).slice(0, 180000)
  return `SYSTEM: Responde SOLO con un objeto JSON válido.
USER: Ley/norma: ${lawName}
Objetivo: Fusionar parciales en resumen ${mode} ${length}, orden legal (Títulos→…→Disposiciones).
Entrada: ${partialsJSON}
Esquema final: {"tipo":"ejecutivo|estructurado","titular":"string","resumen":"string","puntos_clave":["string"],"estructura":[{"titulo":"string","resumen":"string","articulos":["Art. X"]}],"definiciones":[],"derechos":[],"obligaciones":[],"plazos":[],"autoridades":[],"sanciones":[],"glosario":[{"termino":"string","definicion":"string"}],"citas":[{"paginas":"p.i–j","articulo":"Art. X|null","frase":"\"literal\""}] }
Criterios: no inventes; dedup; longitud ${length}.`
}

export function buildFastStructuredPrompt({ lawName, snippets }: { lawName: string; snippets: any[] }) {
  const body = JSON.stringify(snippets).slice(0, 15000)
  return `SYSTEM: Responde SOLO con un objeto JSON válido.\nUSER:\nResumen estructurado CORTO y FIEL de: ${lawName}. No inventes.\nObjetivo: cubrir Título preliminar; Títulos I–VII/X; Disposiciones SÓLO si aparecen en fragmentos.\nFragmentos: ${body}\nEsquema:{"tipo":"estructurado","titular":"string","resumen":"string","puntos_clave":["string"],"estructura":[{"titulo":"string","resumen":"string","articulos":["Art. X"]}],"citas":[{"paginas":"p.i–j","articulo":"Art. X|null","frase":"\"literal\""}]}`
}

export function buildFastStructuredPromptV2({ lawName, snippets }: { lawName: string; snippets: Array<{ unidad: string; rango: string; texto: string }> }) {
  const body = JSON.stringify(snippets).slice(0, 20000)
  return `SYSTEM: Responde SOLO con un objeto JSON válido.\nUSER:\nElabora un RESUMEN ESTRUCTURADO CORTO y FIEL de: ${lawName}. Usa EXCLUSIVAMENTE la información de los fragmentos.\nREQUISITOS MÍNIMOS:\n- estructura: >= 6 entradas (Títulos/Disposiciones presentes);\n- cada entrada con 2–4 puntos y artículos cuando existan;\n- >=6 citas literales cortas si aparecen.\nFragmentos: ${body}\nDevuelve SOLO este JSON:{"tipo":"estructurado","titular":"string","resumen":"string","puntos_clave":["string"],"estructura":[{"titulo":"string","resumen":"string","articulos":["Art. X"]}],"citas":[{"paginas":"p.i–j","articulo":"Art. X|null","frase":"\"literal\""}]}`
}


