export type FrontMatterEntry = {
  present: boolean
  anchor: string | null
  pages: number[] | null
}

export type Articulo = {
  numero: string
  articulo_texto: string
  pagina_articulo: number // Nº de página del PDF donde está el artículo
  pages?: number[] // Páginas (solo inicio del índice)
  anchor?: string // Anchor para navegación
  texto_completo?: string // Texto completo del artículo (extraído del PDF)
  resumen?: string // Resumen breve de 1-3 frases del artículo
}

export type Seccion = {
  codigo_seccion?: string // Ej: "SECCIÓN 1" o "SECCIÓN PRIMERA"
  subtitulo_seccion?: string // Ej: "De los derechos de los ciudadanos" (puede estar vacío)
  pagina_inicio_seccion: number
  pagina_fin_seccion: number
  articulos: Articulo[]
  // Propiedades transformadas del backend
  ordinal?: string
  seccion_texto?: string
  pages?: number[]
  anchor?: string
}

export type Capitulo = {
  codigo_capitulo?: string // Ej: "CAPÍTULO I" o "CAPÍTULO PRIMERO"
  subtitulo_capitulo?: string // Ej: "De los derechos fundamentales" (puede estar vacío)
  pagina_inicio_capitulo: number
  pagina_fin_capitulo: number
  articulos_sin_seccion?: Articulo[] // Artículos que cuelgan directamente del Capítulo
  secciones: Seccion[] // Secciones dentro del Capítulo (opcional)
  // Propiedades transformadas del backend
  ordinal?: string
  capitulo_texto?: string
  pages?: number[]
  anchor?: string
  articulos?: Articulo[] // Alias para articulos_sin_seccion
}

export type Titulo = {
  codigo_titulo?: string // Ej: "TÍTULO I" o "TÍTULO PRELIMINAR"
  subtitulo_titulo?: string // Ej: "Disposiciones generales" (puede estar vacío)
  pagina_inicio_titulo: number // Nº de página del PDF donde empieza el Título
  pagina_fin_titulo: number // Nº de página del PDF donde termina el Título
  articulos_sin_capitulo?: Articulo[] // Artículos que cuelgan directamente del Título
  capitulos: Capitulo[] // Capítulos dentro del Título (opcional)
  // Propiedades transformadas del backend
  ordinal?: string
  titulo_texto?: string
  pages?: number[]
  anchor?: string
  articulos?: Articulo[] // Alias para articulos_sin_capitulo
}

export type DisposicionItem = {
  numero: string
  texto_encabezado: string
  pagina_disposicion: number
  pages?: number[] // Páginas (solo inicio del índice)
  anchor?: string // Anchor para navegación
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
