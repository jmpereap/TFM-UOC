import { NextRequest, NextResponse } from 'next/server'
import { logEvent } from '@/lib/logging/logger'
import { PageEntry } from '@/lib/pdf/pagesMap'
import { generateArticleSummary } from '@/lib/utils/articleSummary'
import { generateArticleSummaryWithAI } from '@/lib/utils/articleSummary'

export const runtime = 'nodejs'

// Función para normalizar el número de artículo para búsqueda
function normalizeArticleNumber(articuloNumero: string): string {
  // Extraer solo el número del artículo (ej: "Artículo 51" -> "51")
  const match = articuloNumero.match(/(\d+|[IVXLCDM]+|bis|ter)/i)
  return match ? match[1] : articuloNumero.replace(/Art[íi]culo\s+/i, '').trim()
}

// Función para extraer el artículo directamente del texto del PDF
// REGLAS:
// 1. Buscar línea que contiene exactamente "Artículo X." seguido de espacio y título/rúbrica
// 2. El cuerpo del artículo incluye TODO el texto después de esa línea hasta:
//    - El siguiente encabezado de artículo (línea que empieza por "Artículo " seguida de número)
//    - O un encabezado de "TÍTULO", "CAPÍTULO", "SECCIÓN" o "DISPOSICIÓN"
//    - O el final del texto
// 3. El artículo puede ocupar VARIAS PÁGINAS (no cortar por cambios de página)
// 4. Conservar la numeración interna (1., 2., a), b), etc.)
function extractArticleFromText(
  fullText: string,
  articuloNumero: string
): { found: boolean; numero_articulo: string; rubrica_articulo: string; texto_articulo: string } {
  const normalizedNum = normalizeArticleNumber(articuloNumero)
  
  // PASO 1: Buscar el encabezado del artículo
  // Formato: "Artículo X. Rúbrica." o "Artículo X. Rúbrica:"
  // La rúbrica termina en el PRIMER punto o dos puntos después de "Artículo X."
  // Luego viene el texto del artículo (que puede empezar con "1.")
  
  // Buscar "Artículo X." al inicio de línea
  const articleStartPattern = new RegExp(
    `^Artículo\\s+${normalizedNum}(?:\\s*(?:bis|ter|quater|quinquies|sexies|septies|octies|nonies|decies))?\\s*\\.`,
    'im'
  )
  
  const articleStartMatch = fullText.match(articleStartPattern)
  if (!articleStartMatch) {
    // Fallback: buscar sin requerir inicio de línea
    const fallbackStartPattern = new RegExp(
      `Artículo\\s+${normalizedNum}(?:\\s*(?:bis|ter|quater|quinquies|sexies|septies|octies|nonies|decies))?[.\\-:]`,
      'i'
    )
    const fallbackStartMatch = fullText.match(fallbackStartPattern)
    if (!fallbackStartMatch) {
      const similarPatterns = fullText.match(/Art[íi]culo\s+\d+/gi)
      return {
        found: false,
        numero_articulo: articuloNumero,
        rubrica_articulo: '',
        texto_articulo: '',
        _debug: {
          patternUsed: articleStartPattern.source,
          normalizedNum: normalizedNum,
          similarArticlesFound: similarPatterns || []
        }
      } as any
    }
    // Usar fallback
    const headerStartIndex = fallbackStartMatch.index! + fallbackStartMatch[0].length
    const afterHeader = fullText.substring(headerStartIndex)
    
    // Extraer rúbrica (hasta el primer punto o dos puntos)
    const rubricaMatch = afterHeader.match(/^\s*([^.:\n]+?)(?:\.|:)(?:\s|$|\n)/)
    const rubricaArticulo = rubricaMatch ? rubricaMatch[1].trim() : ''
    const textoStartIndex = headerStartIndex + (rubricaMatch ? rubricaMatch[0].length : 0)
    
    // Buscar el final del artículo
    const remainingText = fullText.substring(textoStartIndex)
    const endIndex = findArticleEnd(remainingText, normalizedNum)
    let textoArticulo = remainingText.substring(0, endIndex).trim()
    
    // Limpiar el texto
    textoArticulo = cleanArticleText(textoArticulo)
    
    return {
      found: true,
      numero_articulo: articuloNumero,
      rubrica_articulo: rubricaArticulo,
      texto_articulo: textoArticulo
    }
  }
  
  // Encontramos "Artículo X." al inicio de línea
  const headerStartIndex = articleStartMatch.index! + articleStartMatch[0].length
  const afterHeader = fullText.substring(headerStartIndex)
  
  // Extraer la rúbrica (hasta el PRIMER punto o dos puntos)
  // La rúbrica NO debe incluir números como "1." porque eso es parte del texto del artículo
  const rubricaMatch = afterHeader.match(/^\s*([^.:\n]+?)(?:\.|:)(?:\s|$|\n)/)
  const rubricaArticulo = rubricaMatch ? rubricaMatch[1].trim() : ''
  const textoStartIndex = headerStartIndex + (rubricaMatch ? rubricaMatch[0].length : 0)
  
  // PASO 2: Extraer el cuerpo del artículo (después de la rúbrica hasta el siguiente delimitador)
  const remainingText = fullText.substring(textoStartIndex)
  
  // Buscar el final del artículo
  const endIndex = findArticleEnd(remainingText, normalizedNum)
  let textoArticulo = remainingText.substring(0, endIndex).trim()
  
  // Verificación adicional: si el texto contiene "Artículo Y." (donde Y != X), cortar antes
  const siguienteArticuloPattern = new RegExp(
    `Artículo\\s+(?!${normalizedNum}(?:\\s*(?:bis|ter|quater|quinquies|sexies|septies|octies|nonies|decies))?\\s*\\.)[\\d]+(?:\\s*(?:bis|ter|quater|quinquies|sexies|septies|octies|nonies|decies))?\\s*\\.`,
    'i'
  )
  
  const siguienteArticuloMatch = textoArticulo.match(siguienteArticuloPattern)
  if (siguienteArticuloMatch && siguienteArticuloMatch.index !== undefined) {
    // El texto contiene el siguiente artículo, cortar antes
    const siguienteArticuloIndex = siguienteArticuloMatch.index!
    // Buscar el salto de línea antes del siguiente artículo
    const lineBreakBefore = textoArticulo.lastIndexOf('\n', siguienteArticuloIndex)
    if (lineBreakBefore >= 0) {
      textoArticulo = textoArticulo.substring(0, lineBreakBefore).trim()
    } else {
      // Si no hay salto de línea, buscar espacio antes
      const spaceBefore = textoArticulo.lastIndexOf(' ', siguienteArticuloIndex)
      if (spaceBefore >= 0) {
        textoArticulo = textoArticulo.substring(0, spaceBefore).trim()
      } else {
        // Si no hay espacio, cortar en la posición del siguiente artículo
        textoArticulo = textoArticulo.substring(0, siguienteArticuloIndex).trim()
      }
    }
  }
  
  // PASO 3: Limpiar el texto (solo elementos de formato, preservar contenido)
  textoArticulo = cleanArticleText(textoArticulo)
  
  return {
    found: true,
    numero_articulo: articuloNumero,
    rubrica_articulo: rubricaArticulo,
    texto_articulo: textoArticulo
  }
}

// Función auxiliar para encontrar el final del artículo
function findArticleEnd(text: string, currentArticleNum: string): number {
  // Buscar delimitadores en este orden:
  // 1. Siguiente artículo (cualquier "Artículo Y." donde Y != currentArticleNum) - PRIORITARIO
  // 2. TÍTULO
  // 3. CAPÍTULO
  // 4. SECCIÓN
  // 5. DISPOSICIÓN
  // 6. Final del texto
  
  let earliestEnd = text.length
  
  // Patrón para cualquier artículo (puede estar al inicio de línea o en medio)
  // Excluir el artículo actual
  // IMPORTANTE: matchAll requiere el flag 'g' (global)
  // Buscar "Artículo Y." donde Y != currentArticleNum
  const anyArticlePattern = new RegExp(
    `(?:^|\\n|\\s)Artículo\\s+(?!${currentArticleNum}(?:\\s*(?:bis|ter|quater|quinquies|sexies|septies|octies|nonies|decies))?\\s*\\.)[\\d]+(?:\\s*(?:bis|ter|quater|quinquies|sexies|septies|octies|nonies|decies))?\\s*\\.`,
    'gim'
  )
  
  const articleMatches = Array.from(text.matchAll(anyArticlePattern))
  if (articleMatches.length > 0) {
    // Encontramos otro artículo, el actual termina ANTES de este
    const nextArticleMatch = articleMatches[0]
    const nextArticleIndex = nextArticleMatch.index!
    
    // El patrón puede incluir espacios o saltos de línea al inicio
    // Necesitamos encontrar dónde empieza realmente "Artículo Y."
    let actualArticleStart = nextArticleIndex
    
    // Si el match empieza con espacio o salto de línea, ajustar
    if (nextArticleMatch[0] && (nextArticleMatch[0].startsWith(' ') || nextArticleMatch[0].startsWith('\n'))) {
      // Buscar dónde empieza "Artículo" en el match
      const articuloStartInMatch = nextArticleMatch[0].indexOf('Artículo')
      if (articuloStartInMatch >= 0) {
        actualArticleStart = nextArticleIndex + articuloStartInMatch
      }
    }
    
    // Buscar el salto de línea antes del siguiente artículo
    // Si no hay salto de línea, buscar espacios o cualquier separador
    let cutIndex = actualArticleStart
    
    // Buscar hacia atrás para encontrar el salto de línea más cercano
    const lineBreakIndex = text.lastIndexOf('\n', actualArticleStart)
    if (lineBreakIndex >= 0) {
      cutIndex = lineBreakIndex
    } else {
      // Si no hay salto de línea, buscar espacios antes de "Artículo"
      // Pero solo si hay suficiente espacio (más de 5 caracteres) para evitar cortar en medio de una palabra
      if (actualArticleStart > 5) {
        const spaceBefore = text.lastIndexOf(' ', actualArticleStart)
        if (spaceBefore >= 0 && actualArticleStart - spaceBefore < 20) {
          // Solo cortar en espacio si está cerca (dentro de 20 caracteres)
          cutIndex = spaceBefore
        }
      }
    }
    
    earliestEnd = Math.min(earliestEnd, cutIndex)
  }
  
  // Buscar otros delimitadores (solo si no encontramos otro artículo antes)
  if (earliestEnd === text.length) {
    const delimiterPatterns = [
      /(?:^|\n)\s*TÍTULO\s+[IVXLCDM\d]+/gim,
      /(?:^|\n)\s*CAPÍTULO\s+[IVXLCDM\d]+/gim,
      /(?:^|\n)\s*SECCIÓN\s+[IVXLCDM\d]+/gim,
      /(?:^|\n)\s*DISPOSICIÓN\s+(?:ADICIONAL|TRANSITORIA|DEROGATORIA|FINAL)/gim,
    ]
    
    for (const pattern of delimiterPatterns) {
      const matches = Array.from(text.matchAll(pattern))
      if (matches.length > 0) {
        const matchIndex = matches[0].index!
        // Buscar el salto de línea antes del delimitador
        let cutIndex = matchIndex
        if (matchIndex > 0 && text[matchIndex] !== '\n') {
          const lineBreakIndex = text.lastIndexOf('\n', matchIndex)
          if (lineBreakIndex >= 0) {
            cutIndex = lineBreakIndex
          }
        }
        if (cutIndex < earliestEnd) {
          earliestEnd = cutIndex
        }
      }
    }
  }
  
  return earliestEnd
}

// Función auxiliar para limpiar el texto del artículo
function cleanArticleText(text: string): string {
  return text
    // Eliminar líneas que son solo números (números de página en el pie)
    .replace(/^\s*\d+\s*$/gm, '')
    // Eliminar líneas con solo puntos y números (formato de índice)
    .replace(/^\s*\.+\s*\d+\s*$/gm, '')
    // Eliminar líneas del índice que tienen formato "Artículo X. Texto... 15"
    .replace(/^\s*Artículo\s+\d+\.\s+[^.]+\s+\.{3,}\s+\d+\s*$/gm, '')
    // Eliminar múltiples puntos consecutivos del índice (más de 5 puntos)
    .replace(/\.{6,}/g, '')
    // Normalizar saltos de línea múltiples (máximo 2 saltos seguidos)
    .replace(/\n{3,}/g, '\n\n')
    // Limpiar espacios al inicio y final de cada línea
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0) // Eliminar líneas vacías
    .join('\n')
    .trim()
}

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json()
    
    // PASO 1: Usar el PDF completo (índice incluido) - pagesFullRaw
    const pagesFullRaw = Array.isArray(payload?.pagesFullRaw) ? payload.pagesFullRaw : []
    
    if (!pagesFullRaw.length) {
      return NextResponse.json({ 
        ok: false, 
        error: `pagesFullRaw requerido (PDF completo). Recibido: ${Array.isArray(payload?.pagesFullRaw) ? 'array vacío' : 'no array'}` 
      }, { status: 400 })
    }
    
    const articuloNumero = typeof payload?.articuloNumero === 'string' ? payload.articuloNumero : ''
    const articuloPagina = typeof payload?.articuloPagina === 'number' ? payload.articuloPagina : 0
    
    if (!articuloNumero || articuloNumero.trim() === '') {
      return NextResponse.json({ ok: false, error: `articuloNumero requerido` }, { status: 400 })
    }
    
    if (!articuloPagina || articuloPagina <= 0) {
      return NextResponse.json({ ok: false, error: `articuloPagina requerido y debe ser > 0` }, { status: 400 })
    }
    
    // PASO 2: Normalizar las páginas y extraer el número de página del pie de página
    // Los PDFs tienen números de página en el pie de página, necesitamos extraerlos
    const normalizedPages: PageEntry[] = pagesFullRaw.map((entry: any, idx: number) => {
      const text = typeof entry?.text === 'string' ? entry.text : ''
      let pageNum = typeof entry?.num === 'number' ? entry.num : idx + 1
      
      // Buscar el número de página en el pie de página
      // Los números de página suelen estar al final de la página
      const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0)
      const lastLines = lines.slice(-10).join('\n') // Últimas 10 líneas no vacías
      
      // Buscar números que aparezcan solos en líneas (muy común en pies de página)
      // Primero buscar líneas que contengan solo un número
      for (let i = lines.length - 1; i >= Math.max(0, lines.length - 10); i--) {
        const line = lines[i].trim()
        // Si la línea contiene solo un número (posible número de página)
        if (/^\d{1,4}$/.test(line)) {
          const foundPageNum = parseInt(line, 10)
          if (foundPageNum > 0 && foundPageNum < 10000) {
            pageNum = foundPageNum
            break
          }
        }
      }
      
      // Si no encontramos un número solo, buscar con patrones
      if (pageNum === (typeof entry?.num === 'number' ? entry.num : idx + 1)) {
        const footerPatterns = [
          // "página X" o "pág. X"
          /p[áa]g\.?\s*(\d{1,4})/i,
          // "página X" completo
          /p[áa]gina\s+(\d{1,4})/i,
          // "p. X"
          /p\.\s*(\d{1,4})/i,
          // "X / Y" (página X de Y)
          /(\d{1,4})\s*\/\s*\d+/,
          // Número al final de una línea (sin contexto)
          /(\d{1,4})\s*$/m,
        ]
        
        for (const pattern of footerPatterns) {
          const matches = Array.from(lastLines.matchAll(new RegExp(pattern.source, 'gmi')))
          for (const match of matches) {
            if (match[1]) {
              const foundPageNum = parseInt(match[1], 10)
              if (foundPageNum > 0 && foundPageNum < 10000) {
                pageNum = foundPageNum
                break
              }
            }
          }
          if (pageNum !== (typeof entry?.num === 'number' ? entry.num : idx + 1)) {
            break
          }
        }
      }
      
      return {
        num: pageNum,
        text: text,
      }
    })
    
    // Logging para debug: ver qué números se extrajeron
    const extractedPageNumbers = normalizedPages.map(p => p.num)
    const sampleFooterTexts = normalizedPages.slice(0, 3).map((p, idx) => {
      const lines = p.text.split(/\r?\n/)
      return {
        pageNum: p.num,
        lastLines: lines.slice(-3).join(' | ')
      }
    })
    
    logEvent('mentalOutline.article.extract.footer_extraction', {
      totalPages: normalizedPages.length,
      extractedPageNumbers: extractedPageNumbers,
      sampleFooters: sampleFooterTexts,
      note: 'Números de página extraídos del pie de página'
    })

    logEvent('mentalOutline.article.extract.pages_mapped', {
      articulo: articuloNumero,
      paginaRealPDF: articuloPagina,
      totalPages: normalizedPages.length,
      pageNumbers: normalizedPages.map(p => p.num),
      firstPage: normalizedPages[0]?.num,
      lastPage: normalizedPages[normalizedPages.length - 1]?.num
    })

    // PASO 3: Localizar la página real del PDF donde está el artículo
    // Buscar la página con el número exacto que corresponde a articuloPagina
    const articuloPageIndex = normalizedPages.findIndex(p => p.num === articuloPagina)
    
    if (articuloPageIndex === -1) {
      // La página no se encuentra en el array
      const pageNumbers = normalizedPages.map(p => p.num)
      logEvent('mentalOutline.article.extract.page_not_found', {
        articulo: articuloNumero,
        paginaRealPDF: articuloPagina,
        totalPages: normalizedPages.length,
        pageNumbersAvailable: pageNumbers,
        firstPage: pageNumbers[0] || null,
        lastPage: pageNumbers[pageNumbers.length - 1] || null,
        note: `La página ${articuloPagina} no está en el PDF. Total de páginas disponibles: ${normalizedPages.length}`
      })
      
      return NextResponse.json({ 
        ok: false, 
        error: `La página ${articuloPagina} no está disponible en el PDF. Total de páginas: ${normalizedPages.length}, rango: ${pageNumbers[0] || 'N/A'}-${pageNumbers[pageNumbers.length - 1] || 'N/A'}` 
      }, { status: 404 })
    }
    
    // Usar un rango más amplio alrededor de la página para capturar el artículo completo
    // El artículo puede estar dividido entre múltiples páginas, así que necesitamos más contexto
    // IMPORTANTE: Usar índices del array, no números de página (el array puede no estar ordenado por número de página)
    const startPageIndex = Math.max(0, articuloPageIndex - 3) // 3 páginas antes
    const endPageIndex = Math.min(normalizedPages.length, articuloPageIndex + 8) // 8 páginas después (para capturar artículos largos)
    const pagesToAnalyze = normalizedPages.slice(startPageIndex, endPageIndex)
    
    // Ordenar las páginas por su número real para el logging (aunque el array mantiene el orden original)
    const sortedPageNumbers = pagesToAnalyze.map(p => p.num).sort((a, b) => a - b)
    
    logEvent('mentalOutline.article.extract.page_found', {
      articulo: articuloNumero,
      paginaRealPDF: articuloPagina,
      pageIndexInArray: articuloPageIndex,
      pageNumInArray: normalizedPages[articuloPageIndex]?.num,
      pagesRangeIndices: [startPageIndex, endPageIndex],
      pagesToAnalyzeNumbers: pagesToAnalyze.map(p => p.num),
      pagesToAnalyzeNumbersSorted: sortedPageNumbers,
      note: 'pagesToAnalyze usa índices del array (puede no estar ordenado por número de página)'
    })
    
    // Construir el texto de las páginas alrededor del artículo
    const fullText = pagesToAnalyze.map(page => page.text || '').join('\n\n')
    
    // Logging: ver un preview del texto donde debería estar el artículo
    const pageWithArticle = pagesToAnalyze.find(p => p.num === articuloPagina)
    const textPreview = pageWithArticle?.text?.substring(0, 500) || fullText.substring(0, 500)
    
    logEvent('mentalOutline.article.extract.searching_article', {
      articulo: articuloNumero,
      paginaRealPDF: articuloPagina,
      textPreview: textPreview,
      fullTextLength: fullText.length,
      pagesAnalyzed: pagesToAnalyze.map(p => p.num)
    })

    // Extraer el artículo directamente del texto
    const extractedData = extractArticleFromText(fullText, articuloNumero)
    
    // Validar la respuesta
    if (!extractedData.found) {
      const debugInfo = (extractedData as any)?._debug || {}
      logEvent('mentalOutline.article.extract.article_not_found_in_text', {
        articulo: articuloNumero,
        paginaRealPDF: articuloPagina,
        pagesAnalyzed: pagesToAnalyze.length,
        pagesRange: [pagesToAnalyze[0]?.num || 0, pagesToAnalyze[pagesToAnalyze.length - 1]?.num || 0],
        textLength: fullText.length,
        patternUsed: debugInfo.patternUsed,
        normalizedNum: debugInfo.normalizedNum,
        similarArticlesFound: debugInfo.similarArticlesFound || [],
        textPreview: fullText.substring(0, 1000)
      })
      
      return NextResponse.json({ 
        ok: false, 
        error: `No se encontró el artículo ${articuloNumero} en la página ${articuloPagina} del PDF. Artículos encontrados en el texto: ${(debugInfo.similarArticlesFound || []).join(', ')}` 
      }, { status: 404 })
    }
    
    logEvent('mentalOutline.article.extract.article_found', {
      articulo: articuloNumero,
      paginaRealPDF: articuloPagina,
      hasRubrica: extractedData.rubrica_articulo.length > 0,
      textoLength: extractedData.texto_articulo.length,
      rubrica: extractedData.rubrica_articulo,
      rubricaPreview: extractedData.rubrica_articulo.substring(0, 100),
      textoCompleto: extractedData.texto_articulo, // Texto completo del artículo extraído
      textoPreview: extractedData.texto_articulo.substring(0, 500),
      textoFinal: extractedData.texto_articulo.substring(Math.max(0, extractedData.texto_articulo.length - 200)) // Últimos 200 caracteres
    })

    const rubricaArticulo = extractedData.rubrica_articulo || ''
    const textoCompleto = extractedData.texto_articulo || ''
    const numeroArticulo = extractedData.numero_articulo || articuloNumero

    if (!textoCompleto || textoCompleto.trim().length < 20) {
      return NextResponse.json({ 
        ok: false, 
        error: 'El artículo encontrado no tiene suficiente contenido' 
      }, { status: 400 })
    }

    // Determinar las páginas usadas
    const paginas = pagesToAnalyze.map(p => p.num)

    // Generar resumen
    let resumen = ''
    try {
      // Validar que el texto del artículo sea válido antes de generar resumen
      const textoParaResumen = textoCompleto.trim()
      
      // Logging del texto completo del artículo
      logEvent('mentalOutline.article.extract.before_summary', {
        articulo: articuloNumero,
        textoLength: textoParaResumen.length,
        textoCompleto: textoParaResumen, // Texto completo del artículo en el log
        textoPreview: textoParaResumen.substring(0, 500),
        hasContent: textoParaResumen.length > 50
      })
      
      // Usar IA para generar el resumen
      resumen = await generateArticleSummaryWithAI(textoParaResumen, rubricaArticulo, numeroArticulo)
      
      logEvent('mentalOutline.article.extract.after_summary', {
        articulo: articuloNumero,
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
    } catch (error: any) {
      logEvent('mentalOutline.article.summary.error', {
        articulo: articuloNumero,
        pagina: articuloPagina,
        error: error.message || String(error),
      })
      resumen = ''
    }

    return NextResponse.json({
      ok: true,
      numero_articulo: numeroArticulo,
      rubrica_articulo: rubricaArticulo,
      texto_completo: textoCompleto,
      resumen: resumen || null,
      paginas: paginas,
    })
  } catch (error: any) {
    console.error('Error en extract-article:', error)
    logEvent('mentalOutline.article.extract.error', {
      error: error.message || String(error),
      stack: error.stack
    })
    return NextResponse.json(
      { ok: false, error: error.message || 'Error interno del servidor' },
      { status: 500 }
    )
  }
}
