import * as pdfjsLib from 'pdfjs-dist'

// Configurar el worker de PDF.js para Node.js
if (typeof window === 'undefined') {
  // En Node.js, usar el worker desde node_modules
  try {
    const workerPath = require.resolve('pdfjs-dist/build/pdf.worker.min.mjs')
    pdfjsLib.GlobalWorkerOptions.workerSrc = workerPath
  } catch (e) {
    try {
      // Intentar con la ruta .js
      const workerPath = require.resolve('pdfjs-dist/build/pdf.worker.min.js')
      pdfjsLib.GlobalWorkerOptions.workerSrc = workerPath
    } catch (e2) {
      // Fallback: usar una ruta relativa o CDN
      pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`
    }
  }
}

export type BookmarkItem = {
  title: string
  pageNumber: number | null
  children?: BookmarkItem[]
  dest?: any // Destino del bookmark (puede ser un array, string, etc.)
}

/**
 * Extrae los marcadores (bookmarks) de un PDF
 * @param buffer - Buffer del PDF
 * @returns Array de bookmarks con su jerarquía
 */
export async function extractBookmarks(buffer: Buffer): Promise<BookmarkItem[]> {
  try {
    // Cargar el documento PDF
    const loadingTask = pdfjsLib.getDocument({
      data: buffer,
      useSystemFonts: true,
    })

    const pdf = await loadingTask.promise

    // Obtener el outline (bookmarks)
    const outline = await pdf.getOutline()

    if (!outline || outline.length === 0) {
      return []
    }

    // Función recursiva para convertir los bookmarks a nuestro formato
    async function convertBookmark(item: any): Promise<BookmarkItem> {
      const bookmark: BookmarkItem = {
        title: item.title || '',
        pageNumber: null,
        children: [],
      }

      // Intentar obtener el número de página del destino
      if (item.dest) {
        try {
          // item.dest puede ser un array, string, o un objeto
          let dest = item.dest

          // Si es un string, buscar la referencia en el documento
          if (typeof dest === 'string') {
            const destRef = await pdf.getDestination(dest)
            if (destRef) {
              dest = destRef
            }
          }

          // Si es un array, el primer elemento suele ser la referencia a la página
          if (Array.isArray(dest) && dest.length > 0) {
            const pageRef = dest[0]
            const page = await pdf.getPageIndex(pageRef)
            bookmark.pageNumber = page + 1 // PDF.js usa índice 0, nosotros usamos 1
          }
        } catch (error) {
          // Si no se puede obtener la página, dejamos pageNumber como null
          console.warn('No se pudo obtener el número de página para el bookmark:', item.title, error)
        }
      }

      // Procesar hijos recursivamente
      if (item.items && Array.isArray(item.items) && item.items.length > 0) {
        bookmark.children = await Promise.all(
          item.items.map((child: any) => convertBookmark(child))
        )
      }

      return bookmark
    }

    // Convertir todos los bookmarks
    const bookmarks = await Promise.all(
      outline.map((item: any) => convertBookmark(item))
    )

    return bookmarks
  } catch (error) {
    console.error('Error extrayendo bookmarks del PDF:', error)
    return []
  }
}

/**
 * Aplana la estructura jerárquica de bookmarks a una lista plana
 * Útil para mostrar todos los bookmarks en una lista
 */
export function flattenBookmarks(bookmarks: BookmarkItem[]): BookmarkItem[] {
  const result: BookmarkItem[] = []

  function traverse(items: BookmarkItem[], level: number = 0) {
    for (const item of items) {
      result.push({ ...item, level } as BookmarkItem)
      if (item.children && item.children.length > 0) {
        traverse(item.children, level + 1)
      }
    }
  }

  traverse(bookmarks)
  return result
}

