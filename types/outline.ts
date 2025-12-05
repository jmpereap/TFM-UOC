export type OutlineNode = {
  id: string
  label: string
  kind: 'root' | 'titulo' | 'capitulo' | 'seccion' | 'disposiciones' | 'concepto' | 'articulo' | 'disposicion'
  pages?: string
  articulos?: string[]
  children?: OutlineNode[]
}

export type Outline = {
  root: OutlineNode
}

