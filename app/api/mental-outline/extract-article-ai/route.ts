import { NextRequest, NextResponse } from 'next/server'
import { logEvent } from '@/lib/logging/logger'
import { PageEntry } from '@/lib/pdf/pagesMap'
import { callModelJSON } from '@/lib/qa/callModel'
import { generateArticleSummaryWithAI } from '@/lib/utils/articleSummary'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'

export const runtime = 'nodejs'

// Función para normalizar el número de artículo para búsqueda
function normalizeArticleNumber(articuloNumero: string): string {
  // Extraer solo el número del artículo (ej: "Artículo 51" -> "51")
  const match = articuloNumero.match(/(\d+|[IVXLCDM]+|bis|ter)/i)
  return match ? match[1] : articuloNumero.replace(/Art[íi]culo\s+/i, '').trim()
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
    
    // Patrones típicos de líneas de índice:
    // 1. Líneas con muchos puntos seguidos de un número de página (ej: "Artículo X. Título... ... ... 9")
    // 2. Líneas que terminan con muchos puntos y un número
    // 3. Líneas con formato de índice (muchos espacios o puntos seguidos de número)
    // 4. Líneas que tienen "Artículo X." seguido de texto y muchos puntos/números
    
    // Contar puntos en la línea (incluyendo puntos separados por espacios)
    const puntosCount = (trimmedLine.match(/\./g) || []).length
    const espaciosCount = (trimmedLine.match(/\s+/g) || []).length
    
    // Verificar si termina con un número (posible número de página)
    const terminaConNumero = /\d+\s*$/.test(trimmedLine)
    
    // Verificar si tiene muchos puntos separados por espacios (patrón típico de índice)
    const tieneMuchosPuntosSeparados = /(\s*\.\s*){8,}/.test(trimmedLine)
    
    // Verificar si tiene "Artículo" al inicio
    const empiezaConArticulo = /^Artículo\s+\d+\.\s+/.test(trimmedLine)
    
    const isIndexLine = 
      // Patrón: muchos puntos (8 o más) y termina con número
      (puntosCount >= 8 && terminaConNumero) ||
      // Patrón: muchos espacios (12 o más) seguidos de un número al final
      (espaciosCount >= 12 && terminaConNumero) ||
      // Patrón: "Artículo X. Título" seguido de muchos puntos y número
      /^Artículo\s+\d+\.\s+[^.]+\s+\.{2,}\s+\d+\s*$/.test(trimmedLine) ||
      // Patrón: línea que solo contiene puntos, espacios y números
      /^[\.\s\d]+$/.test(trimmedLine) ||
      // Patrón: "Artículo X. Título" seguido de muchos puntos (separados por espacios) y número de página
      // Detecta líneas como "Artículo 4. Exactitud de los datos. . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 16"
      (empiezaConArticulo && puntosCount >= 8 && terminaConNumero) ||
      // Patrón: línea que termina con número de página después de muchos puntos o espacios
      (puntosCount >= 5 && terminaConNumero && trimmedLine.length < 300) ||
      // Patrón: línea que contiene muchos puntos separados por espacios seguidos de número
      (tieneMuchosPuntosSeparados && terminaConNumero) ||
      // Patrón: línea que tiene "Artículo" y termina con número, pero tiene muchos puntos en medio
      (empiezaConArticulo && tieneMuchosPuntosSeparados && terminaConNumero) ||
      // Patrón adicional: línea que tiene "Artículo" seguida de texto corto, muchos puntos y número
      (empiezaConArticulo && puntosCount >= 6 && terminaConNumero && trimmedLine.length > 50 && trimmedLine.length < 250)
    
    if (!isIndexLine) {
      cleanedLines.push(line)
    }
  }
  
  return cleanedLines.join('\n')
}

// Función para extraer un chunk de texto desde el inicio del artículo
function extractChunkFromArticle(
  fullText: string,
  articleNumber: string,
  chunkSize: number = 12000
): string {
  const normalizedNum = normalizeArticleNumber(articleNumber)
  
  // PRIMERO: Eliminar líneas del índice del texto completo
  const textWithoutIndex = removeIndexLines(fullText)
  
  // Buscar el inicio del artículo en el texto sin índice
  // Buscar todas las ocurrencias y verificar que no sean líneas del índice
  const articleStartPattern = new RegExp(
    `Artículo\\s+${normalizedNum}(?:\\s*(?:bis|ter|quater|quinquies|sexies|septies|octies|nonies|decies))?\\s*\\.`,
    'gi'
  )
  
  let match: RegExpMatchArray | null = null
  let matchIndex: number | null = null
  
  // Buscar todas las ocurrencias y encontrar la primera que NO sea del índice
  let searchResult: RegExpExecArray | null
  while ((searchResult = articleStartPattern.exec(textWithoutIndex)) !== null) {
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
      /^Artículo\s+\d+\.\s+.+\.{2,}.*\d+\s*$/.test(trimmedLine) ||
      (/\.{2,}.*\d+\s*$/.test(trimmedLine) && trimmedLine.length < 250)
    
    // Si NO es del índice, usar este match
    if (!isIndexLine) {
      match = potentialMatch
      matchIndex = potentialIndex
      break
    }
  }
  
  if (!match || matchIndex === null) {
    // Si no encontramos el artículo, devolver un chunk desde el inicio (ya sin índice)
    return textWithoutIndex.substring(0, chunkSize)
  }
  
  const startIndex = matchIndex
  const endIndex = Math.min(textWithoutIndex.length, startIndex + chunkSize)
  
  const chunk = textWithoutIndex.substring(startIndex, endIndex)
  
  // Aplicar una segunda pasada de eliminación del índice al chunk extraído
  // por si hay líneas del índice que se colaron
  return removeIndexLines(chunk)
}

// Función para construir el prompt para la IA
function buildExtractionPrompt(inputJson: any): string {
  return `Eres un asistente jurídico especializado en legislación española. 

Tu tarea es EXTRAER de forma precisa el texto completo de un artículo concreto de una ley 
a partir de un fragmento de texto extraído de un PDF (puede contener varios artículos seguidos).

Instrucciones IMPORTANTES:
- SOLO debes devolver la información del artículo cuyo número se indica en el campo "articleNumber" del JSON de entrada.
- El artículo comienza en la primera línea que contenga literalmente "Artículo N." (N = articleNumber) y termina JUSTO ANTES de la cabecera del siguiente artículo
  (por ejemplo "Artículo N+1.", "Artículo 3 bis.", "Artículo 10.", etc.) o de una nueva TÍTULO/CAPÍTULO/SECCIÓN/DISPOSICIÓN.
- NO debes cortar el texto del artículo cuando aparezca una referencia interna como "artículo 2.2", "artículo 3", "artículo 18.4 de la Constitución" u otras similares
  dentro de los párrafos del artículo. Esas referencias forman parte del contenido del artículo y deben conservarse.
- Devuelve SIEMPRE el texto del artículo completo, incluyendo:
  - numeración de apartados (1., 2., 3., a), b), c)…)
  - referencias a otros artículos
  - frases que continúan en la siguiente línea
- No corrijas ni reescribas el texto; respeta el contenido original lo máximo posible (solo puedes ajustar espacios o saltos de línea menores).
- La salida debe ser EXCLUSIVAMENTE un JSON válido con el esquema indicado por el usuario, sin texto adicional.

A continuación tienes un JSON con el contexto del documento 
y un fragmento de texto extraído de una ley española. 
Tu tarea es localizar y extraer el artículo indicado.

JSON de entrada:
${JSON.stringify(inputJson, null, 2)}

Devuelve un JSON con este esquema:
{
  "articleNumber": string,        // número de artículo solicitado, por ejemplo "2"
  "title": string | null,         // título del artículo sin el prefijo "Artículo 2.", o null si no se puede determinar
  "fullText": string,             // texto completo del artículo desde "Artículo 2." hasta justo antes del siguiente artículo o gran bloque estructural
  "startsAtIndex": number | null, // índice (0-based) dentro de rawText donde empieza "Artículo 2.", si lo has podido localizar
  "endsAtIndex": number | null,   // índice (0-based) dentro de rawText donde termina el artículo (posición del primer carácter que ya NO pertenece al artículo)
  "nextHeaderPreview": string | null // un pequeño fragmento (máx. 120 caracteres) con el texto inmediatamente posterior al artículo, si existe
}`
}

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json()
    
    // Extraer parámetros del payload
    const lawName = typeof payload?.lawName === 'string' ? payload.lawName : ''
    const articleNumber = typeof payload?.articleNumber === 'string' ? payload.articleNumber : ''
    const pagesFull = Array.isArray(payload?.pagesFull) ? payload.pagesFull : []
    const pagesFullRaw = Array.isArray(payload?.pagesFullRaw) ? payload.pagesFullRaw : []
    const articuloPagina = typeof payload?.articuloPagina === 'number' ? payload.articuloPagina : 0
    const sourceFromBookmarks = typeof payload?.sourceFromBookmarks === 'boolean' ? payload.sourceFromBookmarks : false
    
    if (!articleNumber || articleNumber.trim() === '') {
      return NextResponse.json({ ok: false, error: 'articleNumber requerido' }, { status: 400 })
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
    
    // Normalizar las páginas (similar a extract-article)
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
      const lines = text.split(/\r?\n/).filter((line: string) => line.trim().length > 0)
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
    
    // Extraer chunk desde el inicio del artículo
    let chunk = extractChunkFromArticle(fullText, articleNumber, 12000)
    
    // Aplicar una limpieza final agresiva del índice al chunk
    // por si hay líneas del índice que se colaron
    chunk = removeIndexLines(chunk)
    
    // Determinar rango de páginas (aproximado)
    let pageRange: string | null = null
    if (articuloPagina > 0) {
      const articuloPageIndex = normalizedPages.findIndex(p => p.num === articuloPagina)
      if (articuloPageIndex >= 0) {
        const startPage = Math.max(0, articuloPageIndex - 2)
        const endPage = Math.min(normalizedPages.length, articuloPageIndex + 3)
        const startPageNum = normalizedPages[startPage]?.num || articuloPagina
        const endPageNum = normalizedPages[endPage - 1]?.num || articuloPagina
        pageRange = `páginas ${startPageNum}-${endPageNum}`
      }
    }
    
    // Construir el JSON de entrada para la IA
    const inputJson = {
      lawName: lawName,
      articleNumber: normalizeArticleNumber(articleNumber),
      rawText: chunk,
      pageHint: pageRange
    }
    
    // Construir el prompt
    const prompt = buildExtractionPrompt(inputJson)
    
    // Llamar a la IA
    logEvent('mentalOutline.extractArticleAI.request', {
      lawName,
      articleNumber,
      chunkLength: chunk.length,
      pageRange,
      chunkPreview: chunk.substring(0, 500)
    })
    
    const aiResponse = await callModelJSON(
      prompt,
      30000, // timeout 30s
      4000, // max tokens
      {
        endpoint: 'extract-article-ai',
        articleNumber,
        lawName
      }
    )
    
    // Validar la respuesta de la IA
    if (!aiResponse || typeof aiResponse !== 'object') {
      throw new Error('Respuesta inválida de la IA')
    }
    
    const extractedArticle = {
      articleNumber: String(aiResponse.articleNumber || articleNumber),
      title: aiResponse.title ? String(aiResponse.title) : null,
      fullText: String(aiResponse.fullText || ''),
      startsAtIndex: typeof aiResponse.startsAtIndex === 'number' ? aiResponse.startsAtIndex : null,
      endsAtIndex: typeof aiResponse.endsAtIndex === 'number' ? aiResponse.endsAtIndex : null,
      nextHeaderPreview: aiResponse.nextHeaderPreview ? String(aiResponse.nextHeaderPreview) : null
    }
    
    // Generar resumen del artículo usando IA (sin inventar, basado en el texto completo extraído)
    let resumen = ''
    const textoCompleto = extractedArticle.fullText.trim()
    const rubricaArticulo = extractedArticle.title || ''
    const numeroArticulo = extractedArticle.articleNumber
    
    if (textoCompleto && textoCompleto.length > 0) {
      try {
        // Si el texto es muy corto, usar el texto completo directamente como resumen
        if (textoCompleto.length < 20) {
          resumen = textoCompleto
        } else {
          // Usar IA para generar el resumen basado en el texto completo extraído
          logEvent('mentalOutline.extractArticleAI.summary.request', {
            articleNumber,
            textoLength: textoCompleto.length,
            textoPreview: textoCompleto.substring(0, 500)
          })
          
          resumen = await generateArticleSummaryWithAI(textoCompleto, rubricaArticulo, numeroArticulo)
          
          logEvent('mentalOutline.extractArticleAI.summary.response', {
            articleNumber,
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
        logEvent('mentalOutline.extractArticleAI.summary.error', {
          articleNumber,
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
      const logFileName = `extract-article-ai-${timestamp}.json`
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
        articleNumber: articleNumber,
        articuloPagina: articuloPagina,
        pagesRange: pageRange,
        inputJson: inputJson,
        aiResponse: aiResponse,
        extractedArticle: extractedArticle,
        resumen: resumen,
        chunkLength: chunk.length,
        chunkPreview: chunk.substring(0, 500),
        fullTextLength: extractedArticle.fullText.length,
        fullTextPreview: extractedArticle.fullText.substring(0, 500),
        resumenLength: resumen.length,
        resumenPreview: resumen.substring(0, 300)
      }
      
      const logPath = join(logsDir, logFileName)
      await writeFile(logPath, JSON.stringify(logData, null, 2), 'utf-8')
      
      logEvent('mentalOutline.extractArticleAI.log', {
        source: lawName,
        articleNumber: articleNumber,
        logFile: logFileName
      })
    } catch (logError: any) {
      console.error('Error escribiendo log detallado:', logError)
    }
    
    // Devolver el artículo extraído con texto completo y resumen
    return NextResponse.json({
      ok: true,
      articleNumber: extractedArticle.articleNumber,
      title: extractedArticle.title,
      fullText: extractedArticle.fullText, // Texto completo para generar la ficha
      resumen: resumen || extractedArticle.fullText, // Resumen para mostrar al usuario
      startsAtIndex: extractedArticle.startsAtIndex,
      endsAtIndex: extractedArticle.endsAtIndex,
      nextHeaderPreview: extractedArticle.nextHeaderPreview
    })
    
  } catch (error: any) {
    console.error('Error en extract-article-ai:', error)
    logEvent('mentalOutline.extractArticleAI.error', {
      error: error.message || String(error),
      stack: error.stack
    })
    return NextResponse.json(
      { ok: false, error: error.message || 'Error interno del servidor' },
      { status: 500 }
    )
  }
}

