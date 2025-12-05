'use client'

import { useCallback, useMemo, useRef, useState } from 'react'

type DragDropUploadProps = {
  current: File | null
  onSelect: (file: File | null) => void
}

const ACCEPTED_TYPES = ['application/pdf']

function formatBytes(bytes?: number | null) {
  if (!bytes || bytes <= 0) return ''
  const units = ['B', 'KB', 'MB', 'GB']
  const exponent = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  const value = bytes / 1024 ** exponent
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[exponent]}`
}

export default function DragDropUpload({ current, onSelect }: DragDropUploadProps) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleFiles = useCallback(
    (list: FileList | null) => {
      if (!list?.length) return
      const file = list[0]
      const isPdf = ACCEPTED_TYPES.includes(file.type) || file.name.toLowerCase().endsWith('.pdf')
      if (!isPdf) {
        setError('Solo se aceptan archivos PDF.')
        return
      }
      setError(null)
      onSelect(file)
    },
    [onSelect]
  )

  const onInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      handleFiles(event.target.files)
    },
    [handleFiles]
  )

  const dragProps = useMemo(
    () => ({
      onDragOver: (event: React.DragEvent<HTMLDivElement>) => {
        event.preventDefault()
        event.stopPropagation()
        setIsDragging(true)
      },
      onDragLeave: (event: React.DragEvent<HTMLDivElement>) => {
        event.preventDefault()
        event.stopPropagation()
        setIsDragging(false)
      },
      onDrop: (event: React.DragEvent<HTMLDivElement>) => {
        event.preventDefault()
        event.stopPropagation()
        setIsDragging(false)
        handleFiles(event.dataTransfer?.files ?? null)
      },
    }),
    [handleFiles]
  )

  return (
    <div>
      <div
        {...dragProps}
        className={`rounded-2xl border-2 border-dashed p-4 text-sm transition-colors ${
          isDragging
            ? 'border-emerald-500 bg-emerald-50/60'
            : 'border-slate-300 bg-white hover:border-slate-400'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_TYPES.concat('.pdf').join(',')}
          className="sr-only"
          onChange={onInputChange}
        />
        <div className="flex flex-col gap-2">
          <p className="text-slate-700 font-medium">Arrastra un PDF o selecciónalo manualmente</p>
          <p className="text-xs text-slate-500">
            El archivo se procesa localmente y solo se envía el texto necesario para generar preguntas.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="inline-flex h-9 items-center rounded-lg border border-slate-300 px-3 text-sm font-medium text-slate-800 hover:bg-slate-50"
            >
              Seleccionar PDF
            </button>
            {current && (
              <>
                <span className="text-xs text-slate-600">
                  {current.name} {formatBytes(current.size)}
                </span>
                <button
                  type="button"
                  onClick={() => onSelect(null)}
                  className="text-xs text-slate-500 underline"
                >
                  Limpiar selección
                </button>
              </>
            )}
          </div>
        </div>
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  )
}


