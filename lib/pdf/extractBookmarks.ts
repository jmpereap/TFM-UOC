// Usar PyMuPDF (fitz) vía script Python como método principal
// Es más confiable que pdfjs-dist y no tiene problemas de worker
async function extractBookmarksWithPyMuPDF(buffer: Buffer): Promise<BookmarkItem[]> {
  return new Promise((resolve) => {
    try {
      const { spawn } = require('child_process')
      const path = require('path')
      const fs = require('fs')
      const os = require('os')
      
      // Ruta al script Python
      const scriptPath = path.join(process.cwd(), 'scripts', 'extract-bookmarks.py')
      
      // Verificar que el script existe
      if (!fs.existsSync(scriptPath)) {
        console.warn('Script Python de extracción de bookmarks no encontrado en:', scriptPath)
        resolve([])
        return
      }
      
      // Crear archivo temporal para el PDF (evita problemas con argumentos largos)
      const tempDir = os.tmpdir()
      const tempFilePath = path.join(tempDir, `pdf-bookmarks-${Date.now()}-${Math.random().toString(36).substring(7)}.pdf`)
      
      // Escribir el buffer a un archivo temporal
      fs.writeFileSync(tempFilePath, buffer)
      
      // Intentar diferentes comandos de Python (python, python3, py)
      const pythonCommands = ['python', 'python3', 'py']
      let pythonProcess: any = null
      let pythonCommand = 'python'
      
      // Intentar crear el proceso con cada comando
      for (const cmd of pythonCommands) {
        try {
          pythonProcess = spawn(cmd, [scriptPath, tempFilePath], {
            cwd: process.cwd(),
            stdio: ['pipe', 'pipe', 'pipe'],
            shell: false,
            windowsVerbatimArguments: false,
            encoding: 'utf8' // Asegurar codificación UTF-8
          })
          pythonCommand = cmd
          break
        } catch (e: any) {
          // Si falla, intentar siguiente comando
          if (pythonProcess) {
            pythonProcess.kill()
            pythonProcess = null
          }
          continue
        }
      }
      
      if (!pythonProcess) {
        // Limpiar archivo temporal
        try { fs.unlinkSync(tempFilePath) } catch (e) {}
        console.warn('Python no está disponible. Instala Python 3.7+ para extraer bookmarks.')
        console.warn('Comandos intentados:', pythonCommands.join(', '))
        console.warn('Ruta del script:', scriptPath)
        resolve([])
        return
      }
      
      let stdout = ''
      let stderr = ''
      
      pythonProcess.stdout.setEncoding('utf8')
      pythonProcess.stderr.setEncoding('utf8')
      
      pythonProcess.stdout.on('data', (data: string) => {
        stdout += data
      })
      
      pythonProcess.stderr.on('data', (data: string) => {
        stderr += data
      })
      
      pythonProcess.on('close', (code: number) => {
        // Limpiar archivo temporal
        try { 
          if (fs.existsSync(tempFilePath)) {
            fs.unlinkSync(tempFilePath)
          }
        } catch (e) {
          // Ignorar errores al limpiar
        }
        
        if (code !== 0) {
          // Error ejecutando el script - mostrar error completo
          const errorMsg = stderr || stdout || 'Error desconocido'
          
          // Código -4058 en Windows generalmente indica error de acceso o proceso no iniciado
          if (code === -4058 || code === 1) {
            console.warn('Error ejecutando script Python (código:', code, ')')
            console.warn('Comando usado:', pythonCommand, scriptPath)
            console.warn('Archivo temporal:', tempFilePath)
          }
          
          if (errorMsg.includes('PyMuPDF') || errorMsg.includes('fitz') || errorMsg.includes('ImportError')) {
            console.warn('PyMuPDF no está instalado. Instala con: pip install pymupdf')
            console.warn('Error completo:', errorMsg)
          } else if (errorMsg.includes('python') || errorMsg.includes('Python')) {
            console.warn('Error con Python:', errorMsg)
          } else if (stderr || stdout) {
            console.warn('Error ejecutando script Python de bookmarks:')
            console.warn('Código de salida:', code)
            if (stderr) console.warn('STDERR:', stderr)
            if (stdout) console.warn('STDOUT:', stdout)
          } else {
            console.warn('Error desconocido ejecutando script Python (código:', code, ')')
            console.warn('Verifica que Python esté instalado y en el PATH')
          }
          resolve([])
          return
        }
        
        try {
          // Parsear la respuesta JSON
          if (!stdout || stdout.trim().length === 0) {
            console.warn('Script Python no retornó datos')
            resolve([])
            return
          }
          
          const result = JSON.parse(stdout)
          
          if (result.error) {
            console.warn('Error del script Python:', result.error)
            if (result.details) {
              console.warn('Detalles:', JSON.stringify(result.details, null, 2))
            }
            resolve([])
            return
          }
          
          if (result.ok && Array.isArray(result.bookmarks)) {
            // Convertir a nuestro formato BookmarkItem
            function convertBookmark(bm: any): BookmarkItem {
              // Asegurar que el título esté en UTF-8
              let title = bm.title || ''
              if (typeof title !== 'string') {
                title = String(title)
              }
              
              return {
                title: title,
                pageNumber: bm.pageNumber || null,
                children: Array.isArray(bm.children) 
                  ? bm.children.map((child: any) => convertBookmark(child))
                  : []
              }
            }
            
            const converted = result.bookmarks.map((bm: any) => convertBookmark(bm))
            console.log(`✓ Extraídos ${converted.length} bookmarks con PyMuPDF`)
            resolve(converted)
          } else {
            // No hay bookmarks
            resolve([])
          }
        } catch (parseError: any) {
          console.warn('Error parseando respuesta del script Python:')
          console.warn('Error:', parseError?.message || parseError)
          console.warn('STDOUT recibido:', stdout?.substring(0, 500))
          resolve([])
        }
      })
      
      pythonProcess.on('error', (error: any) => {
        // Limpiar archivo temporal en caso de error
        try { 
          if (fs.existsSync(tempFilePath)) {
            fs.unlinkSync(tempFilePath)
          }
        } catch (e) {
          // Ignorar errores al limpiar
        }
        
        // Python no está instalado o no se puede ejecutar
        console.warn('Error ejecutando Python:')
        console.warn('Código:', error.code)
        console.warn('Mensaje:', error.message)
        if (error.stack) console.warn('Stack:', error.stack)
        
        if (error.code === 'ENOENT') {
          console.warn('Python no está instalado o no está en el PATH')
          console.warn('Comandos intentados:', pythonCommands.join(', '))
          console.warn('Instala Python 3.7+ desde https://www.python.org/downloads/')
        }
        resolve([])
      })
      
    } catch (error) {
      console.warn('Error inicializando extracción con PyMuPDF:', error)
      resolve([])
    }
  })
}

// Fallback: usar pdfjs-dist si pdf2json no está disponible
let pdfjsLib: any = null
let pdfjsInitialized = false

async function initializePdfjs() {
  if (pdfjsInitialized) return pdfjsLib
  
  try {
    // Importar pdfjs-dist dinámicamente
    const pdfjsModule = await import('pdfjs-dist')
    pdfjsLib = pdfjsModule.default || pdfjsModule
    
    // Configurar el worker para Node.js/Next.js
    if (typeof window === 'undefined' && pdfjsLib.GlobalWorkerOptions) {
      // En Node.js, intentar deshabilitar el worker completamente
      pdfjsLib.GlobalWorkerOptions.workerSrc = ''
    }
    
    pdfjsInitialized = true
    return pdfjsLib
  } catch (error) {
    return null
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
  // Intentar primero con PyMuPDF (más confiable, sin problemas de worker)
  try {
    const pymupdfResult = await extractBookmarksWithPyMuPDF(buffer)
    if (pymupdfResult && pymupdfResult.length > 0) {
      return pymupdfResult
    }
  } catch (error) {
    // Si PyMuPDF falla, continuar con pdfjs-dist
  }
  
  // Fallback: intentar con pdfjs-dist
  try {
    const pdfjs = await initializePdfjs()
    if (!pdfjs) {
      return []
    }
    
    // Convertir Buffer a Uint8Array (pdfjs-dist requiere Uint8Array, no Buffer)
    const uint8Array = new Uint8Array(buffer)
    
    // Cargar el documento PDF
    const loadingTask = pdfjs.getDocument({
      data: uint8Array,
      useSystemFonts: true,
      verbosity: 0,
      useWorkerFetch: false,
      isEvalSupported: false,
      disableAutoFetch: true,
      disableStream: true,
      disableRange: true,
      stopAtErrors: false,
    })

    const pdf = await loadingTask.promise
    const outline = await pdf.getOutline()

    if (!outline || outline.length === 0) {
      return []
    }

    // Función recursiva para convertir los bookmarks a nuestro formato
    async function convertBookmark(item: any): Promise<BookmarkItem> {
      // Asegurar que el título esté en UTF-8
      let title = item.title || ''
      if (typeof title !== 'string') {
        title = String(title)
      }
      
      const bookmark: BookmarkItem = {
        title: title,
        pageNumber: null,
        children: [],
      }

      // Intentar obtener el número de página del destino
      if (item.dest) {
        try {
          let dest = item.dest
          if (typeof dest === 'string') {
            const destRef = await pdf.getDestination(dest)
            if (destRef) dest = destRef
          }
          if (Array.isArray(dest) && dest.length > 0) {
            const pageRef = dest[0]
            const page = await pdf.getPageIndex(pageRef)
            bookmark.pageNumber = page + 1
          }
        } catch (error) {
          // Ignorar errores al obtener página
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
  } catch (error: any) {
    // Manejar errores de manera silenciosa - la extracción de bookmarks es opcional
    // No mostrar warnings para errores conocidos del worker
    const errorMessage = error?.message || String(error)
    if (
      errorMessage.includes('worker') || 
      errorMessage.includes('GlobalWorkerOptions') ||
      errorMessage.includes('pdf2json')
    ) {
      // Errores esperados - no mostrar warnings
    } else {
      // Otros errores - mostrar warning solo en desarrollo
      if (process.env.NODE_ENV === 'development') {
        console.warn('Error extrayendo bookmarks:', errorMessage.substring(0, 100))
      }
    }
    return []
  }
}

// Función para extraer bookmarks usando pdf2json
async function extractBookmarksWithPdf2json(buffer: Buffer, Pdf2json: any): Promise<BookmarkItem[]> {
  return new Promise((resolve) => {
    try {
      // pdf2json puede ser una clase o un objeto con una clase default
      const Pdf2jsonClass = Pdf2json.default || Pdf2json
      const pdfParser = new Pdf2jsonClass()

      pdfParser.on('pdfParser_dataError', (err: any) => {
        console.warn('Error parseando PDF con pdf2json:', err)
        resolve([])
      })

      pdfParser.on('pdfParser_dataReady', (pdfData: any) => {
        try {
          // pdf2json estructura los bookmarks en pdfData.Outline o pdfData.outline
          const outline = pdfData.Outline || pdfData.outline || pdfData.bookmarks
          
          if (outline && Array.isArray(outline) && outline.length > 0) {
            function convertOutlineItem(item: any): BookmarkItem {
              // Asegurar que el título esté en UTF-8
              let title = item.Title || item.title || item.text || ''
              if (typeof title !== 'string') {
                title = String(title)
              }
              
              const bookmark: BookmarkItem = {
                title: title,
                pageNumber: item.Page || item.page ? parseInt(String(item.Page || item.page)) : null,
                children: [],
              }

              // Los hijos pueden estar en Kids, kids, o children
              const kids = item.Kids || item.kids || item.children
              if (kids && Array.isArray(kids) && kids.length > 0) {
                bookmark.children = kids.map((kid: any) => convertOutlineItem(kid))
              }

              return bookmark
            }

            const converted = outline.map((item: any) => convertOutlineItem(item))
            resolve(converted)
          } else {
            resolve([])
          }
        } catch (error) {
          console.warn('Error procesando outline de pdf2json:', error)
          resolve([])
        }
      })

      // Cargar el PDF desde el buffer
      // pdf2json espera Uint8Array o ruta de archivo, no Buffer directamente
      const uint8Array = new Uint8Array(buffer)
      pdfParser.loadPDF(uint8Array)
    } catch (error) {
      console.warn('Error inicializando pdf2json:', error)
      resolve([])
    }
  })
}



