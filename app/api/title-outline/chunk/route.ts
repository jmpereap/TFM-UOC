import { NextRequest, NextResponse } from 'next/server'
import Ajv2020 from 'ajv/dist/2020'
import addFormats from 'ajv-formats'
import path from 'node:path'
import fs from 'node:fs'
import { buildTextFromPages, PageEntry } from '@/lib/pdf/pagesMap'
import { callModelJSON } from '@/lib/qa/callModel'
import { logEvent } from '@/lib/logging/logger'
import { buildTitlesOnlyChunkPrompt } from '@/lib/qa/promptsTitlesOnly'
import { titlesOnlySchema } from '@/lib/schema/titlesOnly'
import type { TitlesOnlyOutline, TituloRange } from '@/types/titlesOnly'
import { mergeTitlesOnly } from '@/lib/utils/mergeTitlesOnly'

export const runtime = 'nodejs'

const ajv = new Ajv2020({ allErrors: true })
addFormats(ajv)
const validateTitlesOnly = ajv.compile(titlesOnlySchema)

function slugify(input: string, fallback: string) {
  const slug = (input || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-')
  return slug || fallback
}

function deriveOrdinal(text?: string | null) {
  const t = (text || '').trim()
  const m = t.match(/T[ÍI]TULO\s+(PRELIMINAR|[IVXLCDM]+|\d+)/i)
  return m?.[1]?.toUpperCase() || '?'
}

function sanitizeTitlesOutline(raw: any): TitlesOnlyOutline {
  const md = raw?.metadata || {}
  const metadata = {
    document_title: typeof md?.document_title === 'string' && md.document_title.trim() ? md.document_title.trim() : 'Documento legal',
    source: typeof md?.source === 'string' && md.source.trim() ? md.source.trim() : 'Documento legal',
    language: 'es',
    generated_at: typeof md?.generated_at === 'string' && md.generated_at.trim() ? md.generated_at.trim() : new Date().toISOString().slice(0, 10),
  }
  const items: any[] = Array.isArray(raw?.titulos) ? raw.titulos : []
  const titulos: TituloRange[] = items
    .filter((x) => x && typeof x === 'object')
    .map((x) => {
      const titulo_texto = typeof x?.titulo_texto === 'string' && x.titulo_texto.trim() ? x.titulo_texto.trim() : ''
      const definicion = typeof x?.definicion === 'string' ? x.definicion.trim() : ''
      const ordinal = typeof x?.ordinal === 'string' && x.ordinal.trim() ? x.ordinal.trim().toUpperCase() : deriveOrdinal(titulo_texto)
      const anchorInput = typeof x?.anchor === 'string' && x.anchor.trim() ? x.anchor.trim() : ''
      const anchor = anchorInput || slugify(`titulo-${ordinal}`, `titulo-${ordinal || 'x'}`)
      const page_start = Number.isFinite(x?.page_start) ? Math.max(1, Math.trunc(Number(x.page_start))) : 1
      const page_end = x?.page_end === null ? null : (Number.isFinite(x?.page_end) ? Math.max(1, Math.trunc(Number(x.page_end))) : null)
      return {
        ordinal,
        titulo_texto: titulo_texto || `TÍTULO ${ordinal}`,
        definicion,
        anchor,
        page_start,
        page_end,
      }
    })
  return { metadata, titulos }
}

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json()
    const source = typeof payload?.source === 'string' ? payload.source : ''
    const lawName = typeof payload?.lawName === 'string' ? payload.lawName : ''
    const schemaPrevRaw = payload?.schema ?? null
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

    logEvent('titlesOnly.chunk.prompt.build', { source: source || lawName, from: firstPage, to: lastPage })
    const prompt = buildTitlesOnlyChunkPrompt({
      source: source || lawName,
      schemaAcumulado: schemaPrevRaw as TitlesOnlyOutline | null,
      loteTexto: text,
      rangoPaginas: [firstPage, lastPage],
      metadata,
    })

    const result = await callModelJSON(prompt, 60000, 2000, {
      endpoint: 'titles-only-chunk',
      source: source || lawName,
      range: [firstPage, lastPage],
      pages: normalizedPages.length,
    })

    const outlineRaw = {
      metadata: result?.metadata,
      titulos: result?.titulos,
    }
    const outlineSanitized = sanitizeTitlesOutline(outlineRaw)

    // map to absolute pages if the model returned relative indices
    const maybeMapPage = (p: number | null) => {
      if (p === null) return null
      // If it's already in [firstPage, lastPage], keep it
      if (p >= firstPage && p <= lastPage) return p
      // If it looks like relative within chunk, map from firstPage
      if (p >= 1 && p <= (lastPage - firstPage + 1)) return firstPage + (p - 1)
      return p
    }
    outlineSanitized.titulos = outlineSanitized.titulos.map((t) => ({
      ...t,
      page_start: maybeMapPage(t.page_start) || t.page_start,
      page_end: t.page_end === null ? null : (maybeMapPage(t.page_end) || t.page_end),
    }))

    // merge with previous
    let schemaPrev: TitlesOnlyOutline | null = null
    if (schemaPrevRaw && typeof schemaPrevRaw === 'object') {
      try {
        schemaPrev = sanitizeTitlesOutline(schemaPrevRaw)
      } catch {
        schemaPrev = schemaPrevRaw as TitlesOnlyOutline
      }
    }
    const finalSchema = mergeTitlesOnly(schemaPrev, outlineSanitized)

    const valid = validateTitlesOnly(finalSchema)
    if (!valid) {
      const details = (validateTitlesOnly.errors || []).map((err) => `${err.instancePath || '/'} ${err.message}`).join('; ')
      throw new Error(`Respuesta inválida (titles-only): ${details}`)
    }

    // logging
    try {
      const timestamp = new Date().toISOString()
      const safeTs = timestamp.replace(/[:.]/g, '-')
      const dir = path.join(process.cwd(), 'logs')
      const filePath = path.join(dir, `title-outline-chunk-${safeTs}.json`)
      fs.mkdirSync(dir, { recursive: true })
      const pagesRange: [number, number] = [firstPage, lastPage]
      const logPayload = {
        timestamp,
        source: source || lawName,
        pagesRange,
        schemaPrev,
        resultRaw: result,
        outlineSanitized,
        finalSchema,
      }
      fs.writeFileSync(filePath, JSON.stringify(logPayload, null, 2), 'utf8')
    } catch (e: any) {
      logEvent('titlesOnly.chunk.logfile.error', { error: String(e?.message || e) })
    }

    return NextResponse.json({ ok: true, outline: finalSchema })
  } catch (error: any) {
    const message = typeof error?.message === 'string' ? error.message : 'Error detectando títulos por lotes'
    logEvent('titlesOnly.chunk.error', { error: message })
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}







