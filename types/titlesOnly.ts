export type TituloRange = {
  ordinal: string
  titulo_texto: string
  definicion: string
  anchor: string
  page_start: number
  page_end: number | null
}

export type TitlesOnlyOutline = {
  metadata: {
    document_title: string
    source: string
    language: string
    generated_at: string
  }
  titulos: TituloRange[]
}







