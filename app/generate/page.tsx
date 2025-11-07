'use client';

import { useEffect, useMemo, useRef, useState } from 'react'
import type { MCQItem, OptionKey } from '@/types/mcq'
import type { MentalOutline, DisposicionItem } from '@/types/mentalOutline'
import MCQCard from '@/components/MCQCard'
import DragDropUpload from '@/components/DragDropUpload'
import Modal from '@/components/Modal'
import { useLocalStorage } from '@/hooks/useLocalStorage'

type Result = { isCorrect: boolean }

function baseNameFromFile(file?: File | null) {
  if (!file?.name) return ''
  return file.name.replace(/\.[^.]+$/, '')
}

function deriveLawName(metaInfo: any, file?: File | null) {
  const title = (metaInfo?.Title || metaInfo?.title || '').toString().trim()
  const fromMeta = title && title.length > 2 ? title : ''
  const fromFile = baseNameFromFile(file)
  const raw = fromMeta || fromFile || ''
  return raw.slice(0, 80)
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))
const MIN_Q = 1
const MAX_Q = 20
const MENTAL_OUTLINE_CHUNK_SIZES = [3, 2, 1] as const

type OutlineProgress = {
  processed: number
  total: number
  lastChunk: number
}

function formatPages(pages?: number[] | null) {
  if (!pages || pages.length === 0) return ''
  if (pages.length === 1) return `p. ${pages[0]}`
  return `p. ${pages[0]}–${pages[pages.length - 1]}`
}

const ORDINAL_REGEX = {
  titulo: /T[ÍI]TULO\s+(PRELIMINAR|[IVXLCDM]+|\d+)/i,
  capitulo: /CAP[ÍI]TULO\s+(PRELIMINAR|[IVXLCDM]+|\d+)/i,
  seccion: /SECCI[ÓO]N\s+([IVXLCDM]+|\d+)/i,
} as const

const LABELS = {
  titulo: 'TÍTULO',
  capitulo: 'CAPÍTULO',
  seccion: 'SECCIÓN',
} as const

const DISPOSITION_PREFIX: Record<'adicionales' | 'transitorias' | 'derogatorias' | 'finales', string> = {
  adicionales: 'Adicional',
  transitorias: 'Transitoria',
  derogatorias: 'Derogatoria',
  finales: 'Final',
}

const ARTICLE_NUMBER_REGEX = /Artículo\s+([\wºª\.]+(?:\s+(?:bis|ter|quater|quinquies))?)/i
const DISPOSITION_REGEX = /Disposición\s+(Adicional|Transitoria|Derogatoria|Final)\s+([\wáéíóúüñºª]+)?/i

function toRoman(value: number) {
  if (value <= 0) return String(value)
  const numerals: [number, string][] = [
    [1000, 'M'],
    [900, 'CM'],
    [500, 'D'],
    [400, 'CD'],
    [100, 'C'],
    [90, 'XC'],
    [50, 'L'],
    [40, 'XL'],
    [10, 'X'],
    [9, 'IX'],
    [5, 'V'],
    [4, 'IV'],
    [1, 'I'],
  ]
  let remaining = Math.floor(value)
  let result = ''
  for (const [num, roman] of numerals) {
    while (remaining >= num) {
      result += roman
      remaining -= num
    }
  }
  return result || String(value)
}

function extractOrdinalFromText(kind: keyof typeof ORDINAL_REGEX, text?: string | null) {
  if (!text) return ''
  const match = text.match(ORDINAL_REGEX[kind])
  if (!match) return ''
  return (match[1] || '').toUpperCase()
}

function resolveOrdinal(kind: keyof typeof ORDINAL_REGEX, raw: string | undefined | null, text: string | undefined | null, index: number) {
  const cleaned = raw?.replace(/\?/g, '').trim()
  if (cleaned) return cleaned
  const fromText = extractOrdinalFromText(kind, text)
  if (fromText) return fromText
  if (kind === 'titulo' || kind === 'capitulo' || kind === 'seccion') {
    return toRoman(index + 1)
  }
  return String(index + 1)
}

function resolveLabel(kind: keyof typeof ORDINAL_REGEX, text: string | undefined | null, ordinal: string) {
  const cleanedText = text?.trim()
  if (cleanedText && !cleanedText.includes('?')) {
    return cleanedText
  }
  return `${LABELS[kind]} ${ordinal}`
}

function normalizeArticleNumber(raw: string | undefined | null, text: string | undefined | null, index: number) {
  const cleaned = raw?.replace(/\?/g, '').trim()
  if (cleaned) return cleaned
  if (text) {
    const match = text.match(ARTICLE_NUMBER_REGEX)
    if (match) return match[1].replace(/\.$/, '').trim()
  }
  return String(index + 1)
}

function normalizeArticleHeading(text: string | undefined | null, number: string) {
  const cleaned = text?.trim()
  if (cleaned && !cleaned.match(/^Artículo\s+\?$/i)) return cleaned
  return `Artículo ${number}`
}

function normalizeDispositionNumber(item: DisposicionItem, fallbackIndex: number) {
  const cleaned = item.numero?.replace(/\?/g, '').trim()
  if (cleaned) return cleaned
  const match = item.texto_encabezado?.match(DISPOSITION_REGEX)
  if (match && match[2]) {
    return match[2].replace(/\.$/, '').trim()
  }
  return String(fallbackIndex + 1)
}

function normalizeDispositionHeading(prefix: string, item: DisposicionItem, number: string) {
  const cleaned = item.texto_encabezado?.trim()
  if (cleaned && !cleaned.includes('?')) return cleaned
  return `Disposición ${prefix} ${number}`
}

function OutlineTree({ outline }: { outline: MentalOutline }) {
  const renderArticulos = (articulos: MentalOutline['titulos'][number]['articulos']) => {
    if (!articulos?.length) return null
    return (
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {articulos.map((art, idx) => {
          const number = normalizeArticleNumber(art.numero, art.articulo_texto, idx)
          const heading = normalizeArticleHeading(art.articulo_texto, number)
          return (
            <div key={art.anchor || `${number}-${idx}`} className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs shadow-sm">
              <div className="font-semibold text-slate-700">Artículo {number}</div>
              {heading && (
                <div className="mt-1 text-slate-600">{heading}</div>
              )}
              {formatPages(art.pages) && <div className="mt-1 text-[11px] text-slate-500">{formatPages(art.pages)}</div>}
            </div>
          )
        })}
      </div>
    )
  }

  const renderSecciones = (secciones: MentalOutline['titulos'][number]['capitulos'][number]['secciones']) => {
    if (!secciones?.length) return null
    return (
      <div className="space-y-2">
        {secciones.map((sec, secIndex) => {
          const ordinal = resolveOrdinal('seccion', sec.ordinal, sec.seccion_texto, secIndex)
          const label = resolveLabel('seccion', sec.seccion_texto, ordinal)
          return (
            <details key={sec.anchor || `${label}-${secIndex}`} open className="rounded-lg border border-slate-200 bg-white/80 p-2 pl-3 text-xs shadow-sm">
              <summary className="flex cursor-pointer flex-wrap items-center gap-2 text-slate-700">
                <span className="font-semibold uppercase">Sección {ordinal}</span>
                <span className="text-slate-600">{label}</span>
                {formatPages(sec.pages) && <span className="ml-auto text-[11px] text-slate-500">{formatPages(sec.pages)}</span>}
              </summary>
              <div className="mt-2 space-y-2 border-l border-slate-200 pl-3">
                {renderArticulos(sec.articulos)}
              </div>
            </details>
          )
        })}
      </div>
    )
  }

  const renderCapitulos = (capitulos: MentalOutline['titulos'][number]['capitulos']) => {
    if (!capitulos?.length) return null
    return (
      <div className="space-y-3">
        {capitulos.map((cap, capIndex) => {
          const ordinal = resolveOrdinal('capitulo', cap.ordinal, cap.capitulo_texto, capIndex)
          const label = resolveLabel('capitulo', cap.capitulo_texto, ordinal)
          return (
            <details key={cap.anchor || `${label}-${capIndex}`} open className="rounded-xl border border-slate-200 bg-white p-3 text-xs shadow-sm">
              <summary className="flex cursor-pointer flex-wrap items-center gap-2 text-slate-700">
                <span className="font-semibold uppercase">Capítulo {ordinal}</span>
                <span className="text-slate-600">{label}</span>
                {formatPages(cap.pages) && <span className="ml-auto text-[11px] text-slate-500">{formatPages(cap.pages)}</span>}
              </summary>
              <div className="mt-3 space-y-3 border-l-2 border-slate-100 pl-4">
                {renderSecciones(cap.secciones)}
                {renderArticulos(cap.articulos)}
              </div>
            </details>
          )
        })}
      </div>
    )
  }

  const renderDisposGroup = (label: string, prefix: string, items: DisposicionItem[]) => {
    if (!items?.length) return null
    return (
      <details key={label} open className="rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-sm">
        <summary className="flex cursor-pointer items-center gap-2 text-slate-700">
          <span className="font-semibold">{label}</span>
          <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{items.length}</span>
        </summary>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((item, idx) => {
            const number = normalizeDispositionNumber(item, idx)
            const heading = normalizeDispositionHeading(prefix, item, number)
            const showBody = heading && heading !== `Disposición ${prefix} ${number}`
            return (
              <div key={item.anchor || `${prefix}-${idx}`} className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs shadow-sm">
                <div className="font-semibold text-slate-700">
                  Disposición {prefix} {number}
                </div>
                {showBody && (
                  <div className="mt-1 text-slate-600">{heading}</div>
                )}
                {formatPages(item.pages) && <div className="mt-1 text-[11px] text-slate-500">{formatPages(item.pages)}</div>}
              </div>
            )
          })}
        </div>
      </details>
    )
  }

  const tituloCards = outline.titulos.map((titulo, index) => {
    const ordinal = resolveOrdinal('titulo', titulo.ordinal, titulo.titulo_texto, index)
    const label = resolveLabel('titulo', titulo.titulo_texto, ordinal)
    return (
      <details key={titulo.anchor || `${label}-${index}`} open className="rounded-2xl border border-slate-200 bg-white p-3 text-sm shadow-sm transition-all">
        <summary className="flex cursor-pointer flex-wrap items-center gap-2 text-slate-800">
          <span className="rounded-lg bg-indigo-100 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-indigo-700">
            Título {ordinal}
          </span>
          <span>{label}</span>
          {formatPages(titulo.pages) && <span className="ml-auto text-xs text-slate-500">{formatPages(titulo.pages)}</span>}
        </summary>
        <div className="mt-3 space-y-3 border-l-2 border-indigo-100/70 pl-4">
          {renderCapitulos(titulo.capitulos)}
          {renderArticulos(titulo.articulos)}
        </div>
      </details>
    )
  })

  const frontMatterCards = [
    { label: 'Preámbulo', entry: outline.front_matter.preambulo },
    { label: 'Exposición de motivos', entry: outline.front_matter.exposicion_motivos },
  ].filter((item) => item.entry?.present)

  const disposSections = (Object.entries(outline.disposiciones) as [keyof typeof DISPOSITION_PREFIX, DisposicionItem[]][]) 
    .map(([key, list]) => renderDisposGroup(`Disposiciones ${key.charAt(0).toUpperCase()}${key.slice(1)}`, DISPOSITION_PREFIX[key], list))
    .filter(Boolean)

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm shadow-sm">
        <div className="text-base font-semibold text-slate-800">{outline.metadata.document_title}</div>
        <div className="mt-1 text-xs text-slate-600">Fuente: {outline.metadata.source}</div>
        <div className="mt-1 text-xs text-slate-500">
          Generado el {outline.metadata.generated_at} · Idioma: {outline.metadata.language.toUpperCase()}
        </div>
      </div>

      {frontMatterCards.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {frontMatterCards.map(({ label, entry }) => (
            <div key={label} className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs shadow-sm">
              <div className="font-semibold text-emerald-700">{label}</div>
              {formatPages(entry.pages) && <div className="text-[11px] text-emerald-600">{formatPages(entry.pages)}</div>}
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {tituloCards}
      </div>

      {disposSections.length > 0 && (
        <div className="space-y-3">{disposSections}</div>
      )}
    </div>
  )
}

export default function GeneratePage() {
  // PDF/bloques
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [blocks, setBlocks] = useState<any[]>([])
  const [pagesFull, setPagesFull] = useState<any[]>([])
  const [pdfSchema, setPdfSchema] = useState<string | null>(null)
  const [fileHash, setFileHash] = useState<string | null>(null)
  const [pagesCount, setPagesCount] = useState<number | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [blockSize, setBlockSize] = useLocalStorage<number>('tfm.blockSize', 5)
  const [overlap, setOverlap] = useLocalStorage<number>('tfm.overlap', 1)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [showBlocksModal, setShowBlocksModal] = useState(false)
  const viewAllBtnRef = useRef<HTMLButtonElement | null>(null)

  // Parámetros de generación
  const [lawName, setLawName] = useLocalStorage<string>('tfm.lawName', '')
  const [userEditedLawName, setUserEditedLawName] = useLocalStorage<boolean>('tfm.userEditedLawName', false)
  const [lockedMode, setLockedMode] = useLocalStorage<boolean>('tfm.lockedLawName', false)
  const [lastMetaInfo, setLastMetaInfo] = useState<any>(null)
  const [n, setN] = useLocalStorage<number>('tfm.n', 10)

  // Items y corrección
  const [items, setItems] = useState<MCQItem[]>([])
  const [answers, setAnswers] = useState<Record<number, OptionKey | null>>({})
  const [corrected, setCorrected] = useState<Record<number, boolean>>({})
  const [results, setResults] = useState<Record<number, Result>>({})
  const [score, setScore] = useState<number | null>(null)
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState<string | null>(null)
  const [includeCorrect, setIncludeCorrect] = useLocalStorage<boolean>('tfm.includeCorrect', true)
  const [sumMode, setSumMode] = useState<'ejecutivo' | 'estructurado'>('estructurado')
  const [sumLen, setSumLen] = useState<'corto' | 'medio' | 'largo'>('medio')
  const [summaryMode, setSummaryMode] = useState<'rapido' | 'exhaustivo'>('exhaustivo')
  const [summary, setSummary] = useState<any | null>(null)
  const [summLoading, setSummLoading] = useState(false)
  const [mentalOutline, setMentalOutline] = useState<MentalOutline | null>(null)
  const [mentalOutlineLoading, setMentalOutlineLoading] = useState(false)
  const [mentalOutlineError, setMentalOutlineError] = useState<string | null>(null)
  const [mentalOutlineProgress, setMentalOutlineProgress] = useState<OutlineProgress | null>(null)
  const [outlineViewMode, setOutlineViewMode] = useState<'tree' | 'json'>('tree')

  // Paginación
  const PAGE_SIZE = 5
  const [page, setPage] = useState(1)
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE))
  const pageStart = (page - 1) * PAGE_SIZE
  const pageEnd = Math.min(items.length, page * PAGE_SIZE)
  const pageItems = useMemo(() => items.slice(pageStart, pageEnd), [items, page, pageStart, pageEnd])
  useEffect(() => { setPage(1) }, [items])

  useEffect(() => {
    if (mentalOutline) {
      setOutlineViewMode('tree')
    }
  }, [mentalOutline])
  const unansweredVisible = useMemo(
    () => pageItems.reduce((acc, _, i) => acc + (answers[pageStart + i] ? 0 : 1), 0),
    [pageItems, answers, pageStart]
  )

  // Validación solape y accesibilidad modal
  const overlapMax = Math.max(0, blockSize - 1)
  const overlapInvalid = overlap < 0 || overlap > overlapMax
  const wasOpenRef = useRef(false)
  useEffect(() => {
    if (wasOpenRef.current && !showBlocksModal) {
      viewAllBtnRef.current?.focus()
    }
    wasOpenRef.current = showBlocksModal
  }, [showBlocksModal])

  // Ancla a listado y paginación numerada
  const listRef = useRef<HTMLDivElement | null>(null)
  function getPageNumbers(current: number, total: number, maxLength = 7): (number | string)[] {
    if (total <= maxLength) return Array.from({ length: total }, (_, i) => i + 1)
    const siblings = 1
    const start = Math.max(2, current - siblings)
    const end = Math.min(total - 1, current + siblings)
    const pages: (number | string)[] = [1]
    if (start > 2) pages.push('…')
    for (let p = start; p <= end; p++) pages.push(p)
    if (end < total - 1) pages.push('…')
    pages.push(total)
    return pages
  }
  function Paginator() {
    const nums = getPageNumbers(page, totalPages)
    if (items.length === 0) return null
    return (
      <div className="flex items-center justify-between py-2">
        <div className="flex items-center gap-1 text-xs">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="px-2 py-1 rounded bg-slate-200 text-slate-800 disabled:opacity-50"
          >
            Anterior
          </button>
          {nums.map((p, idx) => (
            typeof p === 'number' ? (
              <button
                key={idx}
                type="button"
                onClick={() => setPage(p)}
                className={`px-2 py-1 rounded ${p === page ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-800 hover:bg-slate-200'}`}
              >
                {p}
              </button>
            ) : (
              <span key={idx} className="px-2 text-slate-500">{p}</span>
            )
          ))}
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="px-2 py-1 rounded bg-slate-200 text-slate-800 disabled:opacity-50"
          >
            Siguiente
          </button>
        </div>
        <div className="text-xs text-slate-600">
          Mostrando {pageStart + 1}–{pageEnd} de {items.length} · Página {page}/{totalPages}
        </div>
      </div>
    )
  }

  // Control compacto preguntas/CTA
  const handleNChange = (v: number) => setN(clamp(v, MIN_Q, MAX_Q))
  const dec = () => handleNChange((Number(n) || MIN_Q) - 1)
  const inc = () => handleNChange((Number(n) || MIN_Q) + 1)
  const handleGenerate = async () => {
    if (!blocks?.length) return
    await onGenerate()
    listRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  // Subir PDF -> /api/upload
  const onUpload = async () => {
    if (!pdfFile) {
      setUploadError('Selecciona un PDF primero.')
      return
    }
    setUploadError(null)
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', pdfFile)
      fd.append('blockSize', String(Math.max(1, blockSize)))
      fd.append('overlap', String(Math.max(0, Math.min(blockSize - 1, overlap))))
      const res = await fetch('/api/upload', { method: 'POST', body: fd })
      if (!res.ok) throw new Error('Fallo en /api/upload')
      const data = await res.json()
      setPagesCount(typeof data?.pages === 'number' ? data.pages : data?.meta?.numPages ?? null)
      setBlocks(data.blocks || [])
      setPagesFull(data.pagesFull || [])
      setPdfSchema(data.pdfSchema || null)
      setFileHash(data?.meta?.fileHash || null)
      setLastMetaInfo(data?.meta?.info || null)
      setMentalOutline(null)
      setMentalOutlineError(null)
      if (!userEditedLawName) {
        const auto = deriveLawName(data?.meta?.info, pdfFile)
        if (auto) setLawName(auto)
      }
    } catch (e: any) {
      setUploadError(e?.message || 'Error subiendo el PDF.')
      setPagesCount(null)
      setBlocks([])
    } finally {
      setUploading(false)
    }
  }

  // Generar -> /api/generate
  const onGenerate = async () => {
    if (!lawName.trim()) {
      setGenError('Indica el nombre de la ley/norma.')
      return
    }
    if (!blocks.length) {
      setGenError('Primero sube el PDF y espera a que se detecten los bloques.')
      return
    }
    setGenError(null)
    setGenerating(true)
    setItems([])
    setAnswers({})
    setCorrected({})
    setResults({})
    setScore(null)
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lawName, n: Math.min(20, Math.max(1, n)), blocks }),
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || 'Fallo en /api/generate')
      setItems(data.items as MCQItem[])
    } catch (e: any) {
      setGenError(e?.message || 'Error generando preguntas.')
    } finally {
      setGenerating(false)
    }
  }

  const onChangeAnswer = (index: number, value: OptionKey) => {
    setAnswers((prev) => ({ ...prev, [index]: value }))
  }

  const correctOne = (index: number) => {
    const a = answers[index]
    if (!items[index]) return
    const ok = a === items[index].correcta
    setCorrected((prev) => ({ ...prev, [index]: true }))
    setResults((prev) => ({ ...prev, [index]: { isCorrect: !!ok } }))
  }

  const correctAll = () => {
    let total = 0
    const nextCorrected: Record<number, boolean> = { ...corrected }
    const nextResults: Record<number, Result> = { ...results }
    for (let gi = pageStart; gi < pageEnd; gi++) {
      const a = answers[gi]
      const it = items[gi]
      if (!it) continue
      const ok = a === it.correcta
      nextCorrected[gi] = true
      nextResults[gi] = { isCorrect: !!ok }
    }
    items.forEach((it, gi) => { if (answers[gi] === it.correcta) total += 1 })
    setCorrected(nextCorrected)
    setResults(nextResults)
    setScore(total)
  }

  async function exportItems(format: 'json' | 'csv' | 'pdf') {
    if (items.length === 0) return
    const res = await fetch('/api/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ format, items, lawName, includeCorrect }),
    })
    if (!res.ok) {
      alert('Error exportando: ' + (await res.text()))
      return
    }
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = format === 'json' ? 'preguntas.json' : format === 'csv' ? 'preguntas.csv' : 'preguntas.pdf'
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  async function onSummarize() {
    if (!blocks?.length) return
    setSummLoading(true)
    try {
      const res = await fetch('/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lawName, fileHash, pagesFull, blocks, mode: sumMode, length: sumLen, summaryMode }),
      })
      const txt = await res.text()
      let data: any = null
      try {
        data = JSON.parse(txt)
      } catch {
        const s = txt.indexOf('{')
        const e = txt.lastIndexOf('}')
        if (s >= 0 && e > s) {
          try { data = JSON.parse(txt.slice(s, e + 1)) } catch {}
        }
      }
      if (!data) throw new Error('Respuesta no JSON del servidor')
      if (!res.ok) throw new Error(data?.error || 'Error')
      setSummary(data.summary)
    } catch (e: any) {
      alert('Error al resumir: ' + e.message)
    } finally {
      setSummLoading(false)
    }
  }

  async function generateMentalOutlineSingle() {
    if (!pagesFull.length) {
      setMentalOutlineError('Primero sube el PDF y espera al análisis completo.')
      return
    }
    setMentalOutlineLoading(true)
    setMentalOutlineError(null)
    try {
      const res = await fetch('/api/mental-outline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lawName,
          source: lawName || pdfFile?.name || 'Documento sin título',
          pagesFull,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || 'Error generando esquema')
      }
      setMentalOutline(data.outline as MentalOutline)
    } catch (e: any) {
      setMentalOutlineError(e?.message || 'Error generando esquema')
    } finally {
      setMentalOutlineLoading(false)
    }
  }

  async function generateMentalOutlineChunks() {
    if (!pagesFull.length) {
      setMentalOutlineError('Primero sube el PDF y espera al análisis completo.')
      return
    }

    const totalPages = pagesFull.length
    if (!totalPages) {
      setMentalOutlineError('No hay páginas disponibles para procesar.')
      return
    }

    setMentalOutlineLoading(true)
    setMentalOutlineError(null)
    setMentalOutlineProgress({ processed: 0, total: totalPages, lastChunk: 0 })

    const today = new Date().toISOString().slice(0, 10)
    let metadataSeed = mentalOutline?.metadata || {
      document_title: lawName || pdfFile?.name?.replace(/\.[^.]+$/, '') || 'Documento legal',
      source: lawName || pdfFile?.name || 'Documento legal',
      language: 'es',
      generated_at: today,
    }

    let schema: MentalOutline | null = mentalOutline
    let processedPages = 0
    let startIndex = 0
    const adaptiveSizes = [...MENTAL_OUTLINE_CHUNK_SIZES]
    try {
      while (startIndex < totalPages) {
        const remaining = totalPages - startIndex
        let applied = false
        let attemptError: any = null

        for (let sizeIndex = 0; sizeIndex < adaptiveSizes.length; sizeIndex += 1) {
          const candidateSize = adaptiveSizes[sizeIndex]
          const size = Math.min(candidateSize, remaining)
          if (size <= 0) continue
          const chunk = pagesFull.slice(startIndex, startIndex + size)

          try {
            const res = await fetch('/api/mental-outline/chunk', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                lawName,
                source: lawName || pdfFile?.name || 'Documento sin título',
                schema,
                metadata: metadataSeed,
                pagesChunk: chunk,
              }),
            })
            let data: any = {}
            try {
              data = await res.json()
            } catch {}
            if (!res.ok || !data?.ok) {
              throw new Error(data?.error || `Error generando lote (${chunk.length} pág.)`)
            }

            schema = data.outline as MentalOutline
            setMentalOutline(schema)
            metadataSeed = schema.metadata || metadataSeed

            processedPages += chunk.length
            startIndex += chunk.length
            setMentalOutlineProgress({ processed: processedPages, total: totalPages, lastChunk: chunk.length })
            applied = true
            break
          } catch (err: any) {
            attemptError = err
            if (candidateSize > 1) {
              const idx = adaptiveSizes.indexOf(candidateSize)
              if (idx !== -1) {
                adaptiveSizes.splice(idx, 1)
                sizeIndex -= 1
              }
            }
            // Intentamos con un lote más pequeño en la siguiente iteración
            continue
          }
        }

        if (!applied) {
          const fallbackMsg = attemptError?.message || 'Error generando esquema por lotes'
          throw new Error(`Fallo procesando páginas ${startIndex + 1}-${Math.min(totalPages, startIndex + MENTAL_OUTLINE_CHUNK_SIZES[0])}: ${fallbackMsg}`)
        }
      }
    } catch (e: any) {
      setMentalOutlineError(e?.message || 'Error generando esquema por lotes')
    } finally {
      setMentalOutlineLoading(false)
      setMentalOutlineProgress(null)
    }
  }

  return (
    <div className="min-h-screen bg-white">
      <section className="sticky top-0 z-30 bg-white/85 backdrop-blur supports-[backdrop-filter]:bg-white/60 border-b">
        <div className="mx-auto max-w-5xl px-3 py-2">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-start">
            <div className="md:col-span-6 self-start">
              <DragDropUpload
                current={pdfFile}
                onSelect={(f) => {
                  setPdfFile(f)
                  if (f && !userEditedLawName && !lawName.trim()) setLawName(f.name.replace(/\.[^.]+$/, ''))
                }}
              />
              <button
                type="button"
                onClick={onUpload}
                disabled={uploading || !pdfFile || overlapInvalid}
                className="mt-2 h-9 px-3 rounded-lg bg-slate-900 text-white text-sm disabled:opacity-50"
              >
                {uploading ? 'Subiendo…' : 'Subir y detectar bloques'}
              </button>
            </div>
            <div className="md:col-span-6 md:col-start-7 self-start">
              <div className="rounded-2xl border border-slate-300 bg-white p-4 min-h-28 flex flex-col justify-center">
                <div className="flex flex-col">
                <label className="text-xs font-medium text-slate-700 mb-1">Preguntas</label>
                <form
                  onSubmit={(e) => { e.preventDefault(); handleGenerate() }}
                  className="flex items-stretch gap-1"
                  aria-label="Control de número de preguntas"
                >
                  <button
                    type="button"
                    onClick={dec}
                    disabled={n <= MIN_Q}
                    className="h-9 w-9 rounded-lg border border-slate-300 text-sm disabled:opacity-40"
                    aria-label="Disminuir número de preguntas"
                    title="Disminuir"
                  >
                    –
                  </button>
                  <input
                    type="number"
                    min={MIN_Q}
                    max={MAX_Q}
                    value={n}
                    onChange={(e) => handleNChange(Number(e.target.value) || MIN_Q)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleGenerate() } }}
                    className="h-9 w-16 text-center rounded-lg border border-slate-300 px-2 text-sm font-medium leading-tight"
                    aria-label="Número de preguntas"
                    title={`Número de preguntas (entre ${MIN_Q} y ${MAX_Q})`}
                  />
                  <button
                    type="button"
                    onClick={inc}
                    disabled={n >= MAX_Q}
                    className="h-9 w-9 rounded-lg border border-slate-300 text-sm disabled:opacity-40"
                    aria-label="Aumentar número de preguntas"
                    title="Aumentar"
                  >
                    +
                  </button>
                  <button
                    type="submit"
                    onClick={(e) => { e.preventDefault(); handleGenerate() }}
                    className={`h-9 px-3 rounded-lg ${generating ? 'bg-slate-400' : 'bg-emerald-600 hover:bg-emerald-700'} text-white text-sm font-semibold disabled:opacity-50`}
                    disabled={!blocks?.length || generating}
                    aria-label={`Generar ${n} preguntas`}
                    title={`Generar ${n} preguntas`}
                  >
                    {generating ? 'Generando' : 'Generar preguntas'}
                  </button>
                </form>
                <span className="mt-1 text-[11px] text-slate-500">Rango {MIN_Q}–{MAX_Q}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-3 py-3">
        <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-slate-600">Ley/norma:</span>
              {!lockedMode ? (
                <input
                  type="text"
                  value={lawName}
                  onChange={(e) => {
                    setLawName(e.target.value)
                    setUserEditedLawName(true)
                  }}
                  className="rounded-lg border border-slate-300 px-2 py-1 text-sm"
                />
              ) : (
                <span className="px-2 py-1 rounded-lg border border-slate-200 bg-slate-50">{lawName || '—'}</span>
              )}
              <button type="button" onClick={() => setLockedMode((v) => !v)} className="text-xs underline">
                {lockedMode ? 'Editar' : 'Bloquear'}
              </button>
              <button
                type="button"
                onClick={() => {
                  const auto = deriveLawName(lastMetaInfo, pdfFile)
                  if (auto) {
                    setLawName(auto)
                    setUserEditedLawName(false)
                  }
                }}
                className="text-xs text-slate-700"
              >
                ↺ Restablecer
              </button>
            </div>
            <div className="text-slate-600" aria-live="polite">
              Páginas: {pagesCount ?? '—'} · Bloques: {blocks.length} (blockSize {blockSize}, overlap {overlap})
            </div>
          </div>
          <div className="mt-2 overflow-x-auto">
            <div className="flex items-center gap-2 min-w-max">
              {blocks.map((b: any) => (
                <button
                  key={b.index}
                  title={`p.${b.startPage}–${b.endPage}`}
                  className="shrink-0 inline-flex items-center rounded-lg border border-slate-300 px-2 py-0.5 text-xs hover:bg-slate-50"
                >
                  [{b.index}] p.{b.startPage}–{b.endPage}
                </button>
              ))}
              <button onClick={() => setShowBlocksModal(true)} className="shrink-0 underline text-xs">
                Ver todos
              </button>
            </div>
          </div>
          {!!uploadError && <div className="mt-2 text-xs text-red-600">{uploadError}</div>}
        </div>
      </section>

      {/* Controles de resumen */}
      <section className="mx-auto max-w-5xl px-3 py-3">
        <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm">
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-xs">Tipo
              <select value={sumMode} onChange={(e) => setSumMode(e.target.value as any)} className="ml-2 rounded-lg border border-slate-300 p-1 text-sm">
                <option value="ejecutivo">Ejecutivo</option>
                <option value="estructurado">Estructurado</option>
              </select>
            </label>
            <label className="text-xs">Longitud
              <select value={sumLen} onChange={(e) => setSumLen(e.target.value as any)} className="ml-2 rounded-lg border border-slate-300 p-1 text-sm">
                <option value="corto">Corto</option>
                <option value="medio">Medio</option>
                <option value="largo">Largo</option>
              </select>
            </label>
            <label className="text-xs">Modo resumen
              <select value={summaryMode} onChange={(e) => setSummaryMode(e.target.value as any)} className="ml-2 rounded-lg border border-slate-300 p-1 text-sm">
                <option value="rapido">Rápido (menos detalle)</option>
                <option value="exhaustivo">Exhaustivo jurídico</option>
              </select>
            </label>
            <button onClick={onSummarize} disabled={!blocks.length || summLoading} className="ml-auto h-9 px-3 rounded-lg bg-indigo-600 text-white text-sm disabled:opacity-50">
              {summLoading ? 'Resumiendo…' : 'Generar resumen'}
            </button>
          </div>
          {summary && (
            <div className="mt-3 grid gap-2">
              <div className="font-medium">Resumen ({summary.tipo})</div>
              <pre className="text-xs whitespace-pre-wrap bg-slate-50 p-2 rounded-lg border border-slate-200">{JSON.stringify(summary, null, 2)}</pre>
            </div>
          )}
        </div>
      </section>

      <section ref={listRef} className="mx-auto max-w-5xl px-3 py-3">
        <div className="rounded-2xl border border-slate-200 p-3 bg-white">
          <div className="flex items-center justify-between">
            <div className="font-medium text-sm">Preguntas</div>
            <div className="text-sm text-slate-600">Sin responder (página): {unansweredVisible} / {pageItems.length}</div>
          </div>
          <div className="flex flex-wrap items-center gap-3 py-2">
            <button
              type="button"
              onClick={correctAll}
              disabled={items.length === 0}
              className="px-3 py-2 rounded-xl bg-indigo-600 text-white text-xs md:text-sm disabled:opacity-50"
            >
              Corregir todo
            </button>
            <label className="flex items-center gap-2 text-xs md:text-sm">
              <input type="checkbox" checked={includeCorrect} onChange={(e) => setIncludeCorrect(e.target.checked)} />
              Incluir columna “correcta” en la exportación
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => exportItems('json')}
                disabled={items.length === 0}
                className="px-3 py-2 rounded-xl bg-slate-800 text-white text-xs md:text-sm disabled:opacity-50"
              >
                Exportar JSON
              </button>
              <button
                type="button"
                onClick={() => exportItems('csv')}
                disabled={items.length === 0}
                className="px-3 py-2 rounded-xl bg-slate-700 text-white text-xs md:text-sm disabled:opacity-50"
              >
                Exportar CSV
              </button>
              <button
                type="button"
                onClick={() => exportItems('pdf')}
                disabled={items.length === 0}
                className="px-3 py-2 rounded-xl bg-slate-600 text-white text-xs md:text-sm disabled:opacity-50"
              >
                Exportar PDF
              </button>
            </div>
          </div>

          <Paginator />
          <div className="grid gap-3">
            {pageItems.map((it, i) => {
              const gi = pageStart + i
              return (
                <MCQCard
                  key={gi}
                  index={gi}
                  item={it}
                  userAnswer={answers[gi] ?? null}
                  onChange={(_, value) => setAnswers((prev) => ({ ...prev, [gi]: value }))}
                  onCorrectOne={(idx) => {
                    const a = answers[idx]
                    if (!items[idx]) return
                    const ok = a === items[idx].correcta
                    setCorrected((prev) => ({ ...prev, [idx]: true }))
                    setResults((prev) => ({ ...prev, [idx]: { isCorrect: !!ok } }))
                  }}
                  corrected={!!corrected[gi]}
                  result={results[gi]}
                />
              )
            })}
            {items.length === 0 && (
              <div className="text-slate-600 text-sm">Carga un PDF y genera preguntas para empezar.</div>
            )}
          </div>
          <Paginator />

          {score !== null && (
            <div className="mt-3 rounded-xl bg-slate-50 border border-slate-200 p-3 text-sm">
              <div className="font-semibold">Puntuación</div>
              Has acertado {score} de {items.length} preguntas.
            </div>
          )}
        </div>
      </section>

      <Modal open={showBlocksModal} onClose={() => setShowBlocksModal(false)} title="Bloques detectados">
        <div className="grid grid-cols-2 gap-2">
          {blocks.map((b: any) => (
            <div key={b.index} className="text-xs rounded-lg border border-slate-200 p-2">[{b.index}] p.{b.startPage}–{b.endPage}</div>
          ))}
        </div>
      </Modal>

      <section className="mx-auto max-w-5xl px-3 pb-6">
        <div className="rounded-xl border border-slate-200 p-3 text-sm space-y-3 bg-white text-slate-800">
          <div className="flex flex-wrap items-center gap-2">
            <div className="font-medium text-sm">Esquema estructurado (IA)</div>
            <div className="ml-auto flex flex-wrap gap-2">
              <button
                type="button"
                onClick={generateMentalOutlineSingle}
                disabled={mentalOutlineLoading || !pagesFull.length}
                className="h-9 px-3 rounded-lg bg-sky-600 text-white text-sm disabled:opacity-50"
              >
                {mentalOutlineLoading ? 'Generando…' : 'Una llamada'}
              </button>
              <button
                type="button"
                onClick={generateMentalOutlineChunks}
                disabled={mentalOutlineLoading || !pagesFull.length}
                className="h-9 px-3 rounded-lg bg-indigo-600 text-white text-sm disabled:opacity-50"
              >
                {mentalOutlineLoading ? 'Generando…' : `Por lotes (hasta ${MENTAL_OUTLINE_CHUNK_SIZES[0]} pág.)`}
              </button>
            </div>
          </div>
          {mentalOutlineProgress && (
            <div className="text-xs text-slate-600">
              Procesadas {mentalOutlineProgress.processed} / {mentalOutlineProgress.total} páginas
              {mentalOutlineProgress.lastChunk > 0 && ` · Último lote: ${mentalOutlineProgress.lastChunk} pág.`}
            </div>
          )}
          {mentalOutlineError && <div className="text-xs text-red-500">{mentalOutlineError}</div>}
          {mentalOutline && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <div className="flex rounded-lg border border-slate-300 bg-slate-100 p-1">
                  <button
                    type="button"
                    onClick={() => setOutlineViewMode('tree')}
                    className={`rounded-md px-2 py-1 ${outlineViewMode === 'tree' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                  >
                    Vista estructurada
                  </button>
                  <button
                    type="button"
                    onClick={() => setOutlineViewMode('json')}
                    className={`rounded-md px-2 py-1 ${outlineViewMode === 'json' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                  >
                    JSON
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(JSON.stringify(mentalOutline, null, 2))}
                  className="ml-auto px-2 py-1 rounded border border-slate-300 hover:bg-slate-100"
                >
                  Copiar JSON
                </button>
              </div>
              {outlineViewMode === 'json' ? (
                <pre className="max-h-[70vh] overflow-y-auto whitespace-pre-wrap rounded border border-slate-200 bg-slate-50 p-2 text-xs">
{JSON.stringify(mentalOutline, null, 2)}
                </pre>
              ) : (
                <div className="max-h-[70vh] overflow-y-auto pr-1">
                  <OutlineTree outline={mentalOutline} />
                </div>
              )}
            </div>
          )}
          {!mentalOutline && !mentalOutlineLoading && !mentalOutlineError && (
            <div className="text-xs text-slate-500">Sube un PDF y genera el esquema estructurado completo.</div>
          )}
        </div>
      </section>
    </div>
  )
}

