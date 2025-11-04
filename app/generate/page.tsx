'use client';

import { useEffect, useMemo, useRef, useState } from 'react'
import type { MCQItem, OptionKey } from '@/types/mcq'
import MCQCard from '@/components/MCQCard'
import DragDropUpload from '@/components/DragDropUpload'
import BlocksChips from '@/components/BlocksChips'
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

export default function GeneratePage() {
  // PDF/bloques
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [blocks, setBlocks] = useState<any[]>([])
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

  // Paginación
  const PAGE_SIZE = 5
  const [page, setPage] = useState(1)
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE))
  const pageStart = (page - 1) * PAGE_SIZE
  const pageEnd = Math.min(items.length, page * PAGE_SIZE)
  const pageItems = useMemo(() => items.slice(pageStart, pageEnd), [items, page, pageStart, pageEnd])
  useEffect(() => { setPage(1) }, [items])
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
      setLastMetaInfo(data?.meta?.info || null)
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

  return (
    <div className="mx-auto max-w-4xl p-4 space-y-6">
      <h1 className="text-xl font-semibold">Generar preguntas desde PDF</h1>

      {/* Subida de PDF con drag&drop y opciones avanzadas */}
      <div className="rounded-2xl border border-slate-200 p-4 bg-white space-y-3">
        <div className="font-medium">1) Carga el PDF de la ley/norma</div>
        <DragDropUpload
          current={pdfFile}
          onSelect={(f) => {
            setPdfFile(f)
            if (f && !userEditedLawName && !lawName.trim()) {
              setLawName(baseNameFromFile(f))
            }
          }}
        />
        <button
          type="button"
          onClick={onUpload}
          disabled={uploading || !pdfFile || overlapInvalid}
          className="px-3 py-2 rounded-xl bg-slate-900 text-white text-sm disabled:opacity-50"
        >
          {uploading ? 'Subiendo…' : 'Subir y detectar bloques'}
        </button>
        <div className="text-sm text-slate-700" aria-live="polite">
          {pagesCount !== null ? (
            <>Páginas: {pagesCount} · Bloques: {blocks.length} (blockSize {blockSize}, overlap {overlap})</>
          ) : (
            'Sin datos aún.'
          )}
        </div>
        {!!uploadError && <div className="text-sm text-red-600">{uploadError}</div>}

        {/* Opciones avanzadas */}
        <button type="button" onClick={() => setShowAdvanced((v) => !v)} className="text-sm underline">
          {showAdvanced ? 'Ocultar' : 'Mostrar'} opciones avanzadas
        </button>
        {showAdvanced && (
          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-sm">
              <div className="mb-1 text-slate-600">blockSize (páginas por bloque)</div>
              <input
                type="number"
                min={1}
                value={blockSize}
                onChange={(e) => setBlockSize(Math.max(1, Number(e.target.value) || 1))}
                className="w-full rounded-lg border border-slate-300 p-2"
              />
              <div className="text-xs text-slate-500">Recomendado 4–6</div>
            </label>
            <label className="text-sm">
              <div className="mb-1 text-slate-600">overlap (0..blockSize-1)</div>
              <input
                type="number"
                min={0}
                max={blockSize - 1}
                value={overlap}
                onChange={(e) => setOverlap(Number(e.target.value) || 0)}
                className={`w-full rounded-lg border p-2 ${overlapInvalid ? 'border-red-500' : 'border-slate-300'}`}
              />
              <div className={`text-xs ${overlapInvalid ? 'text-red-600' : 'text-slate-500'}`}>
                {overlapInvalid ? `Valor inválido. Máx: ${overlapMax}` : 'Solape recomendado: 1'}
              </div>
            </label>
          </div>
        )}

        {/* Chips y modal */}
        <BlocksChips blocks={blocks as any} onViewAll={() => setShowBlocksModal(true)} viewAllRef={viewAllBtnRef} />
      </div>

      {/* Identificación del cuestionario */}
      <div className="rounded-2xl border border-slate-200 p-4 bg-white space-y-3">
        <div className="font-medium">2) Identificación del cuestionario</div>
        <div className="flex items-center justify-between gap-3">
          <div className="flex-1">
            {!lockedMode ? (
              <label className="text-sm block">
                <div className="mb-1 text-slate-600">Nombre de la ley/norma</div>
                <input
                  type="text"
                  value={lawName}
                  onChange={(e) => {
                    setLawName(e.target.value)
                    setUserEditedLawName(true)
                  }}
                  className="w-full rounded-lg border border-slate-300 p-2"
                  placeholder="p. ej., Constitución Española (consolidado)"
                />
                <div className="text-xs text-slate-500">Origen: meta Title del PDF o nombre de archivo</div>
              </label>
            ) : (
              <div className="text-sm">
                <div className="text-slate-600 mb-1">Nombre de la ley/norma</div>
                <div className="flex items-center gap-2">
                  <div className="px-2 py-1 rounded-lg border border-slate-200 bg-slate-50 text-slate-800">{lawName || '—'}</div>
                  <button type="button" onClick={() => setLockedMode(false)} className="px-2 py-1 rounded-lg bg-slate-200 text-slate-800 text-sm">✎ Editar</button>
                </div>
                <div className="text-xs text-slate-500">Modo bloqueado (vista limpia)</div>
              </div>
            )}
          </div>
          <div className="shrink-0 flex flex-col items-end gap-2">
            <button
              type="button"
              onClick={() => {
                const auto = deriveLawName(lastMetaInfo, pdfFile)
                if (auto) {
                  setLawName(auto)
                  setUserEditedLawName(false)
                }
              }}
              className="px-2 py-1 rounded-lg bg-slate-100 text-slate-700 text-xs"
            >
              ↺ Restablecer
            </button>
            <label className="text-xs flex items-center gap-2">
              <input type="checkbox" checked={lockedMode} onChange={(e) => setLockedMode(e.target.checked)} />
              Bloquear nombre (vista limpia)
            </label>
          </div>
        </div>
      </div>

      {/* Parámetros de generación */}
      <div className="rounded-2xl border border-slate-200 p-4 bg-white space-y-3">
        <div className="font-medium">3) Parámetros</div>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-sm">
            <div className="mb-1 text-slate-600">Número de preguntas (1–20)</div>
            <input
              type="number"
              min={1}
              max={20}
              value={n}
              onChange={(e) => setN(Number(e.target.value))}
              className="w-full rounded-lg border border-slate-300 p-2"
            />
          </label>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onGenerate}
            disabled={generating || blocks.length === 0 || !lawName.trim()}
            className="px-3 py-2 rounded-xl bg-emerald-600 text-white text-sm disabled:opacity-50"
          >
            {generating ? 'Generando…' : 'Generar preguntas'}
          </button>
        </div>
        {!!genError && <div className="text-sm text-red-600">{genError}</div>}
      </div>

      {/* Preguntas + corrección */}
      <div className="rounded-2xl border border-slate-200 p-4 bg-white space-y-4">
        <div className="flex items-center justify-between">
          <div className="font-medium">4) Preguntas</div>
          <div className="text-sm text-slate-600">Sin responder (página): {unansweredVisible} / {pageItems.length}</div>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <button
            type="button"
            onClick={correctAll}
            disabled={items.length === 0}
            className="px-3 py-2 rounded-xl bg-indigo-600 text-white text-sm disabled:opacity-50"
          >
            Corregir todo
          </button>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={includeCorrect} onChange={(e) => setIncludeCorrect(e.target.checked)} />
            Incluir columna “correcta” en la exportación
          </label>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => exportItems('json')}
              disabled={items.length === 0}
              className="px-3 py-2 rounded-xl bg-slate-800 text-white text-sm disabled:opacity-50"
            >
              Exportar JSON
            </button>
            <button
              type="button"
              onClick={() => exportItems('csv')}
              disabled={items.length === 0}
              className="px-3 py-2 rounded-xl bg-slate-700 text-white text-sm disabled:opacity-50"
            >
              Exportar CSV
            </button>
            <button
              type="button"
              onClick={() => exportItems('pdf')}
              disabled={items.length === 0}
              className="px-3 py-2 rounded-xl bg-slate-600 text-white text-sm disabled:opacity-50"
            >
              Exportar PDF
            </button>
          </div>
        </div>
        <div className="grid gap-4">
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
        <div className="flex items-center justify-between pt-2">
          <div className="text-sm text-slate-600">
            Mostrando {pageStart + 1}–{pageEnd} de {items.length} · Página {page} / {totalPages}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="px-3 py-2 rounded-xl bg-slate-200 text-slate-800 text-sm disabled:opacity-50">Anterior</button>
            <button type="button" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="px-3 py-2 rounded-xl bg-slate-900 text-white text-sm disabled:opacity-50">Siguiente</button>
          </div>
        </div>
        {score !== null && (
          <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 text-sm">
            <div className="font-semibold">Puntuación</div>
            Has acertado {score} de {items.length} preguntas.
          </div>
        )}
      </div>
      <Modal open={showBlocksModal} onClose={() => setShowBlocksModal(false)} title="Bloques detectados">
        <div className="grid grid-cols-2 gap-2">
          {blocks.map((b: any) => (
            <div key={b.index} className="text-xs rounded-lg border border-slate-200 p-2">[{b.index}] p.{b.startPage}–{b.endPage}</div>
          ))}
        </div>
      </Modal>
    </div>
  )
}

