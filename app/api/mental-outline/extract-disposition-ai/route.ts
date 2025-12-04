import { NextRequest, NextResponse } from 'next/server'
import { logEvent } from '@/lib/logging/logger'
import { PageEntry } from '@/lib/pdf/pagesMap'
import { callModelJSON } from '@/lib/qa/callModel'
import { generateArticleSummaryWithAI } from '@/lib/utils/articleSummary'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'

export const runtime = 'nodejs'

// Función para normalizar el número de disposición para búsqueda
function normalizeDispositionNumber(disposicionNumero: string, tipo: string): string {
  // Extraer solo el número/ordinal de la disposición (ej: "primera" -> "primera", "1" -> "1")
  const match = disposicionNumero.match(/([\wáéíóúüñºª]+|sin número)/i)
  if (match && match[1] && match[1].toLowerCase() !== 'sin número') {
    return match[1].trim()
  }
  // Si no tiene número, devolver vacío
  return ''
}

// Función para eliminar líneas del índice del texto
function removeIndexLines(text: string): string {
  const lines = text.split(/\r?\n/)
  const cleanedLines: string[] = []
  
  for (const line of lines) {
    const trimmedLine = line.trim()
    
    // Si la línea está vacía, mantenerla
    if (trimmedLine.length === 0) {
      cleanedLines.push(line)
      continue
    }
    
    // Contar puntos en la línea
    const puntosCount = (trimmedLine.match(/\./g) || []).length
    const espaciosCount = (trimmedLine.match(/\s+/g) || []).length
    
    // Verificar si termina con un número (posible número de página)
    const terminaConNumero = /\d+\s*$/.test(trimmedLine)
    
    // Verificar si tiene muchos puntos separados por espacios
    const tieneMuchosPuntosSeparados = /(\s*\.\s*){8,}/.test(trimmedLine)
    
    // Verificar si tiene "Disposición" al inicio
    const empiezaConDisposicion = /^Disposici[óo]n\s+(Adicional|Transitoria|Derogatoria|Final)/i.test(trimmedLine)
    
    const isIndexLine = 
      (puntosCount >= 8 && terminaConNumero) ||
      (espaciosCount >= 12 && terminaConNumero) ||
      /^[\.\s\d]+$/.test(trimmedLine) ||
      (empiezaConDisposicion && puntosCount >= 8 && terminaConNumero) ||
      (puntosCount >= 5 && terminaConNumero && trimmedLine.length < 300) ||
      (tieneMuchosPuntosSeparados && terminaConNumero) ||
      (empiezaConDisposicion && tieneMuchosPuntosSeparados && terminaConNumero) ||
      (empiezaConDisposicion && puntosCount >= 6 && terminaConNumero && trimmedLine.length > 50 && trimmedLine.length < 250)
    
    if (!isIndexLine) {
      cleanedLines.push(line)
    }
  }
  
  return cleanedLines.join('\n')
}

// Función para extraer un chunk de texto desde el inicio de la disposición
function extractChunkFromDisposition(
  fullText: string,
  dispositionType: string,
  dispositionNumber: string,
  chunkSize: number = 12000
): string {
  const normalizedType = dispositionType.toLowerCase()
  const normalizedNum = normalizeDispositionNumber(dispositionNumber, dispositionType)
  
  // PRIMERO: Eliminar líneas del índice del texto completo
  const textWithoutIndex = removeIndexLines(fullText)
  
  // Construir el patrón de búsqueda según el tipo y número
  let dispositionStartPattern: RegExp
  if (normalizedNum && normalizedNum.trim() !== '') {
    // Disposición con número: "Disposición Adicional primera", "Disposición Transitoria 1", etc.
    dispositionStartPattern = new RegExp(
      `Disposici[óo]n\\s+${normalizedType}\\s+${normalizedNum.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\s*\\.)?`,
      'gi'
    )
  } else {
    // Disposición sin número: "Disposición Derogatoria", "Disposición Final"
    dispositionStartPattern = new RegExp(
      `Disposici[óo]n\\s+${normalizedType}(?:\\s*\\.)?`,
      'gi'
    )
  }
  
  let match: RegExpMatchArray | null = null
  let matchIndex: number | null = null
  
  // Buscar todas las ocurrencias y encontrar la primera que NO sea del índice
  let searchResult: RegExpExecArray | null
  while ((searchResult = dispositionStartPattern.exec(textWithoutIndex)) !== null) {
    const potentialMatch = searchResult
    const potentialIndex = potentialMatch.index
    
    // Obtener la línea completa donde está el match
    const lineStart = textWithoutIndex.lastIndexOf('\n', potentialIndex) + 1
    const lineEnd = textWithoutIndex.indexOf('\n', lineStart)
    const line = lineEnd === -1 
      ? textWithoutIndex.substring(lineStart) 
      : textWithoutIndex.substring(lineStart, lineEnd)
    const trimmedLine = line.trim()
    
    // Verificar si esta línea es del índice
    const isIndexLine = 
      /\.{3,}\s*\d+\s*$/.test(trimmedLine) ||
      /\s{10,}\d+\s*$/.test(trimmedLine) ||
      (/\.{2,}.*\d+\s*$/.test(trimmedLine) && trimmedLine.length < 250)
    
    // Si NO es del índice, usar este match
    if (!isIndexLine) {
      match = potentialMatch
      matchIndex = potentialIndex
      break
    }
  }
  
  if (!match || matchIndex === null) {
    // Si no encontramos la disposición, devolver un chunk desde el inicio (ya sin índice)
    return textWithoutIndex.substring(0, chunkSize)
  }
  
  const startIndex = matchIndex
  const endIndex = Math.min(textWithoutIndex.length, startIndex + chunkSize)
  
  const chunk = textWithoutIndex.substring(startIndex, endIndex)
  
  // Aplicar una segunda pasada de eliminación del índice al chunk extraído
  return removeIndexLines(chunk)
}

// Función para construir el prompt para la IA
function buildExtractionPrompt(inputJson: any): string {
  return `Eres un asistente jurídico especializado en legislación española. 

Tu tarea es EXTRAER de forma precisa el texto completo de una disposición concreta de una ley 
a partir de un fragmento de texto extraído de un PDF (puede contener varias disposiciones seguidas).

Instrucciones IMPORTANTES:
- SOLO debes devolver la información de la disposición cuyo tipo y número se indica en el campo "dispositionType" y "dispositionNumber" del JSON de entrada.
- La disposición comienza en la primera línea que contenga literalmente "Disposición [Tipo] [Número]" y termina JUSTO ANTES de la cabecera de la siguiente disposición
  (por ejemplo "Disposición Adicional segunda", "Disposición Transitoria 2", "Disposición Final", etc.) o de un nuevo TÍTULO/CAPÍTULO/SECCIÓN/ARTÍCULO.
- Si la disposición no tiene número (dispositionNumber está vacío), busca solo "Disposición [Tipo]" (ej: "Disposición Derogatoria", "Disposición Final").
- NO debes cortar el texto de la disposición cuando aparezca una referencia interna como "artículo 2.2", "artículo 3", etc.
  dentro de los párrafos de la disposición. Esas referencias forman parte del contenido y deben conservarse.
- Devuelve SIEMPRE el texto de la disposición completo, incluyendo:
  - numeración de apartados (1., 2., 3., a), b), c)…)
  - referencias a otros artículos o disposiciones
  - frases que continúan en la siguiente línea
- No corrijas ni reescribas el texto; respeta el contenido original lo máximo posible (solo puedes ajustar espacios o saltos de línea menores).
- La salida debe ser EXCLUSIVAMENTE un JSON válido con el esquema indicado por el usuario, sin texto adicional.

A continuación tienes un JSON con el contexto del documento 
y un fragmento de texto extraído de una ley española. 
Tu tarea es localizar y extraer la disposición indicada.

JSON de entrada:
${JSON.stringify(inputJson, null, 2)}

Devuelve un JSON con este esquema:
{
  "dispositionType": string,        // tipo de disposición solicitada (ej: "Adicional", "Transitoria", "Derogatoria", "Final")
  "dispositionNumber": string,      // número/ordinal de la disposición solicitada, o cadena vacía si no tiene número
  "title": string | null,           // título de la disposición sin el prefijo "Disposición [Tipo] [Número].", o null si no se puede determinar
  "fullText": string,               // texto completo de la disposición desde "Disposición [Tipo] [Número]." hasta justo antes de la siguiente disposición o gran bloque estructural
  "startsAtIndex": number | null,   // índice (0-based) dentro de rawText donde empieza la disposición, si lo has podido localizar
  "endsAtIndex": number | null,     // índice (0-based) dentro de rawText donde termina la disposición (posición del primer carácter que ya NO pertenece a la disposición)
  "nextHeaderPreview": string | null // un pequeño fragmento (máx. 120 caracteres) con el texto inmediatamente posterior a la disposición, si existe
}`
}

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json()
    
    // Extraer parámetros del payload
    const lawName = typeof payload?.lawName === 'string' ? payload.lawName : ''
    const dispositionType = typeof payload?.dispositionType === 'string' ? payload.dispositionType : ''
    const dispositionNumber = typeof payload?.dispositionNumber === 'string' ? payload.dispositionNumber : ''
    const pagesFull = Array.isArray(payload?.pagesFull) ? payload.pagesFull : []
    const pagesFullRaw = Array.isArray(payload?.pagesFullRaw) ? payload.pagesFullRaw : []
    const disposicionPagina = typeof payload?.disposicionPagina === 'number' ? payload.disposicionPagina : 0
    const sourceFromBookmarks = typeof payload?.sourceFromBookmarks === 'boolean' ? payload.sourceFromBookmarks : false
    
    if (!dispositionType || dispositionType.trim() === '') {
      return NextResponse.json({ ok: false, error: 'dispositionType requerido' }, { status: 400 })
    }
    
    if (!lawName || lawName.trim() === '') {
      return NextResponse.json({ ok: false, error: 'lawName requerido' }, { status: 400 })
    }
    
    // Determinar qué páginas usar
    let sourcePages: any[] = []
    let extractFromFooter = true
    
    if (sourceFromBookmarks && pagesFull.length > 0) {
      sourcePages = pagesFull
      extractFromFooter = false
    } else if (pagesFullRaw.length > 0) {
      sourcePages = pagesFullRaw
      extractFromFooter = true
    } else if (pagesFull.length > 0) {
      sourcePages = pagesFull
      extractFromFooter = false
    }
    
    if (!sourcePages.length) {
      return NextResponse.json({ 
        ok: false, 
        error: 'pagesFullRaw o pagesFull requerido' 
      }, { status: 400 })
    }
    
    // Normalizar las páginas
    const normalizedPages: PageEntry[] = sourcePages.map((entry: any, idx: number) => {
      const text = typeof entry?.text === 'string' ? entry.text : ''
      let pageNum = typeof entry?.num === 'number' ? entry.num : idx + 1
      
      if (!extractFromFooter) {
        return {
          num: pageNum,
          text: text,
        }
      }
      
      // Extraer número del pie de página
      const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0)
      for (let i = lines.length - 1; i >= Math.max(0, lines.length - 10); i--) {
        const line = lines[i].trim()
        if (/^\d{1,3}$/.test(line)) {
          const foundPageNum = parseInt(line, 10)
          if (foundPageNum > 0 && foundPageNum < 1000) {
            pageNum = foundPageNum
            break
          }
        }
      }
      
      return {
        num: pageNum,
        text: text,
      }
    })
    
    // Construir el texto completo del PDF
    const fullText = normalizedPages.map(page => page.text || '').join('\n\n')
    
    // Extraer chunk desde el inicio de la disposición
    let chunk = extractChunkFromDisposition(fullText, dispositionType, dispositionNumber, 12000)
    
    // Aplicar una limpieza final agresiva del índice al chunk
    chunk = removeIndexLines(chunk)
    
    // Determinar rango de páginas (aproximado)
    let pageRange: string | null = null
    if (disposicionPagina > 0) {
      const disposicionPageIndex = normalizedPages.findIndex(p => p.num === disposicionPagina)
      if (disposicionPageIndex >= 0) {
        const startPage = Math.max(0, disposicionPageIndex - 2)
        const endPage = Math.min(normalizedPages.length, disposicionPageIndex + 3)
        const startPageNum = normalizedPages[startPage]?.num || disposicionPagina
        const endPageNum = normalizedPages[endPage - 1]?.num || disposicionPagina
        pageRange = `páginas ${startPageNum}-${endPageNum}`
      }
    }
    
    // Construir el JSON de entrada para la IA
    const inputJson = {
      lawName: lawName,
      dispositionType: dispositionType,
      dispositionNumber: dispositionNumber || '',
      rawText: chunk,
      pageHint: pageRange
    }
    
    // Construir el prompt
    const prompt = buildExtractionPrompt(inputJson)
    
    // Llamar a la IA
    logEvent('mentalOutline.extractDispositionAI.request', {
      lawName,
      dispositionType,
      dispositionNumber,
      chunkLength: chunk.length,
      pageRange,
      chunkPreview: chunk.substring(0, 500)
    })
    
    const aiResponse = await callModelJSON(
      prompt,
      30000, // timeout 30s
      4000, // max tokens
      {
        endpoint: 'extract-disposition-ai',
        dispositionType,
        dispositionNumber,
        lawName
      }
    )
    
    // Validar la respuesta de la IA
    if (!aiResponse || typeof aiResponse !== 'object') {
      throw new Error('Respuesta inválida de la IA')
    }
    
    const extractedDisposition = {
      dispositionType: String(aiResponse.dispositionType || dispositionType),
      dispositionNumber: String(aiResponse.dispositionNumber || dispositionNumber),
      title: aiResponse.title ? String(aiResponse.title) : null,
      fullText: String(aiResponse.fullText || ''),
      startsAtIndex: typeof aiResponse.startsAtIndex === 'number' ? aiResponse.startsAtIndex : null,
      endsAtIndex: typeof aiResponse.endsAtIndex === 'number' ? aiResponse.endsAtIndex : null,
      nextHeaderPreview: aiResponse.nextHeaderPreview ? String(aiResponse.nextHeaderPreview) : null
    }
    
    // Generar resumen de la disposición usando IA
    let resumen = ''
    const textoCompleto = extractedDisposition.fullText.trim()
    const rubricaDisposicion = extractedDisposition.title || ''
    const numeroDisposicion = extractedDisposition.dispositionNumber || ''
    
    if (textoCompleto && textoCompleto.length > 0) {
      try {
        // Si el texto es muy corto, usar el texto completo directamente como resumen
        if (textoCompleto.length < 20) {
          resumen = textoCompleto
        } else {
          // Usar IA para generar el resumen basado en el texto completo extraído
          logEvent('mentalOutline.extractDispositionAI.summary.request', {
            dispositionType,
            dispositionNumber,
            textoLength: textoCompleto.length,
            textoPreview: textoCompleto.substring(0, 500)
          })
          
          // Usar la misma función de resumen que para artículos
          const tipoDisposicion = `${dispositionType} ${numeroDisposicion ? numeroDisposicion : ''}`.trim()
          resumen = await generateArticleSummaryWithAI(textoCompleto, rubricaDisposicion, tipoDisposicion)
          
          logEvent('mentalOutline.extractDispositionAI.summary.response', {
            dispositionType,
            dispositionNumber,
            resumenLength: resumen.length,
            resumenPreview: resumen.substring(0, 300)
          })
          
          // Validar y limpiar el resumen
          if (resumen) {
            resumen = resumen.replace(/\s+/g, ' ').trim()
            if (resumen.length < 20 || !/[a-zA-ZáéíóúüñÁÉÍÓÚÜÑ]/.test(resumen)) {
              resumen = ''
            }
          }
        }
      } catch (error: any) {
        logEvent('mentalOutline.extractDispositionAI.summary.error', {
          dispositionType,
          dispositionNumber,
          error: error.message || String(error),
        })
        
        // Si hay error, usar el texto completo como resumen
        resumen = textoCompleto
      }
    }
    
    // Si el resumen está vacío pero hay texto completo, usar el texto completo como resumen
    if (!resumen && textoCompleto && textoCompleto.length > 0) {
      resumen = textoCompleto
    }
    
    // Generar log detallado
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const logFileName = `extract-disposition-ai-${timestamp}.json`
      const logsDir = join(process.cwd(), 'logs')
      
      // Asegurar que el directorio existe
      try {
        await mkdir(logsDir, { recursive: true })
      } catch (err: any) {
        if (err.code !== 'EEXIST') {
          console.error('Error creando directorio logs:', err)
        }
      }
      
      const logData = {
        timestamp: new Date().toISOString(),
        source: lawName,
        dispositionType: dispositionType,
        dispositionNumber: dispositionNumber,
        disposicionPagina: disposicionPagina,
        pagesRange: pageRange,
        inputJson: inputJson,
        aiResponse: aiResponse,
        extractedDisposition: extractedDisposition,
        resumen: resumen,
        chunkLength: chunk.length,
        chunkPreview: chunk.substring(0, 500),
        fullTextLength: extractedDisposition.fullText.length,
        fullTextPreview: extractedDisposition.fullText.substring(0, 500),
        resumenLength: resumen.length,
        resumenPreview: resumen.substring(0, 300)
      }
      
      const logPath = join(logsDir, logFileName)
      await writeFile(logPath, JSON.stringify(logData, null, 2), 'utf-8')
      
      logEvent('mentalOutline.extractDispositionAI.log', {
        source: lawName,
        dispositionType: dispositionType,
        dispositionNumber: dispositionNumber,
        logFile: logFileName
      })
    } catch (logError: any) {
      console.error('Error escribiendo log detallado:', logError)
    }
    
    // Devolver la disposición extraída con texto completo y resumen
    return NextResponse.json({
      ok: true,
      dispositionType: extractedDisposition.dispositionType,
      dispositionNumber: extractedDisposition.dispositionNumber,
      title: extractedDisposition.title,
      fullText: extractedDisposition.fullText, // Texto completo
      resumen: resumen || extractedDisposition.fullText, // Resumen para mostrar al usuario
      startsAtIndex: extractedDisposition.startsAtIndex,
      endsAtIndex: extractedDisposition.endsAtIndex,
      nextHeaderPreview: extractedDisposition.nextHeaderPreview
    })
    
  } catch (error: any) {
    console.error('Error en extract-disposition-ai:', error)
    logEvent('mentalOutline.extractDispositionAI.error', {
      error: error.message || String(error),
      stack: error.stack
    })
    return NextResponse.json(
      { ok: false, error: error.message || 'Error interno del servidor' },
      { status: 500 }
    )
  }
}


