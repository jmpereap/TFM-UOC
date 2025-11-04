export type OptionKey = 'A' | 'B' | 'C' | 'D'

export type MCQItem = {
  pregunta: string
  opciones: Record<OptionKey, string>
  correcta: OptionKey
  justificacion: string
  referencia: {
    ley: string
    paginas: string // "p. X–Y"
    articulo?: string
    parrafo?: string
  }
}


