import pdfParse from 'pdf-parse'

export type ParsedPdf = {
  text: string
  info: unknown
  numPages: number
  pages: string[]
}

export async function parsePdf(buffer: Buffer): Promise<ParsedPdf> {
  const pages: string[] = []
  const res = await pdfParse(buffer, {
    pagerender: async (pageData: any) => {
      const textContent = await pageData.getTextContent({
        normalizeWhitespace: false,
        disableCombineTextItems: false,
      })
      const pageText = textContent.items.map((it: any) => it.str).join(' ')
      pages.push(pageText)
      return pageText
    },
  } as any)

  return {
    text: res.text || '',
    info: (res as any).info || {},
    numPages: (res as any).numpages || pages.length || 0,
    pages,
  }
}

