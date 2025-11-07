export type PageEntry = {
  num: number
  text: string
}

export type PagesMapEntry = {
  page: number
  start_offset: number
  end_offset: number
}

export function buildTextFromPages(pages: PageEntry[]) {
  const joiner = '\n\n'
  let offset = 0
  const body: string[] = []
  const pagesMap: PagesMapEntry[] = []

  pages.forEach((page, index) => {
    const raw = typeof page?.text === 'string' ? page.text : ''
    const text = raw.trimEnd()
    const start = offset
    const end = start + text.length
    pagesMap.push({
      page: typeof page?.num === 'number' ? page.num : index + 1,
      start_offset: start,
      end_offset: end,
    })
    body.push(text)
    offset = end
    if (index < pages.length - 1) {
      offset += joiner.length
    }
  })

  return { text: body.join(joiner), pagesMap }
}

