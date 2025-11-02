import fs from 'node:fs'
import path from 'node:path'
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx'

type PromptItem = {
  title: string
  body: string
  version?: string
  validatedAt?: string
}

function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true })
}

function getArg(name: string): string | undefined {
  const arg = process.argv.find((a) => a.startsWith(`${name}=`))
  if (arg) return arg.split('=').slice(1).join('=')
  const i = process.argv.indexOf(name)
  if (i >= 0 && i + 1 < process.argv.length) return process.argv[i + 1]
  return undefined
}

function splitLines(text: string): string[] {
  return (text || '').replace(/\r\n/g, '\n').split('\n')
}

async function main() {
  const now = new Date()
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(
    now.getDate(),
  ).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`

  const inputPath = getArg('--input') || path.join('docs', 'prompts', 'validated', 'pending.json')
  const version = getArg('--version') || '1'

  let items: PromptItem[] = []
  try {
    if (fs.existsSync(inputPath)) {
      const raw = fs.readFileSync(inputPath, 'utf8')
      const data = JSON.parse(raw) as { items?: PromptItem[] }
      items = Array.isArray(data.items) ? data.items : []
    }
  } catch {
    // si el JSON no es válido, seguimos con items vacío
  }

  const children: Paragraph[] = []
  children.push(new Paragraph({ text: 'TFM - Prompts validados', heading: HeadingLevel.TITLE }))
  children.push(
    new Paragraph({
      children: [
        new TextRun(`Fecha: ${now.toLocaleString('es-ES')}`),
        new TextRun({ text: `  ·  Versión: ${version}`, bold: true }),
      ],
    }),
  )
  children.push(new Paragraph({ text: '' }))

  if (!items.length) {
    children.push(
      new Paragraph({
        children: [new TextRun('Sin elementos que exportar (placeholder).')],
      }),
    )
  } else {
    items.forEach((it, idx) => {
      const v = it.version || version
      children.push(
        new Paragraph({
          text: `${idx + 1}. ${it.title}${v ? ` (v${v})` : ''}`,
          heading: HeadingLevel.HEADING_2,
        }),
      )
      if (it.validatedAt) {
        children.push(new Paragraph({ text: `Validado: ${it.validatedAt}` }))
      }
      splitLines(it.body).forEach((line) => {
        children.push(new Paragraph({ text: line }))
      })
      children.push(new Paragraph({ text: '' }))
    })
  }

  const doc = new Document({
    sections: [
      {
        children,
      },
    ],
  })

  const outDir = path.join(process.cwd(), 'docs', 'prompts', 'validated')
  ensureDir(outDir)
  const outFile = path.join(outDir, `prompts_${stamp}_v${version}.docx`)
  const buffer = await Packer.toBuffer(doc)
  fs.writeFileSync(outFile, buffer)
  // eslint-disable-next-line no-console
  console.log(`DOCX creado: ${outFile}`)
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err)
  process.exit(1)
})

