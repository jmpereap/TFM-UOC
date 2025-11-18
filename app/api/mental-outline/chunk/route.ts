import { NextRequest, NextResponse } from 'next/server'
import { buildMentalOutlineChunkPrompt } from '@/lib/qa/promptsMentalOutline'
import { callModelJSON } from '@/lib/qa/callModel'
import { logEvent } from '@/lib/logging/logger'
import { buildTextFromPages, PageEntry } from '@/lib/pdf/pagesMap'
import { mentalOutlineSchema } from '@/lib/schema/mentalOutline'
import type { DisposicionItem } from '@/types/mentalOutline'
import Ajv2020 from 'ajv/dist/2020'
import addFormats from 'ajv-formats'

export const runtime = 'nodejs'

const ajv = new Ajv2020({ allErrors: true })
addFormats(ajv)
const validateMentalOutline = ajv.compile(mentalOutlineSchema)

function sanitizeArticleText(text: string) {
  if (!text) return text
  const firstLine = text.split(/\n+/)[0]?.trim() || ''
  if (firstLine.length <= 220) return firstLine
  return `${firstLine.slice(0, 217).trimEnd()}…`
}

function sanitizeOutline(outline: any) {
  if (!outline || typeof outline !== 'object') return outline

  const slugify = (input: unknown, fallback: string) => {
    const value = typeof input === 'string' ? input : ''
    const slug = value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
      .replace(/^-+|-+$/g, '')
      .replace(/-+/g, '-')
    return slug || fallback
  }

  const toPagesArray = (pages: any): number[] => {
    if (!Array.isArray(pages)) return []
    const filtered = pages
      .map((n) => (typeof n === 'number' ? Math.trunc(n) : Number(n)))
      .filter((n) => Number.isInteger(n) && n > 0)
    return Array.from(new Set(filtered)).sort((a, b) => a - b)
  }

  const ensureAnchor = (value: unknown, seed: string, fallbackPrefix: string) => {
    if (typeof value === 'string' && value.trim().length) return value.trim()
    return slugify(seed, fallbackPrefix)
  }

  const deriveOrdinal = (raw: unknown, text: string, regex: RegExp, fallback: string) => {
    if (typeof raw === 'string' && raw.trim().length) return raw.trim()
    const match = text.match(regex)
    if (match && match[1]) return match[1].toUpperCase()
    return fallback
  }

  const sanitizeArticulos = (articulos?: any[]) => {
    if (!Array.isArray(articulos)) return []
    return articulos
      .filter((art) => art && typeof art === 'object')
      .map((art) => {
        const numero = (() => {
          if (typeof art?.numero === 'string' && art.numero.trim().length) return art.numero.trim()
          if (typeof art?.articulo_num === 'number') return String(art.articulo_num)
          if (typeof art?.articulo_num === 'string' && art.articulo_num.trim().length) return art.articulo_num.trim()
          if (typeof art?.articulo === 'string' && art.articulo.trim().length) return art.articulo.trim()
          if (typeof art?.articulo_numero === 'string' && art.articulo_numero.trim().length) return art.articulo_numero.trim()
          return '?'
        })()
        const texto = sanitizeArticleText(
          art?.articulo_texto ||
          art?.texto_encabezado ||
          (typeof art?.titulo === 'string' ? art.titulo : '') ||
          `Artículo ${numero}`,
        )
        const anchor = ensureAnchor(art?.anchor, `${texto || numero}`, `articulo-${numero}`)
        const pageSource = art?.pages ?? art?.rango_paginas ?? art?.rango ?? art?.page ?? null
        return {
          numero,
          articulo_texto: texto || `Artículo ${numero}`,
          anchor,
          pages: toPagesArray(pageSource),
        }
      })
  }

  const sanitizeSecciones = (secciones?: any[]) => {
    if (!Array.isArray(secciones)) return []
    return secciones
      .filter((sec) => sec && typeof sec === 'object')
      .map((sec) => {
        const baseText = typeof sec?.seccion_texto === 'string' && sec.seccion_texto.trim().length
          ? sec.seccion_texto.trim()
          : typeof sec?.titulo === 'string' && sec.titulo.trim().length
            ? sec.titulo.trim()
            : ''
        const ordinal = deriveOrdinal(sec?.ordinal, baseText, /SECCI[ÓO]N\s+([IVXLCDM]+|\d+)/i, '?')
        const seccionTexto = baseText || `SECCIÓN ${ordinal}`
        const anchor = ensureAnchor(sec?.anchor, seccionTexto, `seccion-${ordinal}`)
        return {
          ordinal,
          seccion_texto: seccionTexto,
          anchor,
          pages: toPagesArray(sec?.pages),
          articulos: sanitizeArticulos(sec?.articulos),
        }
      })
  }

  const sanitizeCapitulos = (capitulos?: any[]) => {
    if (!Array.isArray(capitulos)) return []
    return capitulos
      .filter((cap) => cap && typeof cap === 'object')
      .map((cap) => {
        const baseText = typeof cap?.capitulo_texto === 'string' && cap.capitulo_texto.trim().length
          ? cap.capitulo_texto.trim()
          : typeof cap?.titulo === 'string' && cap.titulo.trim().length
            ? cap.titulo.trim()
            : ''
        const ordinal = deriveOrdinal(cap?.ordinal, baseText, /CAP[ÍI]TULO\s+([IVXLCDM]+|\d+)/i, '?')
        const capituloTexto = baseText || `CAPÍTULO ${ordinal}`
        const anchor = ensureAnchor(cap?.anchor, capituloTexto, `capitulo-${ordinal}`)
        return {
          ordinal,
          capitulo_texto: capituloTexto,
          anchor,
          pages: toPagesArray(cap?.pages),
          secciones: sanitizeSecciones(cap?.secciones),
          articulos: sanitizeArticulos(cap?.articulos),
        }
      })
  }

  const sanitizeTitulos = (titulos?: any[]) => {
    if (!Array.isArray(titulos)) return []
    return titulos
      .filter((titulo) => titulo && typeof titulo === 'object')
      .map((titulo) => {
        let data = titulo
        const keys = Object.keys(titulo)

        if (keys.length === 1 && typeof titulo[keys[0]] === 'object' && titulo[keys[0]]) {
          const candidate = titulo[keys[0]]
          if (typeof candidate === 'object') {
            data = { ...candidate }
            if (!data.ordinal) data.ordinal = candidate.ordinal
            if (!data.titulo_texto && typeof candidate.titulo === 'string') data.titulo_texto = candidate.titulo
            if (!data.anchor && typeof candidate.anchor === 'string') data.anchor = candidate.anchor
            if (!data.pages && candidate.pages) data.pages = candidate.pages
            if (!data.capitulos && candidate.capitulos) data.capitulos = candidate.capitulos
            if (!data.articulos && candidate.articulos) data.articulos = candidate.articulos
          }

          if (!data.titulo_texto && keys[0]) {
            const textual = keys[0]
              .replace(/^ti[-_]?tulo/i, 'Título ')
              .replace(/^titulo/i, 'Título ')
              .replace(/[_-]+/g, ' ')
              .replace(/\s+/g, ' ')
              .trim()
            if (textual.length) data.titulo_texto = textual
          }
        }

        if (!data.titulo_texto && typeof data.titulo === 'string') {
          data.titulo_texto = data.titulo
        }

        const titleKey = keys.find((k) => k !== 'titulo_texto' && k !== 'titulo' && /ti.?tulo/i.test(k) && typeof (data as any)[k] === 'string')
        if (titleKey && !data.titulo_texto) {
          data.titulo_texto = (data as any)[titleKey]
        }

        const baseText = typeof data?.titulo_texto === 'string' && data.titulo_texto.trim().length
          ? data.titulo_texto.trim()
          : typeof data?.titulo === 'string' && data.titulo.trim().length
            ? data.titulo.trim()
            : ''
        const ordinal = deriveOrdinal(data?.ordinal, baseText, /T[ÍI]TULO\s+(PRELIMINAR|[IVXLCDM]+|\d+)/i, '?')
        const tituloTexto = baseText || `TÍTULO ${ordinal}`
        const anchor = ensureAnchor(data?.anchor, tituloTexto, `titulo-${ordinal}`)
        let capitulosRaw = Array.isArray(data?.capitulos) ? data.capitulos : Array.isArray(data?.cap) ? data.cap : []
        let articulosRaw = Array.isArray(data?.articulos) ? data.articulos : Array.isArray(data?.art) ? data.art : []

        if (Array.isArray(articulosRaw) && articulosRaw.every((item) => typeof item !== 'object')) {
          articulosRaw = articulosRaw.map((item, idx) => ({
            numero: typeof item === 'number' ? String(item) : (typeof item === 'string' ? item : String(idx + 1)),
          }))
        }

        return {
          ordinal,
          titulo_texto: tituloTexto,
          anchor,
          pages: toPagesArray(data?.pages || data?.rango),
          capitulos: sanitizeCapitulos(capitulosRaw),
          articulos: sanitizeArticulos(articulosRaw),
        }
      })
  }

  const sanitizeDisposiciones = (items?: any[]) => {
    if (!Array.isArray(items)) return []
    return items
      .filter((dis) => dis && typeof dis === 'object')
      .map((dis) => {
        const numero = (() => {
          if (typeof dis?.numero === 'string' && dis.numero.trim().length) return dis.numero.trim()
          if (typeof dis?.numero === 'number') return String(dis.numero)
          if (typeof dis?.titulo === 'string') {
            const match = dis.titulo.match(/(PRE[ÍI]MBULO|[A-ZÁÉÍÓÚ]+|\d+)/i)
            if (match) return match[1].toUpperCase()
          }
          return '?'
        })()
        const texto = sanitizeArticleText(dis?.texto_encabezado || dis?.titulo || `Disposición ${numero}`)
        const anchor = ensureAnchor(dis?.anchor, texto || numero, `disposicion-${numero}`)
        return {
          numero,
          texto_encabezado: texto || `Disposición ${numero}`,
          anchor,
          pages: toPagesArray(dis?.pages),
        }
      })
  }

  const dispositionBuckets = {
    adicionales: [] as DisposicionItem[],
    transitorias: [] as DisposicionItem[],
    derogatorias: [] as DisposicionItem[],
    finales: [] as DisposicionItem[],
  }

  const pushDisposItems = (entries?: any[], type?: keyof typeof dispositionBuckets) => {
    if (!Array.isArray(entries) || !type) return
    dispositionBuckets[type].push(...sanitizeDisposiciones(entries) as DisposicionItem[])
  }

  const classifyDisposProps = (raw: any) => {
    if (!raw || typeof raw !== 'object') return
    for (const [key, value] of Object.entries(raw)) {
      const lower = key.toLowerCase()
      if (lower.includes('adicional')) {
        pushDisposItems(value as any[], 'adicionales')
      } else if (lower.includes('transitor')) {
        pushDisposItems(value as any[], 'transitorias')
      } else if (lower.includes('derogator')) {
        pushDisposItems(value as any[], 'derogatorias')
      } else if (lower.includes('final')) {
        pushDisposItems(value as any[], 'finales')
      }
    }
  }

  if (outline?.disposiciones) {
    classifyDisposProps(outline.disposiciones)
  }

  const sanitizeMetadata = (metadata: any) => {
    const fallback = {
      document_title: 'Documento legal',
      source: 'Documento legal',
      language: 'es',
      generated_at: new Date().toISOString().slice(0, 10),
    }
    if (!metadata || typeof metadata !== 'object') return fallback
    const result = { ...fallback }
    if (typeof metadata.document_title === 'string' && metadata.document_title.trim()) result.document_title = metadata.document_title.trim()
    if (typeof metadata.source === 'string' && metadata.source.trim()) result.source = metadata.source.trim()
    if (typeof metadata.language === 'string' && metadata.language.trim()) result.language = metadata.language.trim()
    if (typeof metadata.generated_at === 'string' && metadata.generated_at.trim()) result.generated_at = metadata.generated_at.trim()
    result.language = 'es'
    return result
  }

  const normalizeFront = (entry: any, fallbackAnchor: string) => {
    const present = typeof entry === 'boolean' ? entry : Boolean(entry?.present)
    const anchorRaw = typeof entry?.anchor === 'string' && entry.anchor.trim().length ? entry.anchor.trim() : ''
    const anchor = present ? ensureAnchor(anchorRaw, fallbackAnchor, fallbackAnchor) : anchorRaw || null
    const pagesArray = Array.isArray(entry?.pages) ? toPagesArray(entry.pages).slice(0, 2) : []
    return {
      present,
      anchor,
      pages: present && pagesArray.length ? pagesArray : null,
    }
  }

  const normalizedMetadata = sanitizeMetadata(outline.metadata)
  const normalizedTitulos = sanitizeTitulos(outline.titulos)

  const sanitizedDisposiciones = {
    adicionales: dispositionBuckets.adicionales,
    transitorias: dispositionBuckets.transitorias,
    derogatorias: dispositionBuckets.derogatorias,
    finales: dispositionBuckets.finales,
  }

  const frontRaw = outline?.front_matter && typeof outline.front_matter === 'object' ? outline.front_matter : {}
  const sanitizedFront = {
    preambulo: normalizeFront(
      frontRaw.preambulo ?? frontRaw.preambulo_present ?? frontRaw.preambulo_bool ?? frontRaw.preambulo_flag ?? frontRaw.preambulo_value ?? false,
      'preambulo',
    ),
    exposicion_motivos: normalizeFront(
      frontRaw.exposicion_motivos ?? frontRaw.exposicion ?? frontRaw.exposicion_de_motivos ?? frontRaw.exposicion_bool ?? frontRaw.exposicion_flag ?? frontRaw.exposicion_value ?? false,
      'exposicion-motivos',
    ),
  }

  return {
    metadata: normalizedMetadata,
    front_matter: sanitizedFront,
    titulos: normalizedTitulos,
    disposiciones: sanitizedDisposiciones,
  }
}

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json()
    const source = typeof payload?.source === 'string' ? payload.source : ''
    const lawName = typeof payload?.lawName === 'string' ? payload.lawName : ''
    const schema = payload?.schema ?? null
    const metadataPayload = payload?.metadata ?? {}
    const pagesChunk = Array.isArray(payload?.pagesChunk) ? payload.pagesChunk : []

    if (!pagesChunk.length) {
      return NextResponse.json({ ok: false, error: 'pagesChunk requerido' }, { status: 400 })
    }

    const normalizedPages: PageEntry[] = pagesChunk.map((entry: any, idx: number) => ({
      num: typeof entry?.num === 'number' ? entry.num : idx + 1,
      text: typeof entry?.text === 'string' ? entry.text : '',
    }))

    const hasContent = normalizedPages.some((entry) => entry.text.trim().length > 0)
    if (!hasContent) {
      return NextResponse.json({ ok: false, error: 'Sin texto utilizable en pagesChunk' }, { status: 400 })
    }

    const firstPage = normalizedPages[0].num
    const lastPage = normalizedPages[normalizedPages.length - 1].num
    const { text } = buildTextFromPages(normalizedPages)
    const metadata = {
      document_title: typeof metadataPayload?.document_title === 'string' && metadataPayload.document_title.trim().length
        ? metadataPayload.document_title
        : lawName || source || 'Documento legal',
      source: typeof metadataPayload?.source === 'string' && metadataPayload.source.trim().length
        ? metadataPayload.source
        : source || lawName || 'Documento legal',
      language: typeof metadataPayload?.language === 'string' && metadataPayload.language.trim().length
        ? metadataPayload.language
        : 'es',
      generated_at: typeof metadataPayload?.generated_at === 'string' && metadataPayload.generated_at.trim().length
        ? metadataPayload.generated_at
        : new Date().toISOString().slice(0, 10),
    }

    const prompt = buildMentalOutlineChunkPrompt({
      source: source || lawName,
      schemaAcumulado: schema,
      loteTexto: text,
      rangoPaginas: [firstPage, lastPage],
      metadata,
    })

    logEvent('mentalOutline.chunk.prompt', {
      source: source || lawName,
      from: firstPage,
      to: lastPage,
      size: text.length,
    })

    const outline = await callModelJSON(prompt, 60000, 4000, {
      endpoint: 'mental-outline-chunk',
      source: source || lawName,
      range: [firstPage, lastPage],
      pages: normalizedPages.length,
    })

    const schemaAcumuladoRaw = outline?.schema_acumulado ?? outline

    logEvent('mentalOutline.chunk.response', {
      source: source || lawName,
      from: firstPage,
      to: lastPage,
      titulos: Array.isArray(schemaAcumuladoRaw?.titulos) ? schemaAcumuladoRaw.titulos.length : undefined,
    })

    if (!schemaAcumuladoRaw || typeof schemaAcumuladoRaw !== 'object') {
      throw new Error('Respuesta sin esquema válido')
    }

    const schemaAcumuladoRawObj = {
      metadata: schemaAcumuladoRaw.metadata,
      front_matter: schemaAcumuladoRaw.front_matter,
      titulos: schemaAcumuladoRaw.titulos,
      disposiciones: schemaAcumuladoRaw.disposiciones,
    }

    const schemaAcumulado = sanitizeOutline(schemaAcumuladoRawObj)

    const valid = validateMentalOutline(schemaAcumulado)
    if (!valid) {
      const details = (validateMentalOutline.errors || []).map((err) => `${err.instancePath || '/'} ${err.message}`).join('; ')
      throw new Error(`Respuesta inválida (schema): ${details}`)
    }

    // corrige front matter para mapear a páginas reales si es necesario
    if (schemaAcumulado.front_matter) {
      const mapPage = (pages: number[] | null) => {
        if (!pages || pages.length === 0) return null
        const mapped = pages.map((p) => normalizedPages[0].num + (p - pages[0])).filter((p) => Number.isInteger(p))
        return mapped.length ? mapped as number[] : pages
      }
      schemaAcumulado.front_matter.preambulo.pages = mapPage(schemaAcumulado.front_matter.preambulo.pages)
      if (schemaAcumulado.front_matter.exposicion_motivos) {
        schemaAcumulado.front_matter.exposicion_motivos.pages = mapPage(schemaAcumulado.front_matter.exposicion_motivos.pages)
      }
    }

    return NextResponse.json({ ok: true, outline: schemaAcumulado })
  } catch (error: any) {
    const message = typeof error?.message === 'string' ? error.message : 'Error generando esquema por lotes'
    logEvent('mentalOutline.chunk.error', { error: message })
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

