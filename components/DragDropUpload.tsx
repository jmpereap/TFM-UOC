"use client";

import { useCallback, useRef, useState } from 'react'

type Props = { onSelect: (file: File | null) => void; current?: File | null }

export default function DragDropUpload({ onSelect, current }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState(false)

  const onFiles = useCallback(
    (files: FileList | undefined | null) => {
      const f = files && files[0] ? files[0] : null
      if (f && f.type !== 'application/pdf') return
      onSelect(f || null)
    },
    [onSelect],
  )

  return (
    <div
      ref={ref}
      onDragOver={(e) => {
        e.preventDefault()
        setHover(true)
      }}
      onDragLeave={() => setHover(false)}
      onDrop={(e) => {
        e.preventDefault()
        setHover(false)
        onFiles(e.dataTransfer?.files)
      }}
      className={`rounded-2xl border p-4 min-h-28 ${hover ? 'border-slate-900 bg-slate-50' : 'border-slate-300 bg-white'}`}
      title={current?.name || ''}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm text-slate-700">
          <div className="font-medium">Arrastra aquí el PDF o pulsa “Seleccionar archivo”</div>
          {current ? (
            <div className="truncate max-w-[420px]" title={current.name}>
              {current.name}
            </div>
          ) : (
            <div className="text-slate-500">PDF (máx. 50 MB)</div>
          )}
        </div>
        <label className="px-3 py-2 rounded-xl bg-slate-900 text-white text-sm cursor-pointer">
          Seleccionar archivo
          <input type="file" className="hidden" accept="application/pdf" onChange={(e) => onFiles(e.target.files)} />
        </label>
      </div>
      {current && (
        <div className="mt-2">
          <button type="button" onClick={() => onSelect(null)} className="text-xs underline text-slate-700">
            Cambiar
          </button>
        </div>
      )}
    </div>
  )
}





