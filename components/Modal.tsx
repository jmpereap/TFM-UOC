'use client'

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'

type ModalProps = {
  open: boolean
  title?: string
  onClose?: () => void
  children: React.ReactNode
}

export default function Modal({ open, title, onClose, children }: ModalProps) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    return () => setMounted(false)
  }, [])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose?.()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  useEffect(() => {
    if (!open) return
    const { body } = document
    const prevOverflow = body.style.overflow
    body.style.overflow = 'hidden'
    return () => {
      body.style.overflow = prevOverflow
    }
  }, [open])

  const content = useMemo(() => {
    if (!open) return null
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="absolute inset-0 bg-slate-900/50" onClick={onClose} />
        <div className="relative z-10 w-full max-w-lg rounded-2xl bg-white p-4 shadow-xl">
          <div className="flex items-start justify-between gap-4">
            {title && <h2 className="text-lg font-semibold text-slate-900">{title}</h2>}
            <button
              type="button"
              aria-label="Cerrar modal"
              onClick={onClose}
              className="text-slate-500 hover:text-slate-700"
            >
              ✕
            </button>
          </div>
          <div className="mt-3 max-h-[70vh] overflow-auto text-sm text-slate-700">{children}</div>
        </div>
      </div>
    )
  }, [children, onClose, open, title])

  if (!mounted) return null
  return createPortal(content, document.body)
}


<<<<<<< HEAD
=======














>>>>>>> feature/nonlegal-outline
