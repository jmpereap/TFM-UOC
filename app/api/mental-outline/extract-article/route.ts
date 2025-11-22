import { NextRequest, NextResponse } from 'next/server'
import { logEvent } from '@/lib/logging/logger'
import { PageEntry } from '@/lib/pdf/pagesMap'
import { generateArticleSummary } from '@/lib/utils/articleSummary'
import { generateArticleSummaryWithAI } from '@/lib/utils/articleSummary'
import { RX_BOE_FOOTER } from '@/lib/legal/fragments'

export const runtime = 'nodejs'

// Patrón para detectar cabeceras del BOE (BOLETÍN OFICIAL DEL ESTADO, LEGISLACIÓN CONSOLIDADA)
const RX_BOE_HEADER = /BOLET[ÍI]N\s+OFICIAL\s+DEL\s+ESTADO|LEGISLACI[ÓO]N\s+CONSOLIDADA/gi

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
    // Verificar que NO sea solo un número seguido de punto o paréntesis
    const rubricaMatch = afterHeader.match(/^\s*([^.:\n]+?)(?:\.|:)(?:\s|$|\n)/)
    let rubricaArticulo = ''
    let textoStartIndex = headerStartIndex
    
    if (rubricaMatch) {
      const potentialRubrica = rubricaMatch[1].trim()
      
      // Verificar que NO sea solo un número seguido de punto o paréntesis
      const isJustNumber = /^\d+[.)]?$/.test(potentialRubrica)
      
      // Verificar que tenga al menos algunas letras (no solo números y símbolos)
      const hasLetters = /[a-zA-ZáéíóúüñÁÉÍÓÚÜÑ]/.test(potentialRubrica)
      
      // Solo considerar como rúbrica si no es solo un número y tiene letras
      if (!isJustNumber && hasLetters && potentialRubrica.length >= 2) {
        rubricaArticulo = potentialRubrica
        textoStartIndex = headerStartIndex + rubricaMatch[0].length
      } else {
        // No hay rúbrica válida, el texto empieza después de "Artículo X."
        textoStartIndex = headerStartIndex
      }
    }
    
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
  // Tampoco debe ser solo un número seguido de punto o paréntesis
  const rubricaMatch = afterHeader.match(/^\s*([^.:\n]+?)(?:\.|:)(?:\s|$|\n)/)
  let rubricaArticulo = ''
  let textoStartIndex = headerStartIndex
  
  if (rubricaMatch) {
    const potentialRubrica = rubricaMatch[1].trim()
    
    // Verificar que NO sea solo un número seguido de punto o paréntesis
    // Patrones a rechazar: "1", "1.", "1)", "2", "2.", etc.
    const isJustNumber = /^\d+[.)]?$/.test(potentialRubrica)
    
    // Verificar que tenga al menos algunas letras (no solo números y símbolos)
    const hasLetters = /[a-zA-ZáéíóúüñÁÉÍÓÚÜÑ]/.test(potentialRubrica)
    
    // Solo considerar como rúbrica si:
    // 1. No es solo un número
    // 2. Tiene letras (es texto real, no solo números)
    // 3. Tiene al menos 2 caracteres (para evitar casos como "a.")
    if (!isJustNumber && hasLetters && potentialRubrica.length >= 2) {
      rubricaArticulo = potentialRubrica
      textoStartIndex = headerStartIndex + rubricaMatch[0].length
    } else {
      // No hay rúbrica válida, el texto empieza después de "Artículo X."
      textoStartIndex = headerStartIndex
    }
  }
  
  // PASO 2: Extraer el cuerpo del artículo (después de la rúbrica hasta el siguiente delimitador)
  const remainingText = fullText.substring(textoStartIndex)
  
  // Patrón para buscar el siguiente delimitador (excluyendo el artículo actual)
  const nextDelimiterPattern = new RegExp(
    `(?:^|\\n)\\s*(?:Artículo\\s+(?!${normalizedNum}(?:\\s*(?:bis|ter|quater|quinquies|sexies|septies|octies|nonies|decies))?\\s*\\.)[\\d]+(?:\\s*(?:bis|ter|quater|quinquies|sexies|septies|octies|nonies|decies))?\\s*\\.|TÍTULO|CAPÍTULO|SECCIÓN|DISPOSICIÓN)`,
    'gim'
  )
  
  // Buscar todas las cabeceras y pies de página en el texto original
  const allHeaders = Array.from(remainingText.matchAll(RX_BOE_HEADER))
  const allFooters = Array.from(remainingText.matchAll(RX_BOE_FOOTER))
  const allHeadersFooters = [...allHeaders, ...allFooters]
    .map(m => ({ start: m.index!, end: m.index! + m[0].length }))
    .sort((a, b) => a.start - b.start)
  
  // Función para verificar si una posición está dentro de una cabecera o pie de página
  const isInHeaderOrFooter = (pos: number): boolean => {
    return allHeadersFooters.some(hf => pos >= hf.start && pos < hf.end)
  }
  
  // Buscar todas las ocurrencias de delimitadores en el texto original
  const delimiterMatches = Array.from(remainingText.matchAll(nextDelimiterPattern))
  
  let endIndex = remainingText.length // Por defecto, hasta el final del texto
  
  // Buscar el primer delimitador que NO esté dentro de una cabecera o pie de página
  let foundDelimiterIndex: number | null = null
  
  for (const delimiterMatch of delimiterMatches) {
    const delimiterIndex = delimiterMatch.index!
    
    // Verificar que el delimitador no esté dentro de una cabecera o pie
    if (!isInHeaderOrFooter(delimiterIndex)) {
      foundDelimiterIndex = delimiterIndex
      break
    }
  }
  
  // Si encontramos un delimitador, verificar si hay cabeceras/pies antes de él
  // Si las hay, asegurarnos de incluir todo el contenido hasta el delimitador
  if (foundDelimiterIndex !== null) {
    // Buscar cabeceras/pies que estén antes del delimitador
    for (const hf of allHeadersFooters) {
      if (hf.end < foundDelimiterIndex) {
        // Hay una cabecera/pie antes del delimitador
        // Verificar si hay contenido después de la cabecera/pie
        const textAfterHeaderFooter = remainingText.substring(hf.end, foundDelimiterIndex).trim()
        
        // Si hay contenido después de la cabecera/pie, el artículo continúa
        // El endIndex se establecerá en el delimitador, incluyendo todo el contenido
        // hasta él (incluyendo lo que está después de la cabecera/pie)
      }
    }
    
    // Buscar el salto de línea antes del delimitador para cortar limpiamente
    let cutIndex = foundDelimiterIndex
    const lineBreakBefore = remainingText.lastIndexOf('\n', foundDelimiterIndex)
    if (lineBreakBefore >= 0) {
      cutIndex = lineBreakBefore
    } else {
      // Si no hay salto de línea, buscar espacio antes
      const spaceBefore = remainingText.lastIndexOf(' ', foundDelimiterIndex)
      if (spaceBefore >= 0 && foundDelimiterIndex - spaceBefore < 20) {
        cutIndex = spaceBefore
      }
    }
    
    endIndex = cutIndex
  }
  
  let textoArticulo = remainingText.substring(0, endIndex).trim()
  
  // IMPORTANTE: Verificar si el texto termina en una cabecera o pie de página
  // Si es así, el artículo continúa después de la cabecera/pie
  // Buscar la última cabecera/pie que esté antes o en endIndex
  const lastHeaderFooter = allHeadersFooters
    .filter(hf => hf.start < endIndex)
    .sort((a, b) => b.end - a.end)[0]
  
  if (lastHeaderFooter && endIndex <= lastHeaderFooter.end) {
    // El texto se cortó en una cabecera/pie. Buscar el siguiente delimitador después de la cabecera/pie
    const textAfterHeaderFooter = remainingText.substring(lastHeaderFooter.end)
    
    // Crear una nueva instancia del patrón para evitar problemas de estado
    const delimiterPatternAfter = new RegExp(
      `(?:^|\\n)\\s*(?:Artículo\\s+(?!${normalizedNum}(?:\\s*(?:bis|ter|quater|quinquies|sexies|septies|octies|nonies|decies))?\\s*\\.)[\\d]+(?:\\s*(?:bis|ter|quater|quinquies|sexies|septies|octies|nonies|decies))?\\s*\\.|TÍTULO|CAPÍTULO|SECCIÓN|DISPOSICIÓN)`,
      'gim'
    )
    const delimiterMatchesAfter = Array.from(textAfterHeaderFooter.matchAll(delimiterPatternAfter))
    
    if (delimiterMatchesAfter.length > 0) {
      const delimiterAfter = delimiterMatchesAfter[0]
      // Hay un delimitador después de la cabecera/pie
      // Incluir todo el contenido hasta ese delimitador
      const newEndIndex = lastHeaderFooter.end + delimiterAfter.index!
      
      // Buscar el salto de línea antes del delimitador
      let cutIndex = newEndIndex
      const lineBreakBefore = remainingText.lastIndexOf('\n', newEndIndex)
      if (lineBreakBefore >= 0) {
        cutIndex = lineBreakBefore
      } else {
        const spaceBefore = remainingText.lastIndexOf(' ', newEndIndex)
        if (spaceBefore >= 0 && newEndIndex - spaceBefore < 20) {
          cutIndex = spaceBefore
        }
      }
      
      // Actualizar el texto del artículo para incluir el contenido después de la cabecera/pie
      textoArticulo = remainingText.substring(0, cutIndex).trim()
    }
  }
  
  // Verificación adicional: si el texto contiene "Artículo Y." (donde Y != X), cortar antes
  // PERO solo si no está dentro de una cabecera o pie
  const siguienteArticuloPattern = new RegExp(
    `Artículo\\s+(?!${normalizedNum}(?:\\s*(?:bis|ter|quater|quinquies|sexies|septies|octies|nonies|decies))?\\s*\\.)[\\d]+(?:\\s*(?:bis|ter|quater|quinquies|sexies|septies|octies|nonies|decies))?\\s*\\.`,
    'i'
  )
  
  const siguienteArticuloMatch = textoArticulo.match(siguienteArticuloPattern)
  if (siguienteArticuloMatch && siguienteArticuloMatch.index !== undefined) {
    const siguienteArticuloIndex = siguienteArticuloMatch.index!
    
    // Verificar que el siguiente artículo no esté dentro de una cabecera o pie
    // textoArticulo es un substring de remainingText que empieza en 0, así que el índice es relativo
    // Pero necesitamos el índice absoluto en remainingText
    // Como textoArticulo = remainingText.substring(0, endIndex), el índice es el mismo
    const absoluteIndex = siguienteArticuloIndex
    if (absoluteIndex < remainingText.length && !isInHeaderOrFooter(absoluteIndex)) {
      // El texto contiene el siguiente artículo, cortar antes
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
  }
  
  // PASO 3: Limpiar el texto (solo elementos de formato, preservar contenido)
  textoArticulo = cleanArticleText(textoArticulo)
  
  // PASO 4: Eliminar SIEMPRE cabeceras y pies de página del texto del artículo
  // Las cabeceras y pies de página no son parte del contenido del artículo, solo son metadata de formato
  textoArticulo = textoArticulo.replace(RX_BOE_HEADER, '').replace(RX_BOE_FOOTER, '').trim()
  
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
  // IMPORTANTE: El pie de página NO es un delimitador - el artículo puede continuar después del pie
  
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

// Función para eliminar el pie de página si el artículo termina en una página
// IMPORTANTE: Solo eliminar si el artículo realmente termina (no continúa en la siguiente página)
// El artículo termina cuando encuentra: otro Artículo, TÍTULO, CAPÍTULO, SECCIÓN, DISPOSICIÓN, o fin del texto
function removeFooterIfArticleEndsOnPage(
  textoArticulo: string,
  pagesToAnalyze: PageEntry[],
  fullText: string,
  articuloNumero: string
): string {
  if (!textoArticulo || textoArticulo.trim().length === 0) {
    return textoArticulo
  }
  
  // Primero, verificar si el texto del artículo contiene el patrón del pie de página
  const footerMatch = textoArticulo.match(RX_BOE_FOOTER)
  if (!footerMatch) {
    // No hay pie de página en el texto, no hacer nada
    return textoArticulo
  }
  
  // Obtener las últimas líneas del texto del artículo (últimas 3 líneas)
  const articleLines = textoArticulo.split(/\r?\n/).filter(l => l.trim().length > 0)
  if (articleLines.length === 0) {
    return textoArticulo
  }
  
  const lastArticleLines = articleLines.slice(-3).join('\n')
  
  // Verificar si el pie de página está en las últimas líneas del artículo
  const lastLinesWithFooter = lastArticleLines.match(RX_BOE_FOOTER)
  if (!lastLinesWithFooter) {
    // El pie de página no está al final, no hacer nada (podría ser parte del contenido)
    return textoArticulo
  }
  
  // CRÍTICO: Verificar si el artículo realmente termina usando la misma lógica que extractArticleFromText
  // Necesitamos encontrar dónde termina el artículo en fullText usando findArticleEnd
  const normalizedNum = normalizeArticleNumber(articuloNumero)
  
  // Buscar el inicio del artículo en fullText
  const articleStartPattern = new RegExp(
    `^Artículo\\s+${normalizedNum}(?:\\s*(?:bis|ter|quater|quinquies|sexies|septies|octies|nonies|decies))?\\s*\\.`,
    'im'
  )
  
  const articleStartMatch = fullText.match(articleStartPattern)
  if (!articleStartMatch) {
    // No podemos determinar, ser conservador y no eliminar
    return textoArticulo
  }
  
  const headerStartIndex = articleStartMatch.index! + articleStartMatch[0].length
  const afterHeader = fullText.substring(headerStartIndex)
  
  // Extraer rúbrica (verificar que NO sea solo un número)
  const rubricaMatch = afterHeader.match(/^\s*([^.:\n]+?)(?:\.|:)(?:\s|$|\n)/)
  let textoStartIndex = headerStartIndex
  
  if (rubricaMatch) {
    const potentialRubrica = rubricaMatch[1].trim()
    const isJustNumber = /^\d+[.)]?$/.test(potentialRubrica)
    const hasLetters = /[a-zA-ZáéíóúüñÁÉÍÓÚÜÑ]/.test(potentialRubrica)
    
    // Solo considerar como rúbrica si no es solo un número y tiene letras
    if (!isJustNumber && hasLetters && potentialRubrica.length >= 2) {
      textoStartIndex = headerStartIndex + rubricaMatch[0].length
    } else {
      textoStartIndex = headerStartIndex
    }
  }
  
  // Encontrar dónde termina el artículo en el fullText usando la misma función que extractArticleFromText
  const remainingText = fullText.substring(textoStartIndex)
  const endIndex = findArticleEnd(remainingText, normalizedNum)
  const articleEndInFullText = textoStartIndex + endIndex
  
  // Obtener el texto completo del artículo desde fullText (sin limpiar aún, pero sin pie de página para comparar)
  const fullArticleTextFromFullText = fullText.substring(textoStartIndex, articleEndInFullText)
  
  // Normalizar ambos textos para comparar (sin el pie de página, normalizar espacios)
  const normalizedExtracted = textoArticulo.replace(RX_BOE_FOOTER, '').replace(/\s+/g, ' ').trim()
  const normalizedFullTextArticle = fullArticleTextFromFullText.replace(RX_BOE_FOOTER, '').replace(/\s+/g, ' ').trim()
  
  // Verificar si el texto extraído es significativamente más corto que el texto completo
  // Si es más corto en más de 50 caracteres, probablemente el artículo continúa
  const lengthDifference = normalizedFullTextArticle.length - normalizedExtracted.length
  const articleContinues = lengthDifference > 50
  
  // Obtener el texto después del artículo en fullText
  const textAfterArticle = fullText.substring(articleEndInFullText).trim()
  
  // Verificar si después del artículo hay un delimitador (siguiente artículo, TÍTULO, etc.)
  const hasDelimiterAfter = /(?:^|\n)\s*(?:Artículo\s+\d+|TÍTULO|CAPÍTULO|SECCIÓN|DISPOSICIÓN)/i.test(textAfterArticle)
  
  // Solo eliminar el pie de página si:
  // 1. El pie está en las últimas líneas del artículo extraído
  // 2. Y hay un delimitador después del artículo (el artículo realmente terminó)
  // 3. Y el texto extraído NO es significativamente más corto que el texto completo (el artículo no continúa)
  // 4. Y el texto extraído termina igual que el artículo completo (sin pie)
  if (lastLinesWithFooter && hasDelimiterAfter && !articleContinues) {
    // Verificar que el texto extraído termina igual que el artículo completo (sin pie)
    // Comparar los últimos 150 caracteres para asegurar que coinciden
    const extractedEnd = normalizedExtracted.substring(Math.max(0, normalizedExtracted.length - 150))
    const fullTextEnd = normalizedFullTextArticle.substring(Math.max(0, normalizedFullTextArticle.length - 150))
    
    // Si el final coincide (o el extraído es igual al completo), el artículo terminó aquí
    const endsMatch = fullTextEnd.endsWith(extractedEnd) || 
                     extractedEnd === fullTextEnd ||
                     (normalizedExtracted.length > 0 && normalizedFullTextArticle.endsWith(normalizedExtracted))
    
    if (endsMatch) {
      const textoLimpio = textoArticulo.replace(RX_BOE_FOOTER, '').trim()
      
      logEvent('mentalOutline.article.extract.footer_removed', {
        textoLengthBefore: textoArticulo.length,
        textoLengthAfter: textoLimpio.length,
        footerRemoved: textoArticulo.length > textoLimpio.length,
        hasDelimiterAfter: hasDelimiterAfter,
        articleContinues: articleContinues,
        lengthDifference: lengthDifference,
        extractedLength: normalizedExtracted.length,
        fullTextLength: normalizedFullTextArticle.length,
        endsMatch: endsMatch
      })
      
      return textoLimpio
    }
  }
  
  return textoArticulo
}

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json()
    
    // PASO 1: Determinar el origen y qué páginas usar
    // - Si viene desde bookmarks: usar pagesFull directamente (números de página de los bookmarks)
    // - Si viene desde método directo: usar pagesFullRaw y extraer números del pie de página
    const pagesFull = Array.isArray(payload?.pagesFull) ? payload.pagesFull : []
    const pagesFullRaw = Array.isArray(payload?.pagesFullRaw) ? payload.pagesFullRaw : []
    const sourceFromBookmarks = typeof payload?.sourceFromBookmarks === 'boolean' ? payload.sourceFromBookmarks : false
    
    // Determinar qué páginas usar y si extraer del pie de página
    let sourcePages: any[] = []
    let extractFromFooter = true // Por defecto, extraer del pie de página (método directo)
    
    if (sourceFromBookmarks && pagesFull.length > 0) {
      // Desde bookmarks: usar pagesFull directamente (ya tiene los números correctos de los bookmarks)
      sourcePages = pagesFull
      extractFromFooter = false
      logEvent('mentalOutline.article.extract.source', {
        source: 'bookmarks',
        pagesCount: sourcePages.length,
        note: 'Usando pagesFull directamente desde bookmarks'
      })
    } else if (pagesFullRaw.length > 0) {
      // Método directo: usar pagesFullRaw y extraer números del pie de página
      sourcePages = pagesFullRaw
      extractFromFooter = true
      logEvent('mentalOutline.article.extract.source', {
        source: 'direct',
        pagesCount: sourcePages.length,
        note: 'Usando pagesFullRaw y extrayendo números del pie de página'
      })
    } else if (pagesFull.length > 0) {
      // Fallback: si solo hay pagesFull, usarlo pero intentar extraer del pie si es necesario
      sourcePages = pagesFull
      // Verificar si los números de página parecen válidos (no todos son 1, 2, 3... secuenciales desde 1)
      const pageNumbers = pagesFull.map((p: any) => typeof p?.num === 'number' ? p.num : 0).filter(n => n > 0)
      const isSequential = pageNumbers.length > 0 && pageNumbers.every((n, i) => n === i + 1)
      
      if (isSequential && pageNumbers.length === pagesFull.length) {
        // Si son secuenciales desde 1, probablemente son índices, no números reales de página
        // Intentar extraer del pie de página
        extractFromFooter = true
        logEvent('mentalOutline.article.extract.source', {
          source: 'fallback_with_extraction',
          pagesCount: sourcePages.length,
          note: 'pagesFull tiene números secuenciales, extrayendo del pie de página'
        })
      } else {
        // Si no son secuenciales, probablemente son números reales de página
        extractFromFooter = false
        logEvent('mentalOutline.article.extract.source', {
          source: 'fallback_direct',
          pagesCount: sourcePages.length,
          note: 'pagesFull tiene números de página válidos, usándolos directamente'
        })
      }
    }
    
    if (!sourcePages.length) {
      return NextResponse.json({ 
        ok: false, 
        error: `pagesFullRaw o pagesFull requerido (PDF completo). Recibido: pagesFullRaw=${pagesFullRaw.length}, pagesFull=${pagesFull.length}` 
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
    
    // PASO 2: Normalizar las páginas
    // Si extractFromFooter = false: usar números de página directamente (desde bookmarks)
    // Si extractFromFooter = true: extraer números del pie de página (método directo)
    const normalizedPages: PageEntry[] = sourcePages.map((entry: any, idx: number) => {
      const text = typeof entry?.text === 'string' ? entry.text : ''
      let pageNum = typeof entry?.num === 'number' ? entry.num : idx + 1
      
      // Si NO debemos extraer del pie de página, usar el número directamente
      if (!extractFromFooter) {
        return {
          num: pageNum,
          text: text,
        }
      }
      
      // Si debemos extraer del pie de página (método directo)
      const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0)
      const lastLines = lines.slice(-10).join('\n') // Últimas 10 líneas no vacías
      
      // Buscar números que aparezcan solos en líneas (muy común en pies de página)
      // Primero buscar líneas que contengan solo un número
      for (let i = lines.length - 1; i >= Math.max(0, lines.length - 10); i--) {
        const line = lines[i].trim()
        // Si la línea contiene solo un número (posible número de página)
        // IMPORTANTE: Filtrar números que parecen años (4 dígitos > 2000) o muy grandes
        if (/^\d{1,3}$/.test(line)) { // Solo números de 1-3 dígitos (páginas normales)
          const foundPageNum = parseInt(line, 10)
          if (foundPageNum > 0 && foundPageNum < 1000) { // Filtrar números grandes
            pageNum = foundPageNum
            break
          }
        }
      }
      
      // Si no encontramos un número solo, buscar con patrones
      if (pageNum === (typeof entry?.num === 'number' ? entry.num : idx + 1)) {
        const footerPatterns = [
          // "página X" o "pág. X"
          /p[áa]g\.?\s*(\d{1,3})/i, // Solo 1-3 dígitos
          // "página X" completo
          /p[áa]gina\s+(\d{1,3})/i, // Solo 1-3 dígitos
          // "p. X"
          /p\.\s*(\d{1,3})/i, // Solo 1-3 dígitos
          // "X / Y" (página X de Y) - solo si X < 1000
          /(\d{1,3})\s*\/\s*\d+/,
        ]
        
        for (const pattern of footerPatterns) {
          const matches = Array.from(lastLines.matchAll(new RegExp(pattern.source, 'gmi')))
          for (const match of matches) {
            if (match[1]) {
              const foundPageNum = parseInt(match[1], 10)
              // Filtrar números que parecen años o muy grandes
              if (foundPageNum > 0 && foundPageNum < 1000) {
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
    let extractedData = extractArticleFromText(fullText, articuloNumero)
    
    logEvent('mentalOutline.article.extract.initial_extraction', {
      articulo: articuloNumero,
      paginaRealPDF: articuloPagina,
      found: extractedData.found,
      textoLength: extractedData.texto_articulo?.length || 0,
      textoPreview: extractedData.texto_articulo?.substring(0, 150) || '',
      rubrica: extractedData.rubrica_articulo || ''
    })
    
    // Si no se encuentra o el texto parece ser de índice (muchos puntos seguidos), buscar en todo el PDF
    const isIndexContent = extractedData.texto_articulo && 
      ((extractedData.texto_articulo.match(/\.\s*\./g) || []).length > 5 ||
      extractedData.texto_articulo.match(/^\.\s*\./m))
    
    const isTooShort = extractedData.texto_articulo && extractedData.texto_articulo.length < 50
    
    const shouldUseFallback = !extractedData.found || isIndexContent || isTooShort
    
    logEvent('mentalOutline.article.extract.fallback_check', {
      articulo: articuloNumero,
      paginaRealPDF: articuloPagina,
      shouldUseFallback: shouldUseFallback,
      found: extractedData.found,
      isIndexContent: !!isIndexContent,
      isTooShort: !!isTooShort,
      textoLength: extractedData.texto_articulo?.length || 0,
      dotsCount: extractedData.texto_articulo ? (extractedData.texto_articulo.match(/\.\s*\./g) || []).length : 0,
      textoPreview: extractedData.texto_articulo?.substring(0, 100) || ''
    })
    
    if (shouldUseFallback) {
      logEvent('mentalOutline.article.extract.fallback_search', {
        articulo: articuloNumero,
        paginaRealPDF: articuloPagina,
        reason: !extractedData.found ? 'not_found' : isIndexContent ? 'index_content' : 'too_short',
        textoLength: extractedData.texto_articulo?.length || 0,
        textoPreview: extractedData.texto_articulo?.substring(0, 100) || '',
        totalPagesInPdf: normalizedPages.length
      })
      
      // Buscar en todo el PDF como fallback, pero con búsqueda mejorada
      // Buscar todas las ocurrencias de "Artículo X" y validar cuál es el artículo real
      const fullPdfText = normalizedPages.map(page => page.text || '').join('\n\n')
      
      // Buscar todas las ocurrencias del artículo en el PDF
      const normalizedNum = normalizeArticleNumber(articuloNumero)
      const articlePattern = new RegExp(
        `Artículo\\s+${normalizedNum}(?:\\s*(?:bis|ter|quater|quinquies|sexies|septies|octies|nonies|decies))?\\s*\\.`,
        'gi'
      )
      
      const allMatches: Array<{ index: number; text: string; pageNum?: number }> = []
      let match
      while ((match = articlePattern.exec(fullPdfText)) !== null) {
        // Encontrar en qué página está este match
        let charCount = 0
        let pageNum = 1
        for (const page of normalizedPages) {
          const pageText = page.text || ''
          if (charCount + pageText.length > match.index) {
            pageNum = page.num
            break
          }
          charCount += pageText.length + 2 // +2 por el '\n\n'
        }
        
        // Extraer contexto alrededor del match (500 caracteres después)
        const contextStart = match.index
        const contextEnd = Math.min(fullPdfText.length, contextStart + 1000)
        const context = fullPdfText.substring(contextStart, contextEnd)
        
        // Verificar si parece contenido de índice (muchos puntos seguidos)
        const isIndex = (context.match(/\.\s*\./g) || []).length > 5 || context.match(/^\.\s*\./m)
        
        // Verificar si tiene contenido sustancial (palabras, no solo puntos)
        const hasSubstantialContent = context.match(/[a-zA-ZáéíóúüñÁÉÍÓÚÜÑ]{10,}/) && 
          context.length > 200 &&
          !isIndex
        
        allMatches.push({
          index: match.index,
          text: context.substring(0, 200),
          pageNum: pageNum
        })
        
        logEvent('mentalOutline.article.extract.fallback_match_found', {
          articulo: articuloNumero,
          matchIndex: match.index,
          pageNum: pageNum,
          isIndex: isIndex,
          hasSubstantialContent: hasSubstantialContent,
          contextPreview: context.substring(0, 150)
        })
        
        // Si encontramos un match que parece artículo real, intentar extraerlo
        if (hasSubstantialContent) {
          // Extraer desde este match
          const textFromMatch = fullPdfText.substring(match.index)
          const fallbackData = extractArticleFromText(textFromMatch, articuloNumero)
          
          if (fallbackData.found && fallbackData.texto_articulo.length > 100) {
            const isFallbackIndex = (fallbackData.texto_articulo.match(/\.\s*\./g) || []).length > 5
            if (!isFallbackIndex) {
              logEvent('mentalOutline.article.extract.fallback_result', {
                articulo: articuloNumero,
                found: fallbackData.found,
                textoLength: fallbackData.texto_articulo?.length || 0,
                textoPreview: fallbackData.texto_articulo?.substring(0, 200) || '',
                rubrica: fallbackData.rubrica_articulo || '',
                pageNum: pageNum
              })
              
              extractedData = fallbackData
              logEvent('mentalOutline.article.extract.fallback_success', {
                articulo: articuloNumero,
                textoLength: extractedData.texto_articulo.length,
                textoPreview: extractedData.texto_articulo.substring(0, 200),
                rubrica: extractedData.rubrica_articulo || '',
                pageNum: pageNum
              })
              break // Salir del bucle si encontramos un artículo válido
            }
          }
        }
      }
      
      // Si no encontramos un artículo válido en el bucle anterior, intentar la búsqueda normal
      if (!extractedData.found || extractedData.texto_articulo.length < 100) {
        const fallbackData = extractArticleFromText(fullPdfText, articuloNumero)
        
        logEvent('mentalOutline.article.extract.fallback_result', {
          articulo: articuloNumero,
          found: fallbackData.found,
          textoLength: fallbackData.texto_articulo?.length || 0,
          textoPreview: fallbackData.texto_articulo?.substring(0, 200) || '',
          rubrica: fallbackData.rubrica_articulo || '',
          totalMatchesFound: allMatches.length
        })
        
        if (fallbackData.found && fallbackData.texto_articulo.length > 100) {
          // Verificar que no sea contenido de índice
          const isFallbackIndex = (fallbackData.texto_articulo.match(/\.\s*\./g) || []).length > 5
          logEvent('mentalOutline.article.extract.fallback_validation', {
            articulo: articuloNumero,
            isFallbackIndex: isFallbackIndex,
            dotsCount: (fallbackData.texto_articulo.match(/\.\s*\./g) || []).length,
            textoLength: fallbackData.texto_articulo.length
          })
          
          if (!isFallbackIndex) {
            extractedData = fallbackData
            logEvent('mentalOutline.article.extract.fallback_success', {
              articulo: articuloNumero,
              textoLength: extractedData.texto_articulo.length,
              textoPreview: extractedData.texto_articulo.substring(0, 200),
              rubrica: extractedData.rubrica_articulo || ''
            })
          } else {
            logEvent('mentalOutline.article.extract.fallback_rejected', {
              articulo: articuloNumero,
              reason: 'fallback_result_is_index_content',
              textoPreview: fallbackData.texto_articulo.substring(0, 100)
            })
          }
        } else {
          logEvent('mentalOutline.article.extract.fallback_rejected', {
            articulo: articuloNumero,
            reason: fallbackData.found ? 'too_short' : 'not_found',
            textoLength: fallbackData.texto_articulo?.length || 0,
            totalMatchesFound: allMatches.length
          })
        }
      }
    } else {
      logEvent('mentalOutline.article.extract.no_fallback_needed', {
        articulo: articuloNumero,
        textoLength: extractedData.texto_articulo?.length || 0
      })
    }
    
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

    let rubricaArticulo = extractedData.rubrica_articulo || ''
    let textoCompleto = extractedData.texto_articulo || ''
    const numeroArticulo = extractedData.numero_articulo || articuloNumero

    // Limpiar el patrón "Página X" del texto antes de usarlo
    // Solo eliminar el patrón, sin tocar el resto del texto
    textoCompleto = textoCompleto.replace(/P[áa]gina\s+\d+/gi, '').trim()

    // El pie de página ya se eliminó en extractArticleFromText (siempre se elimina)

    // Si el texto está vacío pero hay rúbrica, usar la rúbrica como texto
    if (!textoCompleto || textoCompleto.trim().length === 0) {
      if (rubricaArticulo && rubricaArticulo.trim().length > 0) {
        // Si solo hay rúbrica, usar la rúbrica como texto completo
        textoCompleto = rubricaArticulo
        logEvent('mentalOutline.article.extract.only_rubrica', {
          articulo: articuloNumero,
          rubrica: rubricaArticulo,
          note: 'Artículo solo tiene rúbrica, usando rúbrica como texto completo'
        })
      } else {
        // Si no hay ni texto ni rúbrica, devolver error
        return NextResponse.json({ 
          ok: false, 
          error: 'El artículo encontrado no tiene contenido' 
        }, { status: 400 })
      }
    }

    // Determinar las páginas usadas
    const paginas = pagesToAnalyze.map(p => p.num)

    // Generar resumen
    let resumen = ''
    let useFullTextAsSummary = false
    
    // Si el texto es muy corto, usar el texto completo directamente
    if (textoCompleto.trim().length < 20) {
      // Si el texto es muy corto, usar el texto completo directamente
      useFullTextAsSummary = true
      resumen = textoCompleto.trim()
    } else {
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
        
        // Si el error menciona "no tiene suficiente contenido" o similar, usar el texto completo
        const errorMessage = error.message || String(error) || ''
        if (errorMessage.includes('no tiene suficiente contenido') || 
            errorMessage.includes('insufficient content') ||
            errorMessage.includes('suficiente contenido')) {
          useFullTextAsSummary = true
          resumen = textoCompleto.trim()
          logEvent('mentalOutline.article.summary.using_full_text', {
            articulo: articuloNumero,
            reason: 'Error de IA sobre contenido insuficiente',
            textoLength: textoCompleto.length
          })
        } else {
          resumen = ''
        }
      }
    }
    
    // Si el resumen está vacío pero hay texto completo, usar el texto completo como resumen
    if (!resumen && textoCompleto && textoCompleto.trim().length > 0) {
      useFullTextAsSummary = true
      resumen = textoCompleto.trim()
      logEvent('mentalOutline.article.summary.using_full_text', {
        articulo: articuloNumero,
        reason: 'Resumen vacío, usando texto completo',
        textoLength: textoCompleto.length
      })
    }

    // Asegurarse de que siempre haya un resumen si hay texto completo
    if (!resumen && textoCompleto && textoCompleto.trim().length > 0) {
      resumen = textoCompleto.trim()
    }

    return NextResponse.json({
      ok: true,
      numero_articulo: numeroArticulo,
      rubrica_articulo: rubricaArticulo,
      texto_completo: textoCompleto,
      resumen: resumen || textoCompleto || null, // Si no hay resumen, usar texto completo
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
