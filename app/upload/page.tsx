'use client'

import { useState } from 'react'

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null)
  const [blocks, setBlocks] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleUpload() {
    if (!file) return
    setLoading(true)
    setError(null)
    setBlocks([])
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/upload', { method: 'POST', body: form })
      if (!res.ok) throw new Error('Falló la subida/parsing del PDF')
      const data = (await res.json()) as { blocks: string[]; meta?: unknown }
      setBlocks(data.blocks || [])
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error desconocido'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="mx-auto max-w-4xl p-6">
      <h1 className="text-xl font-semibold">Subir PDF y ver bloques</h1>
      <p className="mt-2 text-gray-600">Selecciona un PDF para parsearlo y dividirlo.</p>

      <div className="mt-6 flex items-center gap-3">
        <input
          type="file"
          accept="application/pdf,.pdf"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="block"
        />
        <button
          onClick={handleUpload}
          disabled={!file || loading}
          className="rounded bg-black px-4 py-2 text-white disabled:opacity-50"
        >
          {loading ? 'Procesando…' : 'Subir y procesar'}
        </button>
      </div>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      <div className="mt-8">
        <h2 className="font-medium">Bloques ({blocks.length})</h2>
        <div className="mt-3 space-y-3">
          {blocks.map((b, i) => (
            <div key={i} className="rounded border p-3">
              <div className="mb-2 text-xs text-gray-500">Bloque #{i + 1}</div>
              <pre className="whitespace-pre-wrap text-sm leading-relaxed">{b}</pre>
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}

