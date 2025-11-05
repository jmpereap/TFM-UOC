"use client";

import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'

type Props = { open: boolean; onClose: () => void; title?: string; children: ReactNode }

export default function Modal({ open, onClose, title, children }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div aria-modal className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        ref={ref}
        role="dialog"
        aria-label={title}
        className="relative z-10 max-h-[80vh] w-full max-w-2xl overflow-auto rounded-2xl bg-white p-4 shadow-xl"
      >
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
          <button onClick={onClose} className="px-2 py-1 text-sm rounded-lg bg-slate-200">Cerrar</button>
        </div>
        {children}
      </div>
    </div>
  )
}


