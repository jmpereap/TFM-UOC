export type OutlineNode = {
  id: string
  label: string
  kind: 'root' | 'titulo' | 'capitulo' | 'seccion' | 'concepto' | 'articulo' | 'disposicion'
  pages?: string
  articulos?: string[]
  children?: OutlineNode[]
}

export type Outline = {
  root: OutlineNode
}

export type OutlineNodeKind = 'root' | 'titulo' | 'capitulo' | 'seccion' | 'concepto' | 'articulo' | 'disposicion'

export type OutlineNode = {
  id: string
  label: string
  kind: OutlineNodeKind
  pages?: string
  articulos?: string[]
  children?: OutlineNode[]
}

export type Outline = {
  root: OutlineNode
}


