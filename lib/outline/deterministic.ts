import type { Outline, OutlineNode } from '@/types/outline'
import type { PageTxt } from '@/lib/utils/pageStats'
import type { RulePack } from '@/lib/legal/rulePack'
import { segmentLegalUnitsByHeaders, type LegalUnit } from '@/lib/utils/legalSegment'

function slugify(text: string, fallback: string) {
  const slug = (text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || fallback
}

function clampLabel(label: string) {
  const trimmed = (label || '').replace(/\s+/g, ' ').trim()
  return trimmed.length > 120 ? `${trimmed.slice(0, 117)}…` : trimmed
}

function formatPages(start: number, end: number) {
  if (!start && !end) return undefined
  if (!end || start === end) return `p. ${start}`
  return `p. ${start}–${end}`
}

function updateRange(node: OutlineNode, unit: LegalUnit) {
  const meta = (node as any)._range || { start: unit.startPage, end: unit.endPage }
  meta.start = Math.min(meta.start, unit.startPage)
  meta.end = Math.max(meta.end, unit.endPage)
  ;(node as any)._range = meta
  node.pages = formatPages(meta.start, meta.end)
}

function ensureChild(parent: OutlineNode, label: string, kind: OutlineNode['kind'], unit: LegalUnit) {
  parent.children = parent.children || []
  const key = slugify(label, `${kind}-${unit.startPage}`)
  let node = parent.children.find((child) => child.id === key || child.label === label)
  if (!node) {
    node = { id: key, label: clampLabel(label), kind, children: kind === 'articulo' || kind === 'disposicion' ? undefined : [] }
    parent.children.push(node)
  }
  updateRange(node, unit)
  return node
}

function extractArticleLabel(label: string) {
  const match = label.match(/^(Art[íi]culo\s+\d+[A-Za-z]?\.?)(.*)$/i)
  if (!match) return clampLabel(label)
  const head = match[1].replace(/\.$/, '').trim()
  const rest = match[2].replace(/^[\s:\-.–]+/, '').trim()
  if (!rest) return head
  return clampLabel(`${head}. ${rest}`)
}

export function buildDeterministicOutline(lawName: string, pages: PageTxt[], pack: RulePack): Outline {
  const outline: Outline = {
    root: {
      id: 'root',
      label: lawName,
      kind: 'root',
      children: [],
    },
  }

  const units = segmentLegalUnitsByHeaders(pages, pack)
  if (!units.length) return outline

  const root = outline.root
  let currentTitulo: OutlineNode | null = null
  let currentCapitulo: OutlineNode | null = null
  let currentSeccion: OutlineNode | null = null
  let currentDispGroup: OutlineNode | null = null

  const ensureTitulo = (unit: LegalUnit) => {
    currentCapitulo = null
    currentSeccion = null
    currentDispGroup = null
    currentTitulo = ensureChild(root, unit.unidad, 'titulo', unit)
    return currentTitulo
  }

  const ensureCapitulo = (unit: LegalUnit) => {
    const parent = currentTitulo ?? ensureChild(root, 'Título sin identificar', 'titulo', unit)
    currentSeccion = null
    currentDispGroup = null
    currentCapitulo = ensureChild(parent, unit.unidad, 'capitulo', unit)
    return currentCapitulo
  }

  const ensureSeccion = (unit: LegalUnit) => {
    const parent = currentCapitulo ?? ensureCapitulo({ ...unit, unidad: 'Capítulo sin identificar' })
    currentDispGroup = null
    currentSeccion = ensureChild(parent, unit.unidad, 'seccion', unit)
    return currentSeccion
  }

  const ensureDisposGroup = (unit: LegalUnit) => {
    currentTitulo = null
    currentCapitulo = null
    currentSeccion = null
    currentDispGroup = ensureChild(root, unit.unidad, 'disposiciones', unit)
    return currentDispGroup
  }

  const ensureGenericDisposGroup = (unit: LegalUnit) => {
    let group = root.children?.find((child) => child.kind === 'disposiciones') || null
    if (!group) {
      group = ensureChild(root, 'Disposiciones', 'disposiciones', unit)
    }
    currentTitulo = null
    currentCapitulo = null
    currentSeccion = null
    currentDispGroup = group
    return group
  }

  for (const unit of units) {
    const label = unit.unidad || ''
    const kind = unit.kind
    if (!kind) continue
    if (kind === 'titulo') {
      ensureTitulo(unit)
      continue
    }
    if (kind === 'capitulo') {
      ensureCapitulo(unit)
      continue
    }
    if (kind === 'seccion') {
      ensureSeccion(unit)
      continue
    }
    if (kind === 'disposiciones') {
      ensureDisposGroup(unit)
      continue
    }
    if (kind === 'disposicion') {
      const parent = currentDispGroup ?? ensureGenericDisposGroup(unit)
      ensureChild(parent, label, 'disposicion', unit)
      continue
    }
    if (kind === 'articulo') {
      const parent = currentSeccion ?? currentCapitulo ?? currentTitulo ?? ensureTitulo({ ...unit, unidad: 'Título sin identificar' })
      ensureChild(parent, extractArticleLabel(label), 'articulo', unit)
      continue
    }
  }

  // Limpia los metadatos temporales _range
  const cleanup = (node: OutlineNode) => {
    if ((node as any)._range) delete (node as any)._range
    if (node.children) node.children.forEach(cleanup)
  }
  cleanup(root)

  return outline
}
