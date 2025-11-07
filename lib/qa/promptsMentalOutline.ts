import { mentalOutlineSchema } from '@/lib/schema/mentalOutline'
import type { MentalOutline, Titulo, Capitulo, Seccion, Articulo, DisposicionItem } from '@/types/mentalOutline'

type PagesMapEntry = {
  page: number
  start_offset: number
  end_offset: number
}

const SCHEMA_STRING = JSON.stringify(mentalOutlineSchema, null, 2)

const HEURISTICS = `Heurísticas recomendadas para la estructuración:
- Título: ^(T[IÍ]TULO(?:\\s+PRELIMINAR|\\s+[IVXLCDM]+|\\s+\\d+))\\b.*
- Capítulo: ^CAP[IÍ]TULO\\s+(?:[IVXLCDM]+|\\d+)\\b.*
- Sección: ^SECCI[ÓO]N\\s+(?:[IVXLCDM]+|\\d+)\\b.*
- Artículo: ^Art[ií]culo\\s+(\\d+(?:\\s*(?:bis|ter|quater|quinquies))?)\\.?\\s*(.*)$
- Disposición adicional: ^Disposici[óo]n\\s+Adicional\\s+(\\d+|[Uu]nica)\\b.*
- Disposición transitoria: ^Disposici[óo]n\\s+Transitoria\\s+(\\d+|[Uu]nica)\\b.*
- Disposición derogatoria: ^Disposici[óo]n\\s+Derogatoria\\s+(\\d+|[Uu]nica)\\b.*
- Disposición final: ^Disposici[óo]n\\s+Final\\s+(\\d+|[Uu]nica)\\b.*
- Preámbulo / Exposición: ^(Pre[áa]mbulo|Exposici[óo]n\\s+de\\s+motivos)\\b.*

Ignora portadas e índices cuando contengan Portada, Créditos, Depósito legal, ISBN, Índice, Sumario, Tabla de contenido, Contents o Summary.
Normaliza ordinales (PRELIMINAR, I/II…, números arábigos) y conserva el encabezado literal en *_texto.
Captura artículos con sufijo (bis/ter/…) y coloca el encabezado en articulo_texto.
Evita duplicados usando anchor o encabezado normalizado y extiende pages como [min, max].`

export function buildMentalOutlinePrompt(params: {
  source: string
  text: string
  pagesMap?: PagesMapEntry[]
}) {
  const { source, text, pagesMap } = params
  const safeSource = source || 'Documento sin título'
  const trimmedText = text.trim()
  const segments: string[] = []
  const escapedSource = safeSource.replace(/"/g, '\\"')
  segments.push(`source: "${escapedSource}"`)
  segments.push(`text: """
${trimmedText}
"""`)
  if (pagesMap && pagesMap.length) {
    segments.push(`pages_map: ${JSON.stringify(pagesMap)}`)
  }

  return `Genera el esquema estructurado del siguiente documento legal.
- Elimina portadas e índices.
- Estructura: Título → (Capítulo) → (Sección) → Artículo, más Disposiciones (adicionales, transitorias, derogatorias, finales).
- Respeta numeraciones reales (incluye bis/ter).
- Devuelve solo JSON conforme al JSON Schema proporcionado.

JSON Schema objetivo:
${SCHEMA_STRING}

${HEURISTICS}

${segments.join('\n\n')}`
}

function summarizeSchema(schema: MentalOutline | null) {
  if (!schema) return 'null'

  const fmtPages = (pages?: number[] | null) => {
    if (!pages || !pages.length) return '∅'
    if (pages.length === 1) return `[${pages[0]}]`
    return `[${pages[0]}-${pages[pages.length - 1]}]`
  }

  const summarizeArticulos = (articulos?: Articulo[]) => {
    const items = articulos || []
    if (!items.length) return 'art:0'
    const sample = items.slice(0, 3).map((a) => a.numero).join(', ')
    const suffix = items.length > 3 ? ` … (${items.length})` : ` (${items.length})`
    return `art:${sample}${suffix}`
  }

  const summarizeSecciones = (secciones?: Seccion[]) => {
    const items = secciones || []
    if (!items.length) return []
    return items.slice(0, 4).map((sec) => {
      const artSummary = summarizeArticulos(sec.articulos)
      return `    · Sec ${sec.ordinal || '?'} (${sec.anchor || '-'}) ${fmtPages(sec.pages)} ${artSummary}`
    })
  }

  const summarizeCapitulos = (capitulos?: Capitulo[]) => {
    const items = capitulos || []
    if (!items.length) return []
    return items.slice(0, 6).flatMap((cap) => {
      const lines = [`  · Cap ${cap.ordinal || '?'} (${cap.anchor || '-'}) ${fmtPages(cap.pages)} sec:${cap.secciones?.length || 0} ${summarizeArticulos(cap.articulos)}`]
      lines.push(...summarizeSecciones(cap.secciones))
      return lines
    })
  }

  const lines: string[] = []
  lines.push(`metadata: "${schema.metadata.document_title}" | source: "${schema.metadata.source}" | lang: ${schema.metadata.language} | generated_at: ${schema.metadata.generated_at}`)
  lines.push(`front_matter: preambulo=${schema.front_matter.preambulo.present} ${fmtPages(schema.front_matter.preambulo.pages)} | exposicion=${schema.front_matter.exposicion_motivos.present} ${fmtPages(schema.front_matter.exposicion_motivos.pages)}`)
  lines.push(`titulos: ${schema.titulos.length}`)

  schema.titulos.slice(0, 12).forEach((titulo: Titulo) => {
    lines.push(`- Título ${titulo.ordinal || '?'} (${titulo.anchor || '-'}) ${fmtPages(titulo.pages)} cap:${titulo.capitulos?.length || 0} ${summarizeArticulos(titulo.articulos)}`)
    lines.push(...summarizeCapitulos(titulo.capitulos))
  })

  const summarizeDispos = (label: string, dispos?: DisposicionItem[]) => {
    const items = dispos || []
    if (!items.length) return `${label}: 0`
    const sample = items.slice(0, 4).map((d) => `${d.numero}(${d.anchor || '-'})`).join(', ')
    return `${label}: ${items.length} -> ${sample}${items.length > 4 ? '…' : ''}`
  }

  lines.push(summarizeDispos('dispos.adicionales', schema.disposiciones.adicionales))
  lines.push(summarizeDispos('dispos.transitorias', schema.disposiciones.transitorias))
  lines.push(summarizeDispos('dispos.derogatorias', schema.disposiciones.derogatorias))
  lines.push(summarizeDispos('dispos.finales', schema.disposiciones.finales))

  return lines.join('\n')
}

export function buildMentalOutlineChunkPrompt(params: {
  source: string
  schemaAcumulado: any
  loteTexto: string
  rangoPaginas: [number, number]
  metadata: {
    document_title: string
    source: string
    language: string
    generated_at: string
  }
}) {
  const { source, schemaAcumulado, loteTexto, rangoPaginas, metadata } = params
  const schemaSummary = summarizeSchema(schemaAcumulado as MentalOutline | null)
  const rangeText = `[${rangoPaginas[0]}, ${rangoPaginas[1]}]`
  const tokens = loteTexto.split(/\n+/)
  const maxLines = 160
  const trimmedLote = tokens.length > maxLines
    ? tokens.slice(0, Math.floor(maxLines / 2)).join('\n') + '\n...\n' + tokens.slice(-Math.floor(maxLines / 2)).join('\n')
    : loteTexto

  const parts: string[] = []
  parts.push('Instrucción: Vas a procesar el documento por lotes/páginas y construir un esquema incremental sin duplicados.')
  parts.push('')
  parts.push('Contexto persistente (estado):')
  parts.push('')
  parts.push('Resumen del schema_acumulado:')
  parts.push(schemaSummary)
  parts.push('')
  parts.push('metadata (usa estos valores en el objeto final):')
  parts.push(JSON.stringify(metadata, null, 2))
  parts.push('')
  parts.push('heuristicas_saltos: { "portadas_e_indices": true }')
  parts.push('normalizacion_numerales: { "romanos": true, "arábigos": true, "preliminar": true }')
  parts.push('deteccion_bis_ter: true')
  parts.push('')
  parts.push('Paso actual:')
  parts.push('')
  parts.push('lote_texto: """')
  parts.push(trimmedLote)
  parts.push('"""')
  parts.push(`rango_paginas: ${rangeText}`)
  parts.push('')
  parts.push('Tareas:')
  parts.push('- Ignora portadas/índices si aparecen.')
  parts.push('- Detecta encabezados Título/Capítulo/Sección/Artículo y Disposiciones.')
  parts.push('- Fusiona con schema_acumulado sin crear duplicados (misma anchor o mismo encabezado normalizado).')
  parts.push('- Actualiza pages (extiende [min, max]).')
  parts.push('- Mantén metadata igual salvo que se indique lo contrario.')
  parts.push('- No repitas artículos o disposiciones ya presentes; conserva los existentes y añade solo los nuevos.')
  parts.push('- En articulo_texto y texto_encabezado copia SOLO el encabezado literal (sin el cuerpo completo).')
  parts.push('- Devuelve el objeto completo conforme al JSON Schema (sin envolverlo en otras claves).')
  parts.push('- Si schema_acumulado es null, crea la estructura completa siguiendo el JSON Schema.')
  parts.push('- El objeto final debe contener exactamente las claves: metadata, front_matter, titulos, disposiciones.')
  parts.push('- Conserva los datos previos existentes y sólo añade o amplía la información detectada en este lote.')
  parts.push('')
  if (!schemaAcumulado) {
    parts.push('JSON Schema objetivo:')
    parts.push(SCHEMA_STRING)
    parts.push('')
  } else {
    parts.push('Recuerda ceñirte al JSON Schema acordado (metadata, front_matter, titulos, disposiciones).')
    parts.push('')
  }
  parts.push(HEURISTICS)

  return parts.join('\n')
}

