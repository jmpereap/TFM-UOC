"use client"

import { useId } from 'react'
import type { MCQItem, OptionKey } from '@/types/mcq'

type Props = {
  index: number
  item: MCQItem
  userAnswer?: OptionKey | null
  onChange: (index: number, value: OptionKey) => void
  onCorrectOne: (index: number) => void
  corrected?: boolean
  result?: { isCorrect: boolean } | null
}

export default function MCQCard({
  index,
  item,
  userAnswer,
  onChange,
  onCorrectOne,
  corrected,
  result,
}: Props) {
  const baseId = useId()
  const letterKeys: OptionKey[] = ['A', 'B', 'C', 'D']
  const border = corrected ? (result?.isCorrect ? 'border-green-500' : 'border-red-500') : 'border-slate-200'

  return (
    <div className={'rounded-2xl border ' + border + ' p-4 shadow-sm bg-white'}>
      <div className="mb-2 text-slate-800 font-medium">
        <span className="text-slate-500 mr-2">Q{index + 1}.</span>
        {item.pregunta}
      </div>

      <div className="space-y-2">
        {letterKeys.map((k) => {
          const id = baseId + '-' + index + '-' + k
          const selected = userAnswer === k
          const optionStyle = corrected
            ? k === item.correcta
              ? 'border-green-400 bg-green-50'
              : selected
                ? 'border-red-400 bg-red-50'
                : 'border-slate-200'
            : 'border-slate-200'

          return (
            <label
              key={k}
              htmlFor={id}
              className={'flex items-start gap-3 rounded-xl border ' + optionStyle + ' p-3 cursor-pointer'}
            >
              <input
                id={id}
                type="radio"
                name={'q-' + index}
                className="mt-1"
                checked={selected || false}
                onChange={() => onChange(index, k)}
              />
              <div>
                <div className="font-semibold">{k}</div>
                <div className="text-sm text-slate-700">{item.opciones[k]}</div>
              </div>
            </label>
          )
        })}
      </div>

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => onCorrectOne(index)}
          className="px-3 py-2 rounded-xl bg-slate-900 text-white text-sm"
        >
          Corregir esta
        </button>
      </div>

      {corrected && (
        <div className="mt-3 text-sm">
          <div className="font-semibold">{result?.isCorrect ? '✅ ¡Correcta!' : '❌ Incorrecta'}</div>
          <div className="mt-1 text-slate-700">
            <span className="font-medium">Justificación:</span> {item.justificacion}
          </div>
          <div className="text-slate-600">
            <span className="font-medium">Referencia:</span> {item.referencia.ley}, {item.referencia.paginas}
            {item.referencia.articulo ? ', art. ' + item.referencia.articulo : ''}
            {item.referencia.parrafo ? ', párr. ' + item.referencia.parrafo : ''}
          </div>
        </div>
      )}
    </div>
  )
}


