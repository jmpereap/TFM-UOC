import type { TitlesOnlyOutline } from '@/types/titlesOnly'
import { titlesOnlySchema } from '@/lib/schema/titlesOnly'

type PagesMapEntry = {
  page: number
  start_offset: number
  end_offset: number
}

const SCHEMA_STRING = JSON.stringify(titlesOnlySchema, null, 2)

const HEURISTICS_TITLES = `Detección exclusiva de TÍTULOS:
- Un TÍTULO es una línea que empieza por ^T[IÍ]TULO\\s+(PRELIMINAR|[IVXLCDM]+|\\d+)
- Puede llevar la definición en la MISMA línea tras separador (. : -), p.ej.: "TÍTULO I: De los derechos …"
- Si no hay definición en la misma línea, usa la primera línea no vacía que le sigue (p.ej.: "DISPOSICIONES GENERALES").
- page_start: número de página donde aparece la línea de TÍTULO.
- page_end: número de página donde comienza el siguiente TÍTULO. Si no existe siguiente TÍTULO, devolver null.
- Ignora Capítulos, Secciones, Artículos y Disposiciones. Solo extrae TÍTULOS.
- Normaliza ordinales a PRELIMINAR o romanos/números tal cual aparezcan (sin inventar).
- No inventes TÍTULOS. Evita encabezados falsos de portadas/índices (Portada, Índice, Sumario, Tabla de contenido, Contents, Summary, Créditos, ISBN, Depósito legal).`

function summarizeTitlesOnly(schema: TitlesOnlyOutline | null) {
  if (!schema) return 'null'
  const items = Array.isArray(schema.titulos) ? schema.titulos : []
  const head = items.slice(0, 8).map((t) => `${t.ordinal}@${t.page_start}${t.page_end ? '→' + t.page_end : ''}`).join(', ')
  return `titulos:${items.length}${head ? ' [' + head + ']' : ''}`
}

export function buildTitlesOnlyChunkPrompt(params: {
  source: string
  schemaAcumulado: TitlesOnlyOutline | null
  loteTexto: string
  rangoPaginas: [number, number]
  pagesMap?: PagesMapEntry[]
  metadata: {
    document_title: string
    source: string
    language: string
    generated_at: string
  }
}) {
  const { source, schemaAcumulado, loteTexto, rangoPaginas, pagesMap, metadata } = params
  const safeSource = source || 'Documento sin título'
  const schemaSummary = summarizeTitlesOnly(schemaAcumulado)
  const rangeText = `[${rangoPaginas[0]}, ${rangoPaginas[1]}]`
  const tokens = loteTexto.split(/\n+/)
  const maxLines = 160
  const trimmedLote = tokens.length > maxLines
    ? tokens.slice(0, Math.floor(maxLines / 2)).join('\n') + '\n...\n' + tokens.slice(-Math.floor(maxLines / 2)).join('\n')
    : loteTexto

  const parts: string[] = []
  parts.push('Tarea: Detecta exclusivamente los TÍTULOS del documento con su definición y páginas (inicio y fin).')
  parts.push(`source: "${safeSource.replace(/"/g, '\\"')}"`)
  parts.push('')
  parts.push('Contexto acumulado (para evitar duplicados y ajustar page_end):')
  parts.push(schemaSummary)
  parts.push('')
  parts.push('metadata:')
  parts.push(JSON.stringify(metadata, null, 2))
  parts.push('')
  parts.push('rango_paginas (páginas absolutas): ' + rangeText)
  if (pagesMap && pagesMap.length) {
    parts.push('pages_map: ' + JSON.stringify(pagesMap))
  }
  parts.push('')
  parts.push(HEURISTICS_TITLES)
  parts.push('')
  parts.push('Instrucciones importantes:')
  parts.push('- Devuelve SOLO un objeto JSON con las claves: metadata, titulos.')
  parts.push('- En cada elemento de titulos, incluye EXACTAMENTE: ordinal, titulo_texto, definicion, anchor, page_start, page_end.')
  parts.push('- Devuelve page_start y page_end como NÚMEROS DE PÁGINA ABSOLUTOS del documento (usa rango_paginas para ubicarlos).')
  parts.push('- No incluyas capítulos, secciones, artículos, ni disposiciones.')
  parts.push('')
  parts.push('JSON Schema objetivo:')
  parts.push(SCHEMA_STRING)
  parts.push('')
  parts.push('Lote de texto:')
  parts.push('"""')
  parts.push(trimmedLote)
  parts.push('"""')
  parts.push('')
  parts.push('Salida esperada (JSON, sin texto adicional): { "metadata": {...}, "titulos": [ ... ] }')
  return parts.join('\n')
}


