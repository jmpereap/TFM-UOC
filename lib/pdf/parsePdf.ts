import pdfParse from 'pdf-parse'

export type ParsedPdf = {
  text: string
  info: unknown
  numPages: number
  pages: string[]
}

export async function parsePdf(buffer: Buffer): Promise<ParsedPdf> {
  const pages: string[] = []
  
  try {
    // Usar pdf-parse con opciones mejoradas para extraer texto página por página
    const res = await pdfParse(buffer, {
      pagerender: async (pageData: any) => {
        try {
          const textContent = await pageData.getTextContent({
            normalizeWhitespace: false,
            disableCombineTextItems: false,
          })
          
          // Construir el texto de la página manteniendo mejor la estructura
          let pageText = ''
          const items = textContent.items as Array<{
            str: string
            hasEOL?: boolean
            transform?: number[]
          }>
          
          let lastY: number | null = null
          let currentLine = ''
          
          for (const item of items) {
            if (item.str) {
              const currentY = item.transform?.[5] ?? null
              
              // Detectar cambio de línea
              if (lastY !== null && currentY !== null && Math.abs(currentY - lastY) > 2) {
                // Nueva línea detectada
                if (currentLine.trim()) {
                  pageText += currentLine.trim() + '\n'
                }
                currentLine = ''
              }
              
              // Agregar el texto del item
              if (item.hasEOL) {
                // Fin de línea explícito
                currentLine += item.str
                if (currentLine.trim()) {
                  pageText += currentLine.trim() + '\n'
                }
                currentLine = ''
              } else {
                currentLine += item.str
                // Agregar espacio si no termina en espacio
                if (!item.str.endsWith(' ')) {
                  currentLine += ' '
                }
              }
              
              lastY = currentY
            }
          }
          
          // Agregar la última línea
          if (currentLine.trim()) {
            pageText += currentLine.trim()
          }
          
          // Limpiar espacios múltiples pero mantener estructura
          pageText = pageText
            .replace(/ {3,}/g, ' ') // Múltiples espacios (3+) a uno
            .replace(/\n{3,}/g, '\n\n') // Múltiples saltos de línea (3+) a dos
            .trim()
          
          pages.push(pageText)
          return pageText
        } catch (pageError) {
          console.error('[parsePdf] Error extrayendo texto de página:', pageError)
          pages.push('')
          return ''
        }
      },
    } as any)
    
    return {
      text: res.text || '',
      info: (res as any).info || {},
      numPages: (res as any).numpages || pages.length || 0,
      pages,
    }
  } catch (error) {
    console.error('[parsePdf] Error extrayendo texto con pdf-parse:', error)
    throw error
  }
}
