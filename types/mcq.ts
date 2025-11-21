export type OptionKey = 'A' | 'B' | 'C' | 'D'

export type Difficulty = 'basico' | 'medio' | 'avanzado'

export type MCQItem = {
  pregunta: string
  opciones: Record<OptionKey, string>
  correcta: OptionKey
  justificacion: string
  difficulty: Difficulty
  referencia: {
    ley: string
    paginas: string // "p. X–Y"
    articulo?: string
    parrafo?: string
  }
}













