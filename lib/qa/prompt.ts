export type Difficulty = 'simple' | 'mixed' | 'advanced'

export function buildPromptForBlock(block: string, options: { difficulty: Difficulty; numQuestions: number }) {
  const { difficulty, numQuestions } = options
  return [
    `Eres un generador de preguntas tipo test.`,
    `Nivel: ${difficulty}.`,
    `Genera ${numQuestions} preguntas de opción múltiple (A-D) sobre el siguiente texto:`,
    '---',
    block.trim(),
    '---',
    `Incluye la respuesta correcta y una breve explicación.`,
  ].join('\n')
}

