import { NextRequest, NextResponse } from 'next/server'
import { buildMentalOutlinePrompt } from '@/lib/qa/promptsMentalOutline'
import { callModelJSON } from '@/lib/qa/callModel'
import { logEvent } from '@/lib/logging/logger'
import { buildTextFromPages, PageEntry } from '@/lib/pdf/pagesMap'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json()
    const source = typeof payload?.source === 'string' ? payload.source : ''
    const lawName = typeof payload?.lawName === 'string' ? payload.lawName : ''
    const pagesFull = Array.isArray(payload?.pagesFull) ? payload.pagesFull : []

    if (!pagesFull.length) {
      return NextResponse.json({ ok: false, error: 'pagesFull requerido' }, { status: 400 })
    }

    const normalizedPages: PageEntry[] = pagesFull.map((entry: any, idx: number) => ({
      num: typeof entry?.num === 'number' ? entry.num : idx + 1,
      text: typeof entry?.text === 'string' ? entry.text : '',
    }))

    const hasContent = normalizedPages.some((entry) => entry.text.trim().length > 0)
    if (!hasContent) {
      return NextResponse.json({ ok: false, error: 'Sin texto utilizable en pagesFull' }, { status: 400 })
    }

    const { text, pagesMap } = buildTextFromPages(normalizedPages)
    if (!text.trim()) {
      return NextResponse.json({ ok: false, error: 'Texto vacío tras normalización' }, { status: 400 })
    }
    const prompt = buildMentalOutlinePrompt({
      source: source || lawName,
      text,
      pagesMap,
    })

    logEvent('mentalOutline.prompt', { source: source || lawName, pages: normalizedPages.length, size: text.length })

    const outline = await callModelJSON(prompt, 60000, 1800, {
      endpoint: 'mental-outline',
      source: source || lawName,
      pages: normalizedPages.length,
    })

    logEvent('mentalOutline.response', {
      source: source || lawName,
      titulos: Array.isArray(outline?.titulos) ? outline.titulos.length : 0,
    })

    return NextResponse.json({ ok: true, outline })
  } catch (error: any) {
    const message = typeof error?.message === 'string' ? error.message : 'Error generando esquema'
    logEvent('mentalOutline.error', { error: message })
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

