'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'


export default function UploadPage() {
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null)
  const [blocks, setBlocks] = useState<{ index: number; startPage: number; endPage: number; text: string }[]>([])
  const [blockSize, setBlockSize] = useState(5)
  const [overlap, setOverlap] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [meta, setMeta] = useState<any>(null)

  async function handleUpload() {
    if (!file) return
    setLoading(true)
    setError(null)
    setBlocks([])
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('blockSize', String(blockSize))
      form.append('overlap', String(overlap))
      const res = await fetch('/api/upload', { method: 'POST', body: form })
      if (!res.ok) throw new Error('Falló la subida/parsing del PDF')
      const data = (await res.json()) as { blocks: { index: number; startPage: number; endPage: number; text: string }[]; meta?: any }
      const b = Array.isArray(data.blocks) ? data.blocks : []
      setBlocks(b)
      setMeta(data.meta || null)
      // Persistimos en localStorage para que /generate lo cargue
      try {
        localStorage.setItem(
          'tfm_pdf',
          JSON.stringify({ fileName: file.name, blocks: b, meta: data.meta ?? {} }),
        )
      } catch {}
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

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <input
          type="file"
          accept="application/pdf,.pdf"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="block"
        />
        <label className="flex items-center gap-2 text-sm">
          <span>blockSize</span>
          <input
            type="number"
            min={1}
            max={50}
            value={blockSize}
            onChange={(e) => setBlockSize(parseInt(e.target.value || '1', 10))}
            className="w-20 rounded border p-1"
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <span>overlap</span>
          <input
            type="number"
            min={0}
            max={blockSize - 1}
            value={overlap}
            onChange={(e) => setOverlap(parseInt(e.target.value || '0', 10))}
            className="w-20 rounded border p-1"
          />
        </label>
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
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Bloques ({blocks.length})</h2>
          {blocks.length > 0 && (
            <button
              onClick={() => router.push('/generate')}
              className="rounded bg-blue-600 px-3 py-1.5 text-white"
            >
              Usar en Generar →
            </button>
          )}
        </div>
        {meta?.numPages ? (
          <div className="mt-1 text-xs text-gray-500">Páginas detectadas: {meta.numPages}</div>
        ) : null}
        <div className="mt-3 space-y-3">
          {blocks.map((b) => (
            <div key={b.index} className="rounded border p-3">
              <div className="mb-2 text-xs text-gray-500">Bloque #{b.index + 1} · Páginas {b.startPage}–{b.endPage}</div>
              <pre className="whitespace-pre-wrap text-sm leading-relaxed">{b.text}</pre>
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}

