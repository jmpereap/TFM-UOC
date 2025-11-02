import pdfParse from 'pdf-parse'

export async function parsePdf(buffer: Buffer): Promise<{ text: string; info: unknown; numPages: number }> {
  const res = await pdfParse(buffer)
  return {
    text: res.text || '',
    info: (res as any).info || {},
    numPages: (res as any).numpages || 0,
  }
}

