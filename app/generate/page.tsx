'use client';

import { useMemo, useState } from 'react'
import type { MCQItem, OptionKey } from '@/types/mcq'
import MCQCard from '@/components/MCQCard'

type Result = { isCorrect: boolean }

export default function GeneratePage() {
  // PDF/bloques
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [blocks, setBlocks] = useState<any[]>([])
  const [pagesCount, setPagesCount] = useState<number | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [blockSize, setBlockSize] = useState<number>(5)
  const [overlap, setOverlap] = useState<number>(1)

  // Parámetros de generación
  const [lawName, setLawName] = useState<string>('')
  const [n, setN] = useState<number>(10)

  // Items y corrección
  const [items, setItems] = useState<MCQItem[]>([])
  const [answers, setAnswers] = useState<Record<number, OptionKey | null>>({})
  const [corrected, setCorrected] = useState<Record<number, boolean>>({})
  const [results, setResults] = useState<Record<number, Result>>({})
  const [score, setScore] = useState<number | null>(null)
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState<string | null>(null)
  const [includeCorrect, setIncludeCorrect] = useState<boolean>(true)

  const unanswered = useMemo(
    () => items.reduce((acc, _, i) => acc + (answers[i] ? 0 : 1), 0),
    [items, answers],
  )

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
      // Autocompletar el nombre de la ley con el nombre del fichero si está vacío
      if (!lawName.trim() && pdfFile?.name) {
        const base = pdfFile.name.replace(/\.[^.]+$/, '')
        setLawName(base)
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
    const nextCorrected: Record<number, boolean> = {}
    const nextResults: Record<number, Result> = {}
    items.forEach((it, i) => {
      const a = answers[i]
      const ok = a === it.correcta
      nextCorrected[i] = true
      nextResults[i] = { isCorrect: !!ok }
      if (ok) total += 1
    })
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

      {/* Subida de PDF en la misma página */}
      <div className="rounded-2xl border border-slate-200 p-4 bg-white space-y-3">
        <div className="font-medium">1) Carga el PDF de la ley/norma</div>
        <input
          type="file"
          accept="application/pdf"
          onChange={(e) => {
            const f = e.target.files?.[0] || null
            setPdfFile(f)
            if (f && !lawName.trim()) {
              const base = f.name.replace(/\.[^.]+$/, '')
              setLawName(base)
            }
          }}
        />
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-2">
            <span>blockSize</span>
            <input
              type="number"
              min={1}
              max={50}
              value={blockSize}
              onChange={(e) => setBlockSize(Number(e.target.value) || 1)}
              className="w-24 rounded border border-slate-300 p-1"
            />
          </label>
          <label className="flex items-center gap-2">
            <span>overlap</span>
            <input
              type="number"
              min={0}
              max={Math.max(0, blockSize - 1)}
              value={overlap}
              onChange={(e) => setOverlap(Number(e.target.value) || 0)}
              className="w-24 rounded border border-slate-300 p-1"
            />
          </label>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onUpload}
            disabled={uploading || !pdfFile}
            className="px-3 py-2 rounded-xl bg-slate-900 text-white text-sm disabled:opacity-50"
          >
            {uploading ? 'Subiendo…' : 'Subir y detectar bloques'}
          </button>
        </div>
        {!!uploadError && <div className="text-sm text-red-600">{uploadError}</div>}
        <div className="text-sm text-slate-700">
          {pagesCount !== null ? (
            <>
              Páginas: {pagesCount} · Bloques: {blocks.length}
            </>
          ) : (
            'Sin datos aún.'
          )}
        </div>
        {blocks.length > 0 && (
          <div className="text-xs text-slate-600">
            {blocks.slice(0, 8).map((b: any) => (
              <span key={b.index} className="mr-2">
                [{b.index}] p.{b.startPage}–{b.endPage}
              </span>
            ))}
            {blocks.length > 8 && <span>… (+{blocks.length - 8} más)</span>}
          </div>
        )}
      </div>

      {/* Parámetros de generación */}
      <div className="rounded-2xl border border-slate-200 p-4 bg-white space-y-3">
        <div className="font-medium">2) Parámetros</div>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-sm">
            <div className="mb-1 text-slate-600">Nombre de la ley/norma</div>
            <input
              type="text"
              placeholder="Constitución Española (texto consolidado)"
              value={lawName}
              onChange={(e) => setLawName(e.target.value)}
              className="w-full rounded-lg border border-slate-300 p-2"
            />
          </label>
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
          <div className="font-medium">3) Preguntas</div>
          <div className="text-sm text-slate-600">
            Sin responder: {unanswered} / {items.length}
          </div>
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
          {items.map((it, i) => (
            <MCQCard
              key={i}
              index={i}
              item={it}
              userAnswer={answers[i] ?? null}
              onChange={onChangeAnswer}
              onCorrectOne={correctOne}
              corrected={!!corrected[i]}
              result={results[i]}
            />
          ))}
          {items.length === 0 && (
            <div className="text-slate-600 text-sm">Carga un PDF y genera preguntas para empezar.</div>
          )}
        </div>
        {score !== null && (
          <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 text-sm">
            <div className="font-semibold">Puntuación</div>
            Has acertado {score} de {items.length} preguntas.
          </div>
        )}
      </div>
    </div>
  )
}

