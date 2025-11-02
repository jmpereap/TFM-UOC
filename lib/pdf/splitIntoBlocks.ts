export function splitIntoBlocks(text: string, maxChars = 1200): string[] {
  const clean = (text || '').replace(/\r\n/g, '\n').trim()
  if (!clean) return []

  const paragraphs = clean.split(/\n{2,}/)
  const blocks: string[] = []
  let current = ''

  const pushCurrent = () => {
    const trimmed = current.trim()
    if (trimmed) blocks.push(trimmed)
    current = ''
  }

  for (const p of paragraphs) {
    if ((current + '\n\n' + p).length > maxChars && current) {
      pushCurrent()
    }
    current = current ? current + '\n\n' + p : p
    if (current.length >= maxChars) {
      pushCurrent()
    }
  }
  pushCurrent()
  return blocks
}

