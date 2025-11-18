export type FrontMatterEntry = {
  present: boolean
  anchor: string | null
  pages: number[] | null
}

export type Articulo = {
  numero: string
  articulo_texto: string
  anchor: string
  pages: number[]
}

export type Seccion = {
  ordinal: string
  seccion_texto: string
  anchor: string
  pages: number[]
  articulos: Articulo[]
}

export type Capitulo = {
  ordinal: string
  capitulo_texto: string
  anchor: string
  pages: number[]
  secciones: Seccion[]
  articulos: Articulo[]
}

export type Titulo = {
  ordinal: string
  titulo_texto: string
  anchor: string
  pages: number[]
  capitulos: Capitulo[]
  articulos: Articulo[]
}

export type DisposicionItem = {
  numero: string
  texto_encabezado: string
  anchor: string
  pages: number[]
}

export type MentalOutline = {
  metadata: {
    document_title: string
    source: string
    language: string
    generated_at: string
  }
  front_matter: {
    preambulo: FrontMatterEntry
    exposicion_motivos: FrontMatterEntry
  }
  titulos: Titulo[]
  disposiciones: {
    adicionales: DisposicionItem[]
    transitorias: DisposicionItem[]
    derogatorias: DisposicionItem[]
    finales: DisposicionItem[]
  }
}

