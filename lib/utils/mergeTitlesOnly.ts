import type { TitlesOnlyOutline, TituloRange } from '@/types/titlesOnly'

const safeString = (value?: string | null) => (typeof value === 'string' ? value.trim() : '')

const normalizeKey = (value?: string | null) => safeString(value).toLowerCase()

const cloneTitulo = (t: TituloRange): TituloRange => ({
  ordinal: safeString(t.ordinal),
  titulo_texto: safeString(t.titulo_texto),
  definicion: safeString(t.definicion),
  anchor: safeString(t.anchor),
  page_start: Number.isFinite(t.page_start) ? Math.max(1, Math.trunc(t.page_start)) : 0,
  page_end: typeof t.page_end === 'number' && Number.isFinite(t.page_end) ? Math.max(1, Math.trunc(t.page_end)) : null,
})

const tituloKey = (t: TituloRange) => {
  const anchor = normalizeKey(t.anchor)
  if (anchor) return `anchor:${anchor}`
  const ord = normalizeKey(t.ordinal)
  if (ord) return `ordinal:${ord}`
  const text = normalizeKey(t.titulo_texto)
  if (text) return `texto:${text}`
  const def = normalizeKey(t.definicion)
  if (def) return `def:${def}`
  return `start:${t.page_start}`
}

const preferText = (a?: string | null, b?: string | null) => {
  const A = safeString(a)
  const B = safeString(b)
  if (A && !B) return A
  if (B && !A) return B
  if (!A && !B) return ''
  return B.length >= A.length ? B : A
}

const mergeTitulos = (base: TituloRange[] = [], incoming: TituloRange[] = []): TituloRange[] => {
  const result = base.map(cloneTitulo)
  const index = new Map<string, number>()
  result.forEach((t, i) => index.set(tituloKey(t), i))

  incoming.forEach((t) => {
    const key = tituloKey(t)
    const idx = index.get(key)
    if (idx !== undefined) {
      const cur = result[idx]
      result[idx] = {
        ordinal: preferText(cur.ordinal, t.ordinal),
        titulo_texto: preferText(cur.titulo_texto, t.titulo_texto),
        definicion: preferText(cur.definicion, t.definicion),
        anchor: preferText(cur.anchor, t.anchor),
        page_start: Math.min(cur.page_start || t.page_start || 1, t.page_start || cur.page_start || 1),
        // page_end se recalcula por orden; usa el más definido provisionalmente
        page_end: t.page_end ?? cur.page_end ?? null,
      }
    } else {
      index.set(key, result.length)
      result.push(cloneTitulo(t))
    }
  })

  // Orden por page_start y ajustamos page_end = siguiente.page_start
  result.sort((a, b) => a.page_start - b.page_start)
  for (let i = 0; i < result.length - 1; i += 1) {
    const nextStart = result[i + 1].page_start
    result[i].page_end = nextStart
  }
  // Último: mantenemos page_end si se conocía, si no, null
  const last = result[result.length - 1]
  if (last && (typeof last.page_end !== 'number' || last.page_end < last.page_start)) {
    last.page_end = last.page_end ?? null
  }

  return result
}

export function mergeTitlesOnly(
  base: TitlesOnlyOutline | null | undefined,
  incoming: TitlesOnlyOutline,
): TitlesOnlyOutline {
  const incomingClone: TitlesOnlyOutline = {
    metadata: { ...incoming.metadata },
    titulos: Array.isArray(incoming.titulos) ? incoming.titulos.map(cloneTitulo) : [],
  }
  if (!base) return incomingClone
  const baseClone: TitlesOnlyOutline = {
    metadata: { ...base.metadata },
    titulos: Array.isArray(base.titulos) ? base.titulos.map(cloneTitulo) : [],
  }
  return {
    metadata: {
      document_title: safeString(baseClone.metadata.document_title) || incomingClone.metadata.document_title,
      source: safeString(baseClone.metadata.source) || incomingClone.metadata.source,
      language: 'es',
      generated_at: incomingClone.metadata.generated_at || baseClone.metadata.generated_at,
    },
    titulos: mergeTitulos(baseClone.titulos, incomingClone.titulos),
  }
}







