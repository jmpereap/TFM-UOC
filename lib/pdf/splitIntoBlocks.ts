export type Block = { index: number; startPage: number; endPage: number; text: string }

export function splitIntoBlocks(pages: string[], blockSize = 5, overlap = 1): Block[] {
  const blocks: Block[] = []
  let start = 0
  let idx = 0

  while (start < pages.length) {
    const end = Math.min(start + blockSize, pages.length)
    const text = pages.slice(start, end).join('\n\n')
    blocks.push({ index: idx++, startPage: start + 1, endPage: end, text })
    if (end === pages.length) break
    start = end - overlap
  }

  return blocks
}

