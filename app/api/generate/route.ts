import { NextResponse } from 'next/server'
import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'
import { distribute } from 'lib/qa/distribute'

const InputSchema = z.object({
  blocks: z.array(z.string()).min(1),
  totalQuestions: z.number().int().min(1).max(100),
  difficulty: z.enum(['simple', 'mixed', 'advanced']).default('mixed'),
})

export const runtime = 'nodejs'

export async function POST(req: Request) {
  try {
    const json = await req.json()
    const { blocks, totalQuestions, difficulty } = InputSchema.parse(json)

    const dist = distribute(totalQuestions, blocks.length)
    const questions: Array<{
      id: string
      blockIndex: number
      question: string
      choices: string[]
      answer: string
      explanation: string
    }> = []

    blocks.forEach((block, blockIndex) => {
      const count = dist[blockIndex]
      for (let i = 0; i < count; i++) {
        const qId = uuidv4()
        const base = block.trim().slice(0, 80) || 'Contenido'
        questions.push({
          id: qId,
          blockIndex,
          question: `(${difficulty}) ¿Cuál es la afirmación correcta sobre: "${base}"?`,
          choices: ['A) Opción A', 'B) Opción B', 'C) Opción C', 'D) Opción D'],
          answer: 'A',
          explanation: 'Respuesta mock para validar el flujo end-to-end.',
        })
      }
    })

    return NextResponse.json({ questions })
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.flatten() }, { status: 400 })
    }
    console.error(err)
    return NextResponse.json({ error: 'Error generando preguntas' }, { status: 500 })
  }
}

