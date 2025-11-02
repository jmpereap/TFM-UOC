import fs from 'node:fs'
import path from 'node:path'

function ensureDir(dir: string) {
  try {
    fs.mkdirSync(dir, { recursive: true })
  } catch {
    // ignore
  }
}

export function logEvent(event: string, payload: unknown) {
  const line = JSON.stringify({ ts: new Date().toISOString(), event, payload })
  try {
    const dir = path.join(process.cwd(), 'logs')
    ensureDir(dir)
    const file = path.join(dir, 'app.jsonl')
    fs.appendFileSync(file, line + '\n', 'utf8')
  } catch {
    console.log('[log]', line)
  }
}

