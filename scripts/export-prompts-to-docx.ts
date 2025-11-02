import fs from 'node:fs'
import path from 'node:path'
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx'

function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true })
}

async function main() {
  const now = new Date()
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(
    now.getDate(),
  ).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`

  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({ text: 'Export de prompts (demo)', heading: HeadingLevel.TITLE }),
          new Paragraph({
            children: [
              new TextRun('Este documento es un ejemplo generado automáticamente.'),
            ],
          }),
        ],
      },
    ],
  })

  const outDir = path.join(process.cwd(), 'docs', 'prompts', 'validated')
  ensureDir(outDir)
  const outFile = path.join(outDir, `prompt-export-${stamp}.docx`)
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

