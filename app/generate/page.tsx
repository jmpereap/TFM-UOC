'use client'

import { useEffect, useState } from 'react'
import type { Block } from 'lib/pdf/splitIntoBlocks'

type MCQItem = {
  pregunta: string
  opciones: { A: string; B: string; C: string; D: string }
  correcta: 'A' | 'B' | 'C' | 'D'
  justificacion: string
  referencia: { ley: string; paginas: string; articulo?: string; parrafo?: string }
}

export default function GeneratePage() {
  const [lawName, setLawName] = useState('Ley de ejemplo')
  const [inputText, setInputText] = useState('')
  const [totalQuestions, setTotalQuestions] = useState(4)
  const [result, setResult] = useState<MCQItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loadedPdf, setLoadedPdf] = useState<{ fileName: string; blocks: Block[] } | null>(null)

  useEffect(() => {
    try {
      const raw = localStorage.getItem('tfm_pdf')
      if (raw) {
        const data = JSON.parse(raw)
        if (Array.isArray(data?.blocks) && data.blocks.length > 0) {
          setLoadedPdf({ fileName: String(data.fileName || 'PDF'), blocks: data.blocks as Block[] })
        }
      }
    } catch {
      // ignore
    }
  }, [])

  async function handleGenerate() {
    setLoading(true)
    setError(null)
    setResult([])
    try {
      const useBlocks = !!(loadedPdf && loadedPdf.blocks && loadedPdf.blocks.length > 0)
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          useBlocks
            ? { lawName, n: totalQuestions, blocks: loadedPdf!.blocks }
            : {
                lawName,
                n: totalQuestions,
                blocks: [{ index: 0, startPage: 1, endPage: 1, text: inputText }],
              },
        ),
      })
      if (!res.ok) throw new Error('Falló la generación')
      const data = (await res.json()) as { ok: boolean; items?: MCQItem[]; error?: any }
      if (!data.ok) {
        const msg = typeof data.error === 'string' ? data.error : 'Respuesta no OK'
        throw new Error(msg)
      }
      setResult(data.items || [])
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error desconocido'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="mx-auto max-w-4xl p-6">
      <h1 className="text-xl font-semibold">Generar preguntas</h1>
      <p className="mt-2 text-gray-600">Genera JSON de preguntas desde el PDF cargado o desde el bloque manual.</p>

      <div className="mt-6 space-y-4">
        <label className="flex items-center gap-2 text-sm">
          <span>Norma/Ley</span>
          <input
            value={lawName}
            onChange={(e) => setLawName(e.target.value)}
            className="w-80 rounded border p-2"
          />
        </label>
        {loadedPdf ? (
          <div className="rounded border p-3 text-sm">
            <div className="mb-1 font-medium">Desde PDF: {loadedPdf.fileName}</div>
            <div className="text-gray-600">Bloques disponibles: {loadedPdf.blocks.length}</div>
          </div>
        ) : null}
        <textarea
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Pega aquí el texto…"
          rows={8}
          className="w-full rounded border p-3"
        />

        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm">
            <span>Preguntas totales</span>
            <input
              type="number"
              min={1}
              max={20}
              value={totalQuestions}
              onChange={(e) => setTotalQuestions(parseInt(e.target.value || '0', 10))}
              className="w-20 rounded border p-1"
            />
          </label>

          <button
            onClick={handleGenerate}
            disabled={loading || (!loadedPdf && !inputText.trim())}
            className="rounded bg-black px-4 py-2 text-white disabled:opacity-50"
          >
            {loading ? 'Generando…' : 'Generar'}
          </button>
        </div>
      </div>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      {!!result.length && (
        <div className="mt-8 space-y-4">
          <h2 className="font-medium">Resultado ({result.length})</h2>
          {result.map((q, i) => (
            <div key={i} className="rounded border p-3">
              <div className="mb-1 text-xs text-gray-500">Q{i + 1} · {q.referencia.ley} · {q.referencia.paginas}</div>
              <div className="font-medium">{q.pregunta}</div>
              <ul className="mt-2 list-disc pl-6 text-sm">
                <li>A) {q.opciones.A}</li>
                <li>B) {q.opciones.B}</li>
                <li>C) {q.opciones.C}</li>
                <li>D) {q.opciones.D}</li>
              </ul>
              <div className="mt-2 text-sm">
                <span className="font-medium">Correcta:</span> {q.correcta}
              </div>
              <div className="text-xs text-gray-600">{q.justificacion}</div>
            </div>
          ))}
        </div>
      )}
    </main>
  )
}

