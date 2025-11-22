'use client'

import { useMemo } from 'react'
import type { MentalOutline } from '@/types/mentalOutline'

type Articulo = NonNullable<MentalOutline['titulos'][number]['articulos']>[number]
type Capitulo = MentalOutline['titulos'][number]['capitulos'][number]
type Seccion = Capitulo['secciones'][number]
type Titulo = MentalOutline['titulos'][number]

interface LegalOutlineTreeProps {
  outline: MentalOutline
  selectedArticleAnchor?: string | null
  onArticleSelect?: (art: Articulo, idx: number) => void
}

// Función auxiliar para formatear páginas
function formatPages(pages?: number[] | null) {
  if (!pages || pages.length === 0) return ''
  if (pages.length === 1) return `p. ${pages[0]}`
  return `p. ${pages[0]}–${pages[pages.length - 1]}`
}

// Función auxiliar para normalizar números de artículo
function normalizeArticleNumber(raw: string | undefined | null, text: string | undefined | null, index: number) {
  const cleaned = raw?.replace(/\?/g, '').trim()
  if (cleaned) {
    return cleaned.replace(/^Art[íi]culo\s+/i, '').trim()
  }
  if (text) {
    const match = text.match(/Artículo\s+([\wºª\.]+(?:\s+(?:bis|ter|quater|quinquies))?)/i)
    if (match) return match[1].replace(/\.$/, '').trim()
  }
  return String(index + 1)
}

// Función auxiliar para normalizar títulos de artículo
function normalizeArticleHeading(text: string | undefined | null, number: string) {
  const cleaned = text?.trim()
  if (cleaned && !cleaned.match(/^Artículo\s+\?$/i)) return cleaned
  return `Artículo ${number}`
}

// Función auxiliar para resolver ordinales
function resolveOrdinal(kind: 'titulo' | 'capitulo' | 'seccion', raw: string | undefined | null, text: string | undefined | null, index: number) {
  const cleaned = raw?.replace(/\?/g, '').trim()
  if (cleaned) return cleaned
  const fromText = extractOrdinalFromText(kind, text)
  if (fromText) return fromText
  if (kind === 'titulo' || kind === 'capitulo' || kind === 'seccion') {
    return toRoman(index + 1)
  }
  return String(index + 1)
}

function extractOrdinalFromText(kind: 'titulo' | 'capitulo' | 'seccion', text?: string | null) {
  if (!text) return ''
  const patterns = {
    titulo: /T[ÍI]TULO\s+(PRELIMINAR|[IVXLCDM]+|\d+)/i,
    capitulo: /CAP[ÍI]TULO\s+(PRELIMINAR|[IVXLCDM]+|\d+)/i,
    seccion: /SECCI[ÓO]N\s+([IVXLCDM]+|\d+)/i,
  }
  const match = text.match(patterns[kind])
  if (!match) return ''
  return (match[1] || '').toUpperCase()
}

function toRoman(value: number) {
  if (value <= 0) return String(value)
  const numerals: [number, string][] = [
    [1000, 'M'],
    [900, 'CM'],
    [500, 'D'],
    [400, 'CD'],
    [100, 'C'],
    [90, 'XC'],
    [50, 'L'],
    [40, 'XL'],
    [10, 'X'],
    [9, 'IX'],
    [5, 'V'],
    [4, 'IV'],
    [1, 'I'],
  ]
  let remaining = Math.floor(value)
  let result = ''
  for (const [num, roman] of numerals) {
    while (remaining >= num) {
      result += roman
      remaining -= num
    }
  }
  return result || String(value)
}

function resolveLabel(kind: 'titulo' | 'capitulo' | 'seccion', text: string | undefined | null, ordinal: string) {
  const cleanedText = text?.trim()
  if (cleanedText && !cleanedText.includes('?')) {
    // Extraer el título del texto, eliminando el ordinal
    const patterns = {
      titulo: /T[ÍI]TULO\s+(?:PRELIMINAR|[IVXLCDM]+|\d+)\s*[.:;—–\-]\s*(.+)/i,
      capitulo: /CAP[ÍI]TULO\s+(?:PRELIMINAR|[IVXLCDM]+|\d+)\s*[.:;—–\-]\s*(.+)/i,
      seccion: /SECCI[ÓO]N\s+[IVXLCDM\d]+\s*[.:;—–\-]\s*(.+)/i,
    }
    const match = cleanedText.match(patterns[kind])
    if (match && match[1]) {
      return match[1].trim()
    }
    // Si no hay patrón, intentar extraer después de cualquier separador
    const separators = /[.:;—–\-]\s*(.+)/i
    const sepMatch = cleanedText.match(separators)
    if (sepMatch && sepMatch[1]) {
      return sepMatch[1].trim()
    }
    // Si el texto no contiene el tipo, devolverlo tal cual
    if (!cleanedText.match(/^(T[ÍI]TULO|CAP[ÍI]TULO|SECCI[ÓO]N)\s+/i)) {
      return cleanedText
    }
  }
  return ''
}

// Componente para un artículo
function ArticleNode({ 
  art, 
  idx, 
  isSelected, 
  onSelect 
}: { 
  art: Articulo
  idx: number
  isSelected: boolean
  onSelect: (art: Articulo, idx: number) => void
}) {
  const number = normalizeArticleNumber(art.numero, art.articulo_texto, idx)
  const heading = normalizeArticleHeading(art.articulo_texto, number)
  const headingText = heading && heading !== `Artículo ${number}` ? heading.replace(/^Artículo\s+\d+\.?\s*/i, '') : null

  return (
    <div className="relative group/item">
      <button
        onClick={() => onSelect(art, idx)}
        type="button"
        aria-label={`Artículo ${number}${headingText ? `: ${headingText}` : ''}`}
        className={`w-full text-left px-3 py-2 text-sm rounded-md transition-all duration-200 flex items-center gap-2 group ${
          isSelected
            ? 'bg-indigo-100 text-indigo-900 font-medium shadow-sm border-l-4 border-indigo-500'
            : 'text-slate-700 hover:bg-slate-50 hover:border-l-4 hover:border-slate-300 border-l-4 border-transparent'
        }`}
      >
        <span className={`flex-shrink-0 text-xs ${isSelected ? 'text-indigo-600' : 'text-slate-400 group-hover:text-slate-600'}`}>
          {isSelected ? '●' : '○'}
        </span>
        <span className="font-semibold text-sm whitespace-nowrap min-w-[3.5rem]">Art. {number}</span>
        {headingText && (
          <span className="text-slate-600 text-sm flex-1 truncate">· {headingText}</span>
        )}
        {formatPages(art.pages) && (
          <span className={`text-xs px-1.5 py-0.5 rounded flex-shrink-0 ${isSelected ? 'bg-indigo-200 text-indigo-700' : 'bg-slate-100 text-slate-600'}`}>
            {formatPages(art.pages).replace(/^p\.\s*/, '')}
          </span>
        )}
      </button>
    </div>
  )
}

// Componente para una sección
function SectionNode({
  section,
  secIndex,
  selectedArticleAnchor,
  onArticleSelect,
}: {
  section: Seccion
  secIndex: number
  selectedArticleAnchor?: string | null
  onArticleSelect?: (art: Articulo, idx: number) => void
}) {
  const ordinal = resolveOrdinal('seccion', section.ordinal, section.seccion_texto, secIndex)
  const label = resolveLabel('seccion', section.seccion_texto, ordinal)

  return (
    <details className="group/details">
      <summary className="flex items-center gap-2 px-3 py-2 text-xs font-semibold uppercase text-slate-700 hover:text-slate-900 cursor-pointer list-none [&::-webkit-details-marker]:hidden border-l-2 border-slate-200 pl-5">
        <span className="text-slate-400 group-open/details:rotate-90 transition-transform duration-200 inline-block">▶</span>
        <span>SECCIÓN {ordinal}</span>
        {label && <span className="font-normal normal-case text-slate-600">{label}</span>}
        {formatPages(section.pages) && (
          <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
            {formatPages(section.pages)}
          </span>
        )}
      </summary>
      <div className="mt-1 space-y-0.5 pl-8 border-l-2 border-slate-200">
        {section.articulos?.map((art, idx) => (
          <ArticleNode
            key={art.anchor || `sec-${secIndex}-art-${idx}`}
            art={art}
            idx={idx}
            isSelected={art.anchor === selectedArticleAnchor}
            onSelect={(art, idx) => onArticleSelect?.(art, idx)}
          />
        ))}
      </div>
    </details>
  )
}

// Componente para un capítulo
function ChapterNode({
  chapter,
  capIndex,
  selectedArticleAnchor,
  onArticleSelect,
}: {
  chapter: Capitulo
  capIndex: number
  selectedArticleAnchor?: string | null
  onArticleSelect?: (art: Articulo, idx: number) => void
}) {
  const ordinal = resolveOrdinal('capitulo', chapter.ordinal, chapter.capitulo_texto, capIndex)
  const label = resolveLabel('capitulo', chapter.capitulo_texto, ordinal)

  return (
    <details className="group/details">
      <summary className="flex items-center gap-2 px-3 py-2 text-xs font-semibold uppercase text-slate-700 hover:text-slate-900 cursor-pointer list-none [&::-webkit-details-marker]:hidden border-l-2 border-indigo-200 pl-3">
        <span className="text-indigo-400 group-open/details:rotate-90 transition-transform duration-200 inline-block">▶</span>
        <span>CAPÍTULO {ordinal}</span>
        {label && <span className="font-normal normal-case text-slate-600">{label}</span>}
        {formatPages(chapter.pages) && (
          <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700">
            {formatPages(chapter.pages)}
          </span>
        )}
      </summary>
      <div className="mt-1 space-y-1 pl-6">
        {chapter.secciones?.map((sec, secIndex) => (
          <SectionNode
            key={sec.anchor || `cap-${capIndex}-sec-${secIndex}`}
            section={sec}
            secIndex={secIndex}
            selectedArticleAnchor={selectedArticleAnchor}
            onArticleSelect={onArticleSelect}
          />
        ))}
        {chapter.articulos?.map((art, idx) => (
          <ArticleNode
            key={art.anchor || `cap-${capIndex}-art-${idx}`}
            art={art}
            idx={idx}
            isSelected={art.anchor === selectedArticleAnchor}
            onSelect={(art, idx) => onArticleSelect?.(art, idx)}
          />
        ))}
      </div>
    </details>
  )
}

// Componente para un título
function TitleNode({
  titulo,
  index,
  selectedArticleAnchor,
  onArticleSelect,
}: {
  titulo: Titulo
  index: number
  selectedArticleAnchor?: string | null
  onArticleSelect?: (art: Articulo, idx: number) => void
}) {
  const ordinal = resolveOrdinal('titulo', titulo.ordinal, titulo.titulo_texto, index)
  const label = resolveLabel('titulo', titulo.titulo_texto, ordinal)
  const displayPages = Array.isArray(titulo.pages) && titulo.pages.length > 0 
    ? formatPages([titulo.pages[0]]) 
    : null

  return (
    <details className="group/details">
      <summary className="flex items-center gap-2 px-4 py-3 text-sm font-bold text-slate-800 hover:text-slate-900 cursor-pointer list-none [&::-webkit-details-marker]:hidden bg-gradient-to-r from-indigo-50 to-white rounded-lg border border-indigo-200 mb-2">
        <span className="text-indigo-500 group-open/details:rotate-90 transition-transform duration-200 inline-block text-lg">▶</span>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase tracking-wide text-indigo-600 font-bold">TÍTULO {ordinal}</span>
            {displayPages && (
              <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-100 text-indigo-700 font-medium">
                {displayPages}
              </span>
            )}
          </div>
          {label && (
            <div className="text-sm font-semibold text-slate-700 mt-0.5">{label}</div>
          )}
        </div>
      </summary>
      <div className="mt-2 space-y-2 pl-4 border-l-2 border-indigo-300">
        {titulo.capitulos?.map((cap, capIndex) => (
          <ChapterNode
            key={cap.anchor || `titulo-${index}-cap-${capIndex}`}
            chapter={cap}
            capIndex={capIndex}
            selectedArticleAnchor={selectedArticleAnchor}
            onArticleSelect={onArticleSelect}
          />
        ))}
        {titulo.articulos?.map((art, idx) => (
          <ArticleNode
            key={art.anchor || `titulo-${index}-art-${idx}`}
            art={art}
            idx={idx}
            isSelected={art.anchor === selectedArticleAnchor}
            onSelect={(art, idx) => onArticleSelect?.(art, idx)}
          />
        ))}
      </div>
    </details>
  )
}

// Componente principal
export default function LegalOutlineTree({
  outline,
  selectedArticleAnchor,
  onArticleSelect,
}: LegalOutlineTreeProps) {
  return (
    <div className="space-y-3">
      {outline.titulos.map((titulo, index) => (
        <TitleNode
          key={titulo.anchor || `titulo-${index}`}
          titulo={titulo}
          index={index}
          selectedArticleAnchor={selectedArticleAnchor}
          onArticleSelect={onArticleSelect}
        />
      ))}
    </div>
  )
}

