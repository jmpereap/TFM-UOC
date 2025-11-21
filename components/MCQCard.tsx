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

  const difficultyColors = {
    basico: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    medio: 'bg-amber-100 text-amber-700 border-amber-200',
    avanzado: 'bg-red-100 text-red-700 border-red-200',
  }
  
  const difficultyLabels = {
    basico: 'Básico',
    medio: 'Medio',
    avanzado: 'Avanzado',
  }

  return (
    <div className={'rounded-2xl border ' + border + ' p-3 shadow-sm bg-white text-sm'}>
      <div className="mb-1.5 text-slate-800 font-medium flex items-start justify-between gap-2">
        <div className="flex-1">
          <span className="text-slate-500 mr-2">Q{index + 1}.</span>
          {item.pregunta}
        </div>
        <span className={`px-2 py-0.5 rounded text-xs font-semibold border shrink-0 ${difficultyColors[item.difficulty] || difficultyColors.medio}`}>
          {difficultyLabels[item.difficulty] || 'Medio'}
        </span>
      </div>

      <div className="space-y-1.5">
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
              className={'flex items-start gap-3 rounded-xl border ' + optionStyle + ' p-2.5 cursor-pointer'}
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
                <div className="text-slate-700">{item.opciones[k]}</div>
              </div>
            </label>
          )
        })}
      </div>

      <div className="mt-2.5 flex gap-2">
        <button
          type="button"
          onClick={() => onCorrectOne(index)}
          className="px-3 py-1.5 rounded-xl bg-slate-900 text-white text-xs md:text-sm"
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













