'use client'

import { useState } from 'react'

type GeneratedQuestion = {
  id: string
  blockIndex: number
  question: string
  choices: string[]
  answer: string
  explanation: string
}

export default function GeneratePage() {
  const [inputText, setInputText] = useState('')
  const [totalQuestions, setTotalQuestions] = useState(4)
  const [difficulty, setDifficulty] = useState<'simple' | 'mixed' | 'advanced'>('mixed')
  const [result, setResult] = useState<GeneratedQuestion[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleGenerate() {
    setLoading(true)
    setError(null)
    setResult([])
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blocks: [inputText], totalQuestions, difficulty }),
      })
      if (!res.ok) throw new Error('Falló la generación')
      const data = (await res.json()) as { questions: GeneratedQuestion[] }
      setResult(data.questions || [])
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
      <p className="mt-2 text-gray-600">Demo mock: pega texto y genera preguntas.</p>

      <div className="mt-6 space-y-4">
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
              max={100}
              value={totalQuestions}
              onChange={(e) => setTotalQuestions(parseInt(e.target.value || '0', 10))}
              className="w-20 rounded border p-1"
            />
          </label>

          <label className="flex items-center gap-2 text-sm">
            <span>Dificultad</span>
            <select
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value as any)}
              className="rounded border p-1"
            >
              <option value="simple">simple</option>
              <option value="mixed">mixed</option>
              <option value="advanced">advanced</option>
            </select>
          </label>

          <button
            onClick={handleGenerate}
            disabled={loading || !inputText.trim()}
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
            <div key={q.id} className="rounded border p-3">
              <div className="mb-1 text-xs text-gray-500">Q{i + 1} (bloque {q.blockIndex + 1})</div>
              <div className="font-medium">{q.question}</div>
              <ul className="mt-2 list-disc pl-6 text-sm">
                {q.choices.map((c, idx) => (
                  <li key={idx}>{c}</li>
                ))}
              </ul>
              <div className="mt-2 text-sm">
                <span className="font-medium">Respuesta:</span> {q.answer}
              </div>
              <div className="text-xs text-gray-600">{q.explanation}</div>
            </div>
          ))}
        </div>
      )}
    </main>
  )
}

