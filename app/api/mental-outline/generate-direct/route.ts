import { NextRequest, NextResponse } from 'next/server'
import { logEvent } from '@/lib/logging/logger'
import { PageEntry } from '@/lib/pdf/pagesMap'

export const runtime = 'nodejs'

// Función para extraer el índice del texto
function extractIndiceFromPages(pages: PageEntry[]): string {
  // Patrón más flexible para buscar "índice" - puede tener espacios, acentos, mayúsculas/minúsculas
  const indiceKeywords = /índice|indice|sumario|tabla\s+de\s+contenido|contents|table\s+of\s+contents/i
  const indicePages: PageEntry[] = []
  let indiceStartPageIndex = -1

  // Buscar en más páginas (hasta página 30 para cubrir índices largos)
  // IMPORTANTE: Buscar desde la primera página del array (índice 0), independientemente del número de página
  // El índice puede estar en las primeras páginas del documento (páginas 1, 2, etc.)
  // Primero buscar páginas con números muy bajos (1-5) que pueden contener el índice
  const pagesToCheck: number[] = []
  
  // Primero añadir todas las páginas con números bajos (1-5) - estas son las más probables para el índice
  for (let i = 0; i < pages.length; i++) {
    if (pages[i].num >= 1 && pages[i].num <= 5) {
      pagesToCheck.push(i)
    }
  }
  
  // Luego añadir las páginas restantes hasta la 30
  for (let i = 0; i < pages.length; i++) {
    if (pages[i].num > 5 && pages[i].num <= 30 && !pagesToCheck.includes(i)) {
      pagesToCheck.push(i)
    }
  }
  
  // Si no encontramos páginas con números bajos, usar todas las páginas disponibles hasta la 15
  if (pagesToCheck.length === 0) {
    for (let i = 0; i < Math.min(pages.length, 15); i++) {
      pagesToCheck.push(i)
    }
  }
  
  for (const i of pagesToCheck) {
    if (i >= pages.length) continue
    const page = pages[i]
    const pageText = String(page.text || '')
    const pageTextLower = pageText.toLowerCase()
    
    // CRÍTICO: Verificar primero si tiene artículos largos (esto es contenido del documento, NO índice)
    // Si tiene artículos con más de 200 caracteres sin punto, es contenido del documento
    const hasLongArticleText = /Art[íi]culo\s+\d+[.\s]*[^.\n]{200,}/i.test(pageText)
    const hasMultipleLongParagraphs = (pageText.match(/\.\s+[A-ZÁÉÍÓÚ][^.]{100,}/g) || []).length > 2
    
    // Si tiene artículos largos o múltiples párrafos largos, NO es índice - rechazar inmediatamente
    if (hasLongArticleText || hasMultipleLongParagraphs) {
      continue
    }
    
    // Verificar si la página tiene formato de índice (aunque no tenga la palabra "índice")
    // El índice típicamente tiene:
    // - Múltiples elementos estructurales (títulos, artículos, capítulos) seguidos de números de página
    // - Muchos puntos separadores O números de página al final de líneas
    // - Entradas cortas (no párrafos largos)
    const structuralElements = (pageText.match(/(?:t[íi]tulo|art[íi]culo|cap[íi]tulo|secci[óo]n|pre[áa]mbulo)\s+/gi) || []).length
    const hasManyDots = /\.{10,}/.test(pageText) || /(?:\.\s*){10,}/.test(pageText)
    
    // También considerar índice si tiene elementos estructurales seguidos de números al final de líneas
    // PERO solo si las líneas son cortas (formato de índice, no contenido completo)
    const hasNumbersAfterElements = pageText.split(/\r?\n/).some(line => {
      const trimmed = line.trim()
      // Línea corta con elemento estructural seguido de número
      return /(?:t[íi]tulo|art[íi]culo|cap[íi]tulo|secci[óo]n|pre[áa]mbulo).*?\d+\s*$/i.test(trimmed) && trimmed.length < 200
    })
    
    // O si tiene elementos estructurales en líneas cortas seguidas de números en líneas separadas
    const hasShortLinesWithNumbers = pageText.split(/\r?\n/).some((line, idx, lines) => {
      const trimmed = line.trim()
      const hasElement = /(?:t[íi]tulo|art[íi]culo|cap[íi]tulo|secci[óo]n|pre[áa]mbulo)/i.test(trimmed)
      const isShort = trimmed.length < 150
      const nextLine = idx < lines.length - 1 ? lines[idx + 1].trim() : ''
      const hasNumberAfter = /^\d+$/.test(nextLine) || /^\d+\s*$/.test(nextLine)
      return hasElement && isShort && hasNumberAfter
    })
    
    // El índice debe tener:
    // 1. Muchos puntos separadores Y elementos estructurales, O
    // 2. Elementos estructurales seguidos de números en líneas cortas, O
    // 3. Elementos estructurales en líneas cortas con números después
    const hasIndiceFormat = (structuralElements >= 3 && hasManyDots) || 
                            (structuralElements >= 3 && hasNumbersAfterElements) ||
                            (structuralElements >= 2 && hasShortLinesWithNumbers)
    
    // Buscar "índice" pero solo si:
    // 1. Está al inicio de la página (primeros 500 caracteres) O
    // 2. Está en una línea propia (rodeado de saltos de línea) O
    // 3. Está seguido de contenido que parece índice (títulos, artículos con números de página)
    const firstPart = pageText.substring(0, 500).toLowerCase()
    const hasIndiceAtStart = indiceKeywords.test(firstPart)
    
    // Verificar si "índice" está en una línea propia (no dentro de un párrafo largo)
    const lines = pageText.split(/\r?\n/)
    const hasIndiceInOwnLine = lines.some(line => {
      const trimmed = line.trim().toLowerCase()
      return indiceKeywords.test(trimmed) && trimmed.length < 100 // Línea corta, probablemente título
    })
    
    // Verificar si después de "índice" hay contenido que parece índice (no artículos largos)
    const indiceMatch = pageTextLower.match(indiceKeywords)
    let hasIndiceKeyword = false
    let hasIndiceFormatAfter = false
    let hasLongArticleAfter = false
    
    if (indiceMatch) {
      hasIndiceKeyword = true
      const indicePos = indiceMatch.index || 0
      const textAfterIndice = pageText.substring(indicePos, indicePos + 1000)
      // Si después de "índice" hay muchos elementos estructurales o puntos, es probablemente índice
      hasIndiceFormatAfter = /(?:t[íi]tulo|art[íi]culo|cap[íi]tulo|secci[óo]n|pre[áa]mbulo).*?\.{3,}/i.test(textAfterIndice) ||
                             (textAfterIndice.match(/(?:t[íi]tulo|art[íi]culo|cap[íi]tulo|secci[óo]n|pre[áa]mbulo)/gi) || []).length >= 3
      
      // Si NO tiene texto largo de artículo después de "índice", probablemente es el índice real
      hasLongArticleAfter = /Art[íi]culo\s+\d+[.\s]*[^.\n]{200,}/i.test(textAfterIndice)
    }
    
    // Detectar índice si:
    // 1. Tiene la palabra "índice" Y tiene formato de índice después, O
    // 2. Tiene formato de índice (muchos elementos estructurales + puntos) Y NO tiene artículos largos
    const isIndicePage = (hasIndiceKeyword && (hasIndiceAtStart || hasIndiceInOwnLine) && (hasIndiceFormatAfter || !hasLongArticleAfter)) ||
                         (hasIndiceFormat && !hasLongArticleText)
    
    if (isIndicePage) {
      indicePages.push(page)
      if (indiceStartPageIndex === -1) {
        indiceStartPageIndex = i // Guardar el índice de la primera página con "índice"
        // Log para depuración
        logEvent('mentalOutline.generate.direct.indice.found', {
          pageNum: page.num,
          pageIndex: i,
          preview: pageText.substring(0, 200),
          hasIndiceKeyword,
          hasIndiceAtStart,
          hasIndiceInOwnLine,
          hasIndiceFormatAfter,
          hasLongArticleAfter,
          hasIndiceFormat,
          structuralElements,
          hasManyDots
        })
      }
    }
  }

  // Si encontramos al menos una página con "índice", empezar a recopilar desde ahí
  if (indiceStartPageIndex >= 0) {
    logEvent('mentalOutline.generate.direct.indice.start', {
      startPageIndex: indiceStartPageIndex,
      startPageNum: pages[indiceStartPageIndex].num,
      totalIndicePages: indicePages.length
    })
    const indiceText: string[] = []
    let lastIndicePageNum = 0
    
    // Empezar desde la primera página que contiene "índice" y continuar hasta encontrar contenido del documento
    // Continuar hasta página 30 o hasta 15 páginas después del inicio del índice
    for (let i = indiceStartPageIndex; i < pages.length && (pages[i].num <= 30 || i < indiceStartPageIndex + 15); i++) {
      const page = pages[i]
      const pageText = String(page.text || '').trim()
      const pageTextLower = pageText.toLowerCase()
      
      // La primera página con "índice" siempre se incluye
      const isFirstIndicePage = i === indiceStartPageIndex
      
      // Detectar si esta página todavía es parte del índice
      // El índice tiene características específicas:
      // - Entradas cortas (título/artículo seguido de número de página)
      // - Muchos puntos separadores o números al final de líneas
      // - NO tiene párrafos largos de texto (eso es contenido del documento)
      
      // Verificar si es contenido del documento (artículos completos con texto extenso)
      // Si hay artículos con párrafos largos, es contenido, no índice
      const hasLongArticleText = /Art[íi]culo\s+\d+[.\s]*[^.\n]{200,}/i.test(pageText) // Artículo seguido de más de 200 caracteres sin punto
      const hasMultipleLongParagraphs = (pageText.match(/\.\s+[A-ZÁÉÍÓÚ][^.]{100,}/g) || []).length > 2 // Múltiples párrafos largos
      
      // Verificar si es contenido principal al inicio de la página
      const isMainContentAtStart = /^(pre[áa]mbulo|exposici[óo]n|t[íi]tulo\s+(preliminar|[ivxlcdm]+|\d+))/i.test(pageText)
      
      // Verificar si la página tiene formato de índice (entradas cortas con números de página)
      // El índice típicamente tiene:
      // - Títulos/artículos seguidos de puntos y número al final
      // - Muchos puntos separadores (continuos o separados)
      // - Entradas cortas (no párrafos largos)
      // - Números de página al final de líneas o en líneas separadas
      const structuralElements = (pageText.match(/(?:t[íi]tulo|art[íi]culo|cap[íi]tulo|secci[óo]n|disposici[óo]n|pre[áa]mbulo)\s+/gi) || []).length
      const hasManyDots = /\.{10,}/.test(pageText) || /(?:\.\s*){10,}/.test(pageText)
      const hasNumbersAfterElements = /(?:t[íi]tulo|art[íi]culo|cap[íi]tulo|secci[óo]n|disposici[óo]n|pre[áa]mbulo).*?\d+\s*$/im.test(pageText)
      const hasShortLinesWithNumbers = pageText.split(/\r?\n/).some((line, idx, lines) => {
        const trimmed = line.trim()
        const hasElement = /(?:t[íi]tulo|art[íi]culo|cap[íi]tulo|secci[óo]n|disposici[óo]n|pre[áa]mbulo)/i.test(trimmed)
        const isShort = trimmed.length < 150
        const nextLine = idx < lines.length - 1 ? lines[idx + 1].trim() : ''
        const hasNumberAfter = /^\d+$/.test(nextLine) || /^\d+\s*$/.test(nextLine)
        return hasElement && isShort && hasNumberAfter
      })
      
      const hasIndiceFormat = (
        // Patrón 1: "Artículo X. Texto corto. . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 15"
        /(?:t[íi]tulo|art[íi]culo|cap[íi]tulo|secci[óo]n|disposici[óo]n|pre[áa]mbulo)\s+[^.\n]{0,150}\.?\s*(?:\.\s*){3,}\d+\s*$/im.test(pageText) ||
        // Patrón 2: "Artículo X. Texto corto...........................................................15"
        /(?:t[íi]tulo|art[íi]culo|cap[íi]tulo|secci[óo]n|disposici[óo]n|pre[áa]mbulo)\s+[^.\n]{0,150}\.?\s*\.{10,}\d+\s*$/im.test(pageText) ||
        // Patrón 3: "Artículo X. Texto corto..........................................................."
        /(?:t[íi]tulo|art[íi]culo|cap[íi]tulo|secci[óo]n|disposici[óo]n|pre[áa]mbulo)\s+[^.\n]{0,150}\.?\s*\.{10,}\s*$/im.test(pageText) ||
        // Patrón 4: Muchos puntos separadores o continuos
        hasManyDots ||
        // Patrón 5: Líneas con elementos estructurales seguidos de números solos en líneas siguientes
        /(?:t[íi]tulo|art[íi]culo|cap[íi]tulo|secci[óo]n|disposici[óo]n|pre[áa]mbulo).*\n\s*\d+\s*$/im.test(pageText) ||
        // Patrón 6: Elementos estructurales seguidos de números al final
        hasNumbersAfterElements ||
        // Patrón 7: Líneas cortas con números después
        hasShortLinesWithNumbers ||
        // Patrón 8: Múltiples elementos estructurales (3+) sin artículos largos
        (structuralElements >= 3 && !hasLongArticleText) ||
        // Patrón 9: Contiene la palabra "índice"
        indiceKeywords.test(pageTextLower)
      )
      
      // Si es la primera página identificada como índice, siempre incluirla
      // (ya fue verificada en la fase de detección)
      if (isFirstIndicePage) {
        indiceText.push(pageText)
        lastIndicePageNum = page.num
        continue
      }
      
      // Si tiene contenido largo de artículo, es contenido del documento, no índice
      // PERO solo rechazar si ya tenemos contenido del índice recopilado
      if ((hasLongArticleText || hasMultipleLongParagraphs) && indiceText.length > 0) {
        // Si ya tenemos contenido del índice, parar aquí
        break
      }
      
      // Si encontramos contenido principal al inicio Y ya tenemos contenido del índice Y no tiene formato de índice, parar
      if (isMainContentAtStart && indiceText.length > 0 && !hasIndiceFormat) {
        break
      }
      
      // Si la página tiene formato de índice, añadirla
      if (hasIndiceFormat) {
        indiceText.push(pageText)
        lastIndicePageNum = page.num
      } else if (page.num === lastIndicePageNum + 1) {
        // Si es la página siguiente consecutiva, verificar si todavía es índice
        // Si tiene formato de índice o muy poco contenido (header/footer), continuar
        if (hasIndiceFormat || pageText.length < 300) {
          indiceText.push(pageText)
          lastIndicePageNum = page.num
        } else if (pageText.length > 500 && !hasIndiceFormat) {
          // Si la página tiene mucho contenido pero no es índice, probablemente es contenido principal
          break
        } else {
          // Contenido intermedio, incluir por si acaso si es consecutiva
          indiceText.push(pageText)
          lastIndicePageNum = page.num
        }
      } else {
        // Si hay un salto de páginas, probablemente el índice terminó
        break
      }
    }
    // Unir todas las páginas del índice
    let fullIndiceText = indiceText.join('\n\n')
    
    // Limpieza final: eliminar encabezados y pies de página que puedan haber quedado
    fullIndiceText = fullIndiceText
      // Eliminar líneas completas que son solo encabezados/pies
      .split(/\r?\n/)
      .filter(line => {
        const trimmed = line.trim()
        // Filtrar líneas que son solo encabezados/pies comunes
        if (!trimmed || trimmed.length === 0) return false
        if (/^BOLET[ÍI]N\s+OFICIAL\s+DEL\s+ESTADO$/i.test(trimmed)) return false
        if (/^LEGISLACI[ÓO]N\s+CONSOLIDADA$/i.test(trimmed)) return false
        if (/^P[áa]gina\s+\d+$/i.test(trimmed)) return false
        if (/^p\.\s*\d+$/i.test(trimmed)) return false
        if (/^\d+\s+LEGISLACI[ÓO]N\s+CONSOLIDADA\s+P[áa]gina$/i.test(trimmed)) return false
        // Filtrar líneas que son solo números de página sueltos
        if (/^\d+$/.test(trimmed) && trimmed.length <= 3) return false
        return true
      })
      .join('\n')
      // Limpiar múltiples espacios y saltos de línea
      .replace(/\n{3,}/g, '\n\n')
      .trim()
    
    logEvent('mentalOutline.generate.direct.indice.extracted', {
      pagesCollected: indiceText.length,
      textLength: fullIndiceText.length,
      preview: fullIndiceText.substring(0, 500)
    })
    
    return fullIndiceText
  }

  // Si no se encontró "índice", log para depuración
  // Revisar las primeras 10 páginas del array para ver qué hay
  const pagesToCheckCount = Math.min(pages.length, 10)
  logEvent('mentalOutline.generate.direct.indice.notfound', {
    pagesChecked: pagesToCheckCount,
    sampleTexts: pages.slice(0, pagesToCheckCount).map(p => ({
      pageNum: p.num,
      pageIndex: pages.indexOf(p),
      preview: String(p.text || '').substring(0, 200).toLowerCase(),
      structuralElements: (String(p.text || '').match(/(?:t[íi]tulo|art[íi]culo|cap[íi]tulo|secci[óo]n|pre[áa]mbulo)\s+/gi) || []).length,
      hasManyDots: /\.{10,}/.test(String(p.text || '')) || /(?:\.\s*){10,}/.test(String(p.text || ''))
    }))
  })

  return ''
}

// Función para dividir el índice en líneas lógicas
function splitIndiceIntoLines(indiceText: string): string[] {
  // Primero intentar dividir por saltos de línea normales
  let lines = indiceText.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0)
  
  // Si solo hay una línea o muy pocas, probablemente todo está junto
  // También verificar si hay muchos elementos en una sola línea (más de 3 títulos/artículos)
  const elementCount = (indiceText.match(/(?:Art[íi]culo|T[ÍI]TULO|CAP[ÍI]TULO|SECCI[ÓO]N|Pre[áa]mbulo|Disposici[óo]n)\s+/gi) || []).length
  if (lines.length <= 3 || elementCount > 3) {
    // Método simple: dividir por elementos estructurales principales
    // NO incluir \d+ solo porque capturaría números en cualquier parte
    const splitPattern = /(?=Art[íi]culo\s+\d+|T[ÍI]TULO\s+|CAP[ÍI]TULO\s+|SECCI[ÓO]N\s+|Pre[áa]mbulo|Disposici[óo]n\s+(?:Adicional|Transitoria|Derogatoria|Final))/i
    lines = indiceText
      .split(splitPattern)
      .map(l => l.trim())
      .filter(l => {
        // Filtrar líneas vacías o que son solo números/puntos
        if (l.length === 0) return false
        if (/^\d+$/.test(l)) return false // Solo números
        if (/^[.\s]+$/.test(l)) return false // Solo puntos y espacios
        // Filtrar líneas que son solo puntos continuos (...................................................)
        if (/^\.{10,}$/.test(l)) return false // Solo puntos continuos (10+ puntos)
        return true
      })
  }
  
  return lines
}

// Función para buscar artículos en el contenido del documento
function findArticulosInPages(
  schema: any,
  pages: PageEntry[],
  titulo: any,
  startPage: number,
  endPage: number
): any[] {
  const articulos: any[] = []
  const articulosMap = new Map<string, any>()
  
  // Buscar todas las páginas en el rango del título/capítulo/sección
  for (const page of pages) {
    if (page.num >= startPage && page.num <= endPage) {
      const pageText = String(page.text || '')
      
      // Buscar todos los artículos en esta página
      // Patrón más completo: "Artículo X" o "Artículo X." seguido de rúbrica y posiblemente contenido
      // El patrón captura: "Artículo X." seguido de la rúbrica (hasta el siguiente artículo, título, capítulo, etc.)
      const lines = pageText.split(/\r?\n/)
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim()
        // Buscar "Artículo X" al inicio de la línea (más estricto)
        // El patrón debe coincidir con "Artículo" seguido de número al inicio de la línea
        const articuloMatch = line.match(/^Art[íi]culo\s+(\d+|[IVXLCDM]+)(?:\s+(?:bis|ter|quater|quinquies|sexies|septies|octies|nonies|decies))?[.\s]*/i)
        
        if (articuloMatch) {
          const numeroArticulo = articuloMatch[1]
          const articuloKey = `Artículo ${numeroArticulo}`
          
          // Si ya existe este artículo, saltarlo (evitar duplicados)
          if (articulosMap.has(articuloKey)) {
            continue
          }
          
          // Extraer rúbrica: solo el texto inmediatamente después de "Artículo X." hasta el primer punto
          // La rúbrica típicamente termina con un punto, y es corta (máximo 200 caracteres)
          // Después de la rúbrica viene el contenido del artículo que empieza con números (1., 2., etc.)
          let rubrica = line.substring(articuloMatch[0].length).trim()
          
          // Si la rúbrica está en la misma línea, extraer hasta el primer punto
          if (rubrica.length > 0) {
            // Buscar hasta el primer punto (fin de rúbrica típico)
            // Pero NO incluir si después del punto viene un número (1., 2., etc.) - eso es contenido del artículo
            const rubricaMatch = rubrica.match(/^([^.]{1,200})\.(?:\s|$)/)
            if (rubricaMatch) {
              rubrica = rubricaMatch[1].trim()
            } else {
              // Si no hay punto en la línea, verificar si termina con punto y espacio seguido de número
              const hasNumberAfter = rubrica.match(/\.\s*(\d+[.)]|$)/)
              if (hasNumberAfter) {
                // Hay un número después del punto, la rúbrica termina antes del punto
                const beforePoint = rubrica.split(/\./)[0]
                rubrica = beforePoint.trim()
              } else {
                // Tomar solo los primeros 200 caracteres si no hay punto claro
                rubrica = rubrica.substring(0, 200).trim()
              }
            }
          }
          
          // Si la rúbrica está vacía o es muy corta, buscar en la siguiente línea (máximo 1 línea adicional)
          if (rubrica.length < 5 && i + 1 < lines.length) {
            const nextLine = lines[i + 1].trim()
            // Si encontramos otro artículo, título, capítulo, etc., parar (no hay rúbrica)
            if (/^(Art[íi]culo|T[ÍI]TULO|CAP[ÍI]TULO|SECCI[ÓO]N|Disposici[óo]n)/i.test(nextLine)) {
              rubrica = ''
            } else if (/^\d+[.)]\s/.test(nextLine)) {
              // Si la siguiente línea empieza con un número (1., 2., etc.), es contenido del artículo, no rúbrica
              rubrica = ''
            } else {
              // Extraer hasta el primer punto, máximo 200 caracteres
              const rubricaMatch = nextLine.match(/^([^.]{1,200})\.(?:\s|$)/)
              if (rubricaMatch && rubricaMatch[1].trim().length > 0) {
                rubrica = rubricaMatch[1].trim()
              } else {
                // Si no hay punto claro, tomar hasta 200 caracteres pero parar si hay número después
                const beforeNumber = nextLine.match(/^([^0-9]{1,200})(?:\d|$)/)
                if (beforeNumber) {
                  rubrica = beforeNumber[1].trim()
                }
              }
            }
          }
          
          // Limpiar rúbrica de posibles headers/footers y espacios extra
          rubrica = rubrica
            .replace(/BOLET[ÍI]N\s+OFICIAL\s+DEL\s+ESTADO/gi, '')
            .replace(/LEGISLACI[ÓO]N\s+CONSOLIDADA/gi, '')
            .replace(/P[áa]gina\s*\d*/gi, '')
            .replace(/p\.\s*\d*/gi, '')
            .replace(/\s+/g, ' ') // Normalizar espacios múltiples
            .trim()
          
          // Si después de limpiar queda muy corta o vacía, dejar vacío
          if (rubrica.length < 3) {
            rubrica = ''
          }
          
          articulosMap.set(articuloKey, {
            numero_articulo: articuloKey,
            rubrica_articulo: rubrica,
            pagina_inicio_articulo: page.num,
            pagina_fin_articulo: page.num
          })
        }
      }
    }
  }
  
  // Convertir map a array y ordenar por número
  const articulosArray = Array.from(articulosMap.values())
  articulosArray.sort((a, b) => {
    const numA = parseInt(a.numero_articulo.replace(/\D/g, '')) || 0
    const numB = parseInt(b.numero_articulo.replace(/\D/g, '')) || 0
    return numA - numB
  })
  
  return articulosArray
}

// Función para enriquecer el esquema con artículos encontrados en el contenido
function enrichSchemaWithArticulos(schema: any, pages: PageEntry[]): void {
  // Para cada título
  for (let tituloIdx = 0; tituloIdx < schema.titulos.length; tituloIdx++) {
    const titulo = schema.titulos[tituloIdx]
    const tituloStartPage = titulo.pagina_inicio_titulo || 0
    // Calcular página de fin: usar la página de inicio del siguiente título, o asumir un rango razonable
    let tituloEndPage = titulo.pagina_fin_titulo
    if (!tituloEndPage || tituloEndPage === 0) {
      if (tituloIdx < schema.titulos.length - 1) {
        const nextTitulo = schema.titulos[tituloIdx + 1]
        tituloEndPage = (nextTitulo.pagina_inicio_titulo || tituloStartPage) - 1
      } else {
        // Último título: usar la última página disponible
        const maxPage = Math.max(...pages.map(p => p.num), tituloStartPage + 100)
        tituloEndPage = maxPage
      }
    }
    
    // Si el título tiene capítulos
    if (titulo.capitulos && titulo.capitulos.length > 0) {
      for (let capIdx = 0; capIdx < titulo.capitulos.length; capIdx++) {
        const capitulo = titulo.capitulos[capIdx]
        const capStartPage = capitulo.pagina_inicio_capitulo || tituloStartPage
        // Calcular página de fin del capítulo
        let capEndPage = capitulo.pagina_fin_capitulo
        if (!capEndPage || capEndPage === 0) {
          if (capIdx < titulo.capitulos.length - 1) {
            const nextCapitulo = titulo.capitulos[capIdx + 1]
            capEndPage = (nextCapitulo.pagina_inicio_capitulo || capStartPage) - 1
          } else {
            capEndPage = tituloEndPage
          }
        }
        
        // Si el capítulo tiene secciones
        if (capitulo.secciones && capitulo.secciones.length > 0) {
          for (let secIdx = 0; secIdx < capitulo.secciones.length; secIdx++) {
            const seccion = capitulo.secciones[secIdx]
            const secStartPage = seccion.pagina_inicio_seccion || capStartPage
            // Calcular página de fin de la sección
            let secEndPage = seccion.pagina_fin_seccion
            if (!secEndPage || secEndPage === 0) {
              if (secIdx < capitulo.secciones.length - 1) {
                const nextSeccion = capitulo.secciones[secIdx + 1]
                secEndPage = (nextSeccion.pagina_inicio_seccion || secStartPage) - 1
              } else {
                secEndPage = capEndPage
              }
            }
            
            // Buscar artículos en el rango de la sección
            const articulos = findArticulosInPages(schema, pages, titulo, secStartPage, secEndPage)
            if (articulos.length > 0) {
              seccion.articulos = articulos
            }
          }
        }
        
        // Buscar artículos sin sección en el rango del capítulo
        const articulosSinSeccion = findArticulosInPages(schema, pages, titulo, capStartPage, capEndPage)
        // Excluir artículos que ya están en secciones
        if (capitulo.secciones && capitulo.secciones.length > 0) {
          const articulosEnSecciones = capitulo.secciones.flatMap((s: any) => s.articulos || [])
          const numerosEnSecciones = new Set(articulosEnSecciones.map((a: any) => a.numero_articulo))
          capitulo.articulos_sin_seccion = articulosSinSeccion.filter(a => !numerosEnSecciones.has(a.numero_articulo))
        } else {
          capitulo.articulos_sin_seccion = articulosSinSeccion
        }
      }
    }
    
    // Buscar artículos sin capítulo en el rango del título
    // Si el título tiene capítulos, buscar artículos:
    // 1. Antes del primer capítulo (desde inicio del título hasta inicio del primer capítulo)
    // 2. Después del último capítulo (desde fin del último capítulo hasta fin del título)
    let articulosSinCapitulo: any[] = []
    
    if (titulo.capitulos && titulo.capitulos.length > 0) {
      const firstCapitulo = titulo.capitulos[0]
      const lastCapitulo = titulo.capitulos[titulo.capitulos.length - 1]
      const firstCapStartPage = firstCapitulo.pagina_inicio_capitulo || tituloStartPage
      const lastCapEndPage = lastCapitulo.pagina_fin_capitulo || tituloEndPage
      
      // Buscar artículos antes del primer capítulo
      if (firstCapStartPage > tituloStartPage) {
        const articulosAntes = findArticulosInPages(schema, pages, titulo, tituloStartPage, firstCapStartPage - 1)
        articulosSinCapitulo.push(...articulosAntes)
      }
      
      // Buscar artículos después del último capítulo
      if (lastCapEndPage < tituloEndPage) {
        const articulosDespues = findArticulosInPages(schema, pages, titulo, lastCapEndPage + 1, tituloEndPage)
        articulosSinCapitulo.push(...articulosDespues)
      }
      
      // Excluir artículos que ya están en capítulos
      const articulosEnCapitulos = titulo.capitulos.flatMap((cap: any) => {
        const enSecciones = (cap.secciones || []).flatMap((s: any) => s.articulos || [])
        const sinSeccion = cap.articulos_sin_seccion || []
        return [...enSecciones, ...sinSeccion]
      })
      const numerosEnCapitulos = new Set(articulosEnCapitulos.map((a: any) => a.numero_articulo))
      articulosSinCapitulo = articulosSinCapitulo.filter(a => !numerosEnCapitulos.has(a.numero_articulo))
    } else {
      // Si no hay capítulos, buscar en todo el rango del título
      articulosSinCapitulo = findArticulosInPages(schema, pages, titulo, tituloStartPage, tituloEndPage)
    }
    
    // Eliminar duplicados por número de artículo
    const articulosUnicos = new Map<string, any>()
    for (const art of articulosSinCapitulo) {
      if (!articulosUnicos.has(art.numero_articulo)) {
        articulosUnicos.set(art.numero_articulo, art)
      }
    }
    titulo.articulos_sin_capitulo = Array.from(articulosUnicos.values())
  }
}

// Función para parsear el índice y generar el esquema mental
// Formato del índice: "TÍTULO I. Disposiciones generales................................................... 15"
function parseIndiceToSchema(indiceText: string, source: string, lawName: string, pages?: PageEntry[]): any {
  // Dividir en líneas - cada línea es un elemento
  const lines = splitIndiceIntoLines(indiceText)
  
  const schema: any = {
    metadata: {
      document_title: source || lawName,
      source: source || lawName,
      language: 'es',
      generated_at: new Date().toISOString().split('T')[0]
    },
    front_matter: {
      preambulo: {
        present: false,
        anchor: null,
        pages: null
      },
      exposicion_motivos: {
        present: false,
        anchor: null,
        pages: null
      }
    },
    titulos: [],
    disposiciones: {
      adicionales: [],
      transitorias: [],
      derogatorias: [],
      finales: []
    }
  }

  // Patrones para detectar elementos (sin ^ para permitir espacios/puntos antes)
  const preambuloPattern = /Pre[áa]mbulo/i
  const tituloPattern = /T[ÍI]TULO\s+(PRELIMINAR|[IVXLCDM]+|\d+)/i
  const capituloPattern = /CAP[ÍI]TULO\s+(PRELIMINAR|PRIMERO|SEGUNDO|TERCERO|CUARTO|QUINTO|SEXTO|SÉPTIMO|OCTAVO|NOVENO|DÉCIMO|[IVXLCDM]+|\d+)/i
  const seccionPattern = /SECCI[ÓO]N\s+(\d+\.?\s*[ªº]|\d+|[IVXLCDM]+)/i
  const articuloPattern = /Art[íi]culo\s+(\d+|[IVXLCDM]+)(?:\s+(?:bis|ter|quater|quinquies|sexies|septies|octies|nonies|decies))?/i
  const disposicionPattern = /Disposici[óo]n\s+(Adicional|Transitoria|Derogatoria|Final)/i

  // Patrón para extraer página: número después de puntos separadores
  const pagePattern = /(?:\.\s*){3,}(\d+)\s*$|\.{10,}(\d+)\s*$/

  let currentTitulo: any = null
  let currentCapitulo: any = null
  let currentSeccion: any = null
  let debugLog: string[] = []

  for (let i = 0; i < lines.length; i++) {
    let originalLine = lines[i].trim()
    let line = originalLine
    
    // Saltar líneas vacías o que son solo headers/footers
    if (!line || line.length === 0) continue
    if (/^BOLET[ÍI]N\s+OFICIAL|^LEGISLACI[ÓO]N\s+CONSOLIDADA|^P[áa]gina/i.test(line)) continue
    
    // Extraer página: puede estar en la misma línea o en la siguiente
    let page: number | null = null
    
    // Primero intentar encontrar el número en la misma línea (después de puntos separadores)
    const pageMatch = line.match(pagePattern)
    if (pageMatch) {
      page = parseInt(pageMatch[1] || pageMatch[2])
      // Eliminar puntos separadores y página de la línea
      line = line.replace(pagePattern, '').trim()
    } else {
      // Buscar número al final de la línea después de puntos separadores (patrón más flexible)
      // Ejemplo: "texto . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 12"
      const pageAtEndMatch = line.match(/(?:\.\s*){3,}(\d+)\s*$|\.{10,}(\d+)\s*$/)
      if (pageAtEndMatch) {
        page = parseInt(pageAtEndMatch[1] || pageAtEndMatch[2])
        // Eliminar puntos separadores y página de la línea
        line = line.replace(/(?:\.\s*){3,}\d+\s*$|\.{10,}\d+\s*$/, '').trim()
      } else if ((/\.{3,}\s*$/.test(line) || /(?:\.\s*){3,}\s*$/.test(line)) && i + 1 < lines.length) {
        // Si no está en la misma línea, verificar si la línea termina con puntos
        // y la siguiente línea es solo un número
        const nextLine = lines[i + 1].trim()
        if (/^\d+$/.test(nextLine)) {
          page = parseInt(nextLine)
          // Eliminar los puntos separadores del final de la línea actual
          line = line.replace(/\.{3,}\s*$/, '').replace(/(?:\.\s*){3,}\s*$/, '').trim()
          // Marcar la siguiente línea para saltarla
          lines[i + 1] = ''
        }
      }
    }
    
    // Limpiar headers/footers que puedan quedar
    line = line
      .replace(/BOLET[ÍI]N\s+OFICIAL\s+DEL\s+ESTADO/gi, '')
      .replace(/LEGISLACI[ÓO]N\s+CONSOLIDADA/gi, '')
      .replace(/P[áa]gina\s*\d*/gi, '')
      .replace(/p\.\s*\d*/gi, '')
      // Eliminar puntos separadores que puedan quedar al final
      .replace(/\.{3,}\s*$/, '')
      .replace(/(?:\.\s*){3,}\s*$/, '')
      .trim()
    
    // Si la línea quedó vacía después de limpiar, saltarla
    if (!line || line.length === 0) continue

    // PREÁMBULO
    if (preambuloPattern.test(line)) {
      schema.front_matter.preambulo.present = true
      schema.front_matter.preambulo.pages = page ? [page] : []
      debugLog.push(`Línea ${i}: PREÁMBULO detectado, página: ${page}`)
      continue
    }

    // TÍTULO
    if (tituloPattern.test(line)) {
      const match = line.match(tituloPattern)
      if (match) {
        // Extraer subtítulo: quitar el patrón del título y limpiar
        let subtitulo = line.replace(tituloPattern, '').trim()
        // Limpiar puntos separadores, números de página y espacios
        subtitulo = subtitulo
          .replace(/^[—–\-•:.\s]+/, '') // Quitar al inicio
          .replace(/[—–\-•:.\s]+$/, '') // Quitar al final
          .replace(/(?:\.\s*){3,}\d*\s*$/, '') // Quitar puntos separadores con número al final
          .replace(/\.{10,}\d*\s*$/, '') // Quitar puntos continuos con número al final
          .replace(/\d+\s*$/, '') // Quitar número suelto al final (página)
          .replace(/(?:\.\s*){3,}/g, ' ') // Reemplazar puntos separadores en medio por espacio
          .replace(/\.{3,}/g, ' ') // Reemplazar puntos continuos por espacio
          .replace(/\s+/g, ' ') // Normalizar espacios múltiples
          .trim()
        
        currentTitulo = {
          codigo_titulo: match[0].toUpperCase().trim(),
          subtitulo_titulo: subtitulo,
          pagina_inicio_titulo: page || 0,
          pagina_fin_titulo: 0,
          articulos_sin_capitulo: [],
          capitulos: []
        }
        schema.titulos.push(currentTitulo)
        currentCapitulo = null
        currentSeccion = null
        debugLog.push(`Línea ${i}: TÍTULO detectado: ${currentTitulo.codigo_titulo}, subtítulo: "${subtitulo}", página: ${page}`)
      }
      continue
    }

    // CAPÍTULO
    if (capituloPattern.test(line)) {
      const match = line.match(capituloPattern)
      if (match && currentTitulo) {
        // Extraer subtítulo: quitar el patrón del capítulo y limpiar
        let subtitulo = line.replace(capituloPattern, '').trim()
        // Limpiar puntos separadores, números de página y espacios
        subtitulo = subtitulo
          .replace(/^[—–\-•:.\s]+/, '') // Quitar al inicio
          .replace(/[—–\-•:.\s]+$/, '') // Quitar al final
          .replace(/(?:\.\s*){3,}\d*\s*$/, '') // Quitar puntos separadores con número al final
          .replace(/\.{10,}\d*\s*$/, '') // Quitar puntos continuos con número al final
          .replace(/\d+\s*$/, '') // Quitar número suelto al final (página)
          .replace(/(?:\.\s*){3,}/g, ' ') // Reemplazar puntos separadores en medio por espacio
          .replace(/\.{3,}/g, ' ') // Reemplazar puntos continuos por espacio
          .replace(/\s+/g, ' ') // Normalizar espacios múltiples
          .trim()
        
        currentCapitulo = {
          codigo_capitulo: match[0].toUpperCase().trim(),
          subtitulo_capitulo: subtitulo,
          pagina_inicio_capitulo: page || 0,
          pagina_fin_capitulo: 0,
          articulos_sin_seccion: [],
          secciones: []
        }
        if (!currentTitulo.capitulos) {
          currentTitulo.capitulos = []
        }
        currentTitulo.capitulos.push(currentCapitulo)
        currentSeccion = null
        debugLog.push(`Línea ${i}: CAPÍTULO detectado: ${currentCapitulo.codigo_capitulo}, subtítulo: "${subtitulo}", página: ${page}, título: ${currentTitulo.codigo_titulo}`)
      } else if (match && !currentTitulo) {
        debugLog.push(`Línea ${i}: ERROR - CAPÍTULO ${match[0]} detectado pero NO hay currentTitulo`)
      }
      continue
    }

    // SECCIÓN
    if (seccionPattern.test(line)) {
      const match = line.match(seccionPattern)
      if (match && (currentCapitulo || currentTitulo)) {
        let codigoCompleto = match[0].trim()
        if (match[1] && /[ªº]/.test(match[1])) {
          codigoCompleto = `SECCIÓN ${match[1].trim()}`
        }
        
        // Extraer subtítulo: quitar el patrón de la sección y limpiar
        let subtitulo = line.replace(seccionPattern, '').trim()
        // Limpiar puntos separadores, números de página y espacios
        subtitulo = subtitulo
          .replace(/^[—–\-•:.\s]+/, '') // Quitar al inicio
          .replace(/[—–\-•:.\s]+$/, '') // Quitar al final
          .replace(/(?:\.\s*){3,}\d*\s*$/, '') // Quitar puntos separadores con número al final
          .replace(/\.{10,}\d*\s*$/, '') // Quitar puntos continuos con número al final
          .replace(/\d+\s*$/, '') // Quitar número suelto al final (página)
          .replace(/(?:\.\s*){3,}/g, ' ') // Reemplazar puntos separadores en medio por espacio
          .replace(/\.{3,}/g, ' ') // Reemplazar puntos continuos por espacio
          .replace(/\s+/g, ' ') // Normalizar espacios múltiples
          .trim()
        
        currentSeccion = {
          codigo_seccion: codigoCompleto.toUpperCase(),
          subtitulo_seccion: subtitulo,
          pagina_inicio_seccion: page || 0,
          pagina_fin_seccion: 0,
          articulos: []
        }
        
        if (currentCapitulo) {
          if (!currentCapitulo.secciones) {
            currentCapitulo.secciones = []
          }
          currentCapitulo.secciones.push(currentSeccion)
          debugLog.push(`Línea ${i}: SECCIÓN detectada: ${currentSeccion.codigo_seccion}, subtítulo: "${subtitulo}", página: ${page}, capítulo: ${currentCapitulo.codigo_capitulo}, título: ${currentTitulo?.codigo_titulo || 'NULL'}`)
        } else if (currentTitulo) {
          // Crear capítulo temporal si no existe
          if (!currentTitulo.capitulos) {
            currentTitulo.capitulos = []
          }
          currentCapitulo = {
            codigo_capitulo: 'CAPÍTULO TEMPORAL',
            subtitulo_capitulo: '',
            pagina_inicio_capitulo: page || 0,
            pagina_fin_capitulo: 0,
            articulos_sin_seccion: [],
            secciones: []
          }
          currentTitulo.capitulos.push(currentCapitulo)
          currentCapitulo.secciones.push(currentSeccion)
          debugLog.push(`Línea ${i}: SECCIÓN detectada (capítulo temporal): ${currentSeccion.codigo_seccion}, subtítulo: "${subtitulo}", página: ${page}, título: ${currentTitulo.codigo_titulo}`)
        } else {
          debugLog.push(`Línea ${i}: ERROR - SECCIÓN ${codigoCompleto} detectada pero NO hay currentTitulo ni currentCapitulo`)
        }
      }
      continue
    }

    // ARTÍCULO
    const articuloMatch = line.match(articuloPattern)
    if (articuloMatch) {
      // Log para eventos (no console.log)
      const debugInfo: string[] = []
      debugInfo.push(`Línea ${i}: Artículo detectado: ${articuloMatch[0]}, currentTitulo: ${currentTitulo ? currentTitulo.codigo_titulo : 'NULL'}`)
      
      if (!currentTitulo) {
        // Debug: artículo sin título - añadir al debug log
        debugLog.push(`ERROR Línea ${i}: Artículo ${articuloMatch[0]} detectado pero NO hay currentTitulo. Línea original: ${originalLine.substring(0, 80)}`)
        continue
      }
      
      const numeroCompleto = articuloMatch[0].trim()
      // La rúbrica es todo lo que queda después de "Artículo X."
      // Primero quitar el patrón del artículo, luego limpiar
      let rubrica = line.replace(articuloPattern, '').trim()
      // Limpiar puntos separadores, números de página y espacios (igual que para títulos/capítulos/secciones)
      rubrica = rubrica
        .replace(/^[—–\-•:.\s]+/, '') // Quitar al inicio
        .replace(/[—–\-•:.\s]+$/, '') // Quitar al final
        .replace(/(?:\.\s*){3,}\d*\s*$/, '') // Quitar puntos separadores con número al final
        .replace(/\.{10,}\d*\s*$/, '') // Quitar puntos continuos con número al final
        .replace(/\d+\s*$/, '') // Quitar número suelto al final (página)
        .replace(/(?:\.\s*){3,}/g, ' ') // Reemplazar puntos separadores en medio por espacio
        .replace(/\.{3,}/g, ' ') // Reemplazar puntos continuos por espacio
        .replace(/\s+/g, ' ') // Normalizar espacios múltiples
        .trim()

      const articulo = {
        numero_articulo: numeroCompleto.replace(/\.$/, '').trim(),
        rubrica_articulo: rubrica,
        pagina_inicio_articulo: page || 0,
        pagina_fin_articulo: 0
      }

      // Asignar según jerarquía: sección > capítulo > título
      if (currentSeccion) {
        if (!currentSeccion.articulos) {
          currentSeccion.articulos = []
        }
        currentSeccion.articulos.push(articulo)
        debugInfo.push(`→ Añadido a sección ${currentSeccion.codigo_seccion} del título ${currentTitulo.codigo_titulo}`)
      } else if (currentCapitulo) {
        if (!currentCapitulo.articulos_sin_seccion) {
          currentCapitulo.articulos_sin_seccion = []
        }
        currentCapitulo.articulos_sin_seccion.push(articulo)
        debugInfo.push(`→ Añadido a capítulo ${currentCapitulo.codigo_capitulo} del título ${currentTitulo.codigo_titulo}`)
      } else {
        if (!currentTitulo.articulos_sin_capitulo) {
          currentTitulo.articulos_sin_capitulo = []
        }
        currentTitulo.articulos_sin_capitulo.push(articulo)
        debugInfo.push(`→ Añadido directamente al título ${currentTitulo.codigo_titulo}`)
      }
      
      // Añadir al debug log
      debugLog.push(debugInfo.join(' '))
      continue
    }

    // DISPOSICIÓN
    if (disposicionPattern.test(line)) {
      const match = line.match(disposicionPattern)
      if (match) {
        const tipo = match[1].toLowerCase()
        const tipoKey = tipo === 'adicional' ? 'adicionales' :
                       tipo === 'transitoria' ? 'transitorias' :
                       tipo === 'derogatoria' ? 'derogatorias' : 'finales'
        
        const textoEncabezado = line.replace(disposicionPattern, '').trim().replace(/^[—–\-•:.\s]+/, '').replace(/[—–\-•:.\s]+$/, '')
        
        schema.disposiciones[tipoKey].push({
          numero_disposicion: `Disposición ${match[1]}`.trim(),
          texto_encabezado: textoEncabezado,
          pagina_inicio_disposicion: page || 0,
          pagina_fin_disposicion: 0
        })
      }
      continue
    }
  }

  // Guardar debug log en el schema temporalmente para logging
  ;(schema as any).__debugLog = debugLog

  // Calcular pagina_fin para cada elemento
  for (let i = 0; i < schema.titulos.length; i++) {
    const titulo = schema.titulos[i]
    const nextTitulo = schema.titulos[i + 1]
    titulo.pagina_fin_titulo = nextTitulo ? nextTitulo.pagina_inicio_titulo - 1 : 0

    // Capítulos
    if (titulo.capitulos && titulo.capitulos.length > 0) {
      for (let j = 0; j < titulo.capitulos.length; j++) {
        const cap = titulo.capitulos[j]
        const nextCap = titulo.capitulos[j + 1]
        cap.pagina_fin_capitulo = nextCap ? nextCap.pagina_inicio_capitulo - 1 : titulo.pagina_fin_titulo

        // Secciones
        if (cap.secciones && cap.secciones.length > 0) {
          for (let k = 0; k < cap.secciones.length; k++) {
            const sec = cap.secciones[k]
            const nextSec = cap.secciones[k + 1]
            sec.pagina_fin_seccion = nextSec ? nextSec.pagina_inicio_seccion - 1 : cap.pagina_fin_capitulo

            // Artículos en secciones
            if (sec.articulos && sec.articulos.length > 0) {
              for (let l = 0; l < sec.articulos.length; l++) {
                const art = sec.articulos[l]
                const nextArt = sec.articulos[l + 1]
                art.pagina_fin_articulo = nextArt ? nextArt.pagina_inicio_articulo - 1 : sec.pagina_fin_seccion
              }
            }
          }
        }

        // Artículos sin sección
        if (cap.articulos_sin_seccion && cap.articulos_sin_seccion.length > 0) {
          for (let l = 0; l < cap.articulos_sin_seccion.length; l++) {
            const art = cap.articulos_sin_seccion[l]
            const nextArt = cap.articulos_sin_seccion[l + 1]
            const firstSec = cap.secciones && cap.secciones.length > 0 ? cap.secciones[0] : null
            art.pagina_fin_articulo = nextArt ? nextArt.pagina_inicio_articulo - 1 :
                                     firstSec ? firstSec.pagina_inicio_seccion - 1 :
                                     cap.pagina_fin_capitulo
          }
        }
      }
    }

    // Artículos sin capítulo
    if (titulo.articulos_sin_capitulo && titulo.articulos_sin_capitulo.length > 0) {
      for (let l = 0; l < titulo.articulos_sin_capitulo.length; l++) {
        const art = titulo.articulos_sin_capitulo[l]
        const nextArt = titulo.articulos_sin_capitulo[l + 1]
        const firstCap = titulo.capitulos && titulo.capitulos.length > 0 ? titulo.capitulos[0] : null
        art.pagina_fin_articulo = nextArt ? nextArt.pagina_inicio_articulo - 1 :
                                 firstCap ? firstCap.pagina_inicio_capitulo - 1 :
                                 titulo.pagina_fin_titulo
      }
    }
  }

  return schema
}

// Función para transformar el esquema al formato del frontend (igual que en chunk)
function transformOutlineToFrontendFormat(outline: any, source: string, lawName: string): any {
  if (!outline || typeof outline !== 'object') return outline

  // Extraer ordinal de código (ej: "TÍTULO I" -> "I", "Artículo 1" -> "1")
  const extractOrdinal = (codigo: string): string => {
    if (!codigo || typeof codigo !== 'string') return '?'
    
    // Para títulos, capítulos, secciones: buscar después de la palabra clave
    const tituloMatch = codigo.match(/T[ÍI]TULO\s+(PRELIMINAR|[IVXLCDM]+|\d+)/i)
    if (tituloMatch) return tituloMatch[1].toUpperCase()
    
    const capituloMatch = codigo.match(/CAP[ÍI]TULO\s+(PRELIMINAR|PRIMERO|SEGUNDO|TERCERO|CUARTO|QUINTO|SEXTO|SÉPTIMO|OCTAVO|NOVENO|DÉCIMO|[IVXLCDM]+|\d+)/i)
    if (capituloMatch) {
      const ord = capituloMatch[1] ? capituloMatch[1].toUpperCase() : '?'
      // Convertir palabras ordinales a números romanos
      if (/PRELIMINAR/i.test(ord)) return 'PRELIMINAR'
      if (/PRIMERO/i.test(ord)) return 'I'
      if (/SEGUNDO/i.test(ord)) return 'II'
      if (/TERCERO/i.test(ord)) return 'III'
      if (/CUARTO/i.test(ord)) return 'IV'
      if (/QUINTO/i.test(ord)) return 'V'
      if (/SEXTO/i.test(ord)) return 'VI'
      if (/SÉPTIMO/i.test(ord)) return 'VII'
      if (/OCTAVO/i.test(ord)) return 'VIII'
      if (/NOVENO/i.test(ord)) return 'IX'
      if (/DÉCIMO/i.test(ord)) return 'X'
      // Si es un número romano válido, verificar que no sea "C" solo (que podría ser un error de OCR)
      // "C" en números romanos es 100, pero en capítulos normalmente no se usa
      // Si encontramos "C" solo, podría ser un error y debería ser "IV" (cuarto)
      if (ord === 'C') return 'IV' // Corrección: C probablemente es IV mal leído
      return ord
    }
    
    const seccionMatch = codigo.match(/SECCI[ÓO]N\s+(PRELIMINAR|[IVXLCDM]+|\d+|[PRIMERA|SEGUNDA|TERCERA|CUARTA|QUINTA|SEXTA|SÉPTIMA|OCTAVA|NOVENA|DÉCIMA]+)/i)
    if (seccionMatch) {
      const ord = seccionMatch[1] ? seccionMatch[1].toUpperCase() : '?'
      if (/PRIMERA|PRIMERO|1/i.test(ord)) return 'I'
      if (/SEGUNDA|SEGUNDO|2/i.test(ord)) return 'II'
      if (/TERCERA|TERCERO|3/i.test(ord)) return 'III'
      if (/CUARTA|CUARTO|4/i.test(ord)) return 'IV'
      if (/QUINTA|QUINTO|5/i.test(ord)) return 'V'
      return ord
    }
    
    // Para artículos: extraer el número
    const articuloMatch = codigo.match(/Art[íi]culo\s+(\d+)(?:\s|\.|$)/i)
    if (articuloMatch) return articuloMatch[1]
    
    // Para disposiciones: extraer el número/ordinal
    // Primero buscar palabras ordinales, luego números
    const disposicionOrdinalMatch = codigo.match(/(primera|segunda|tercera|cuarta|quinta|sexta|séptima|octava|novena|décima)/i)
    if (disposicionOrdinalMatch) {
      const ord = disposicionOrdinalMatch[1].toUpperCase()
      if (/PRIMERA|PRIMERO/i.test(ord)) return '1'
      if (/SEGUNDA|SEGUNDO/i.test(ord)) return '2'
      if (/TERCERA|TERCERO/i.test(ord)) return '3'
      if (/CUARTA|CUARTO/i.test(ord)) return '4'
      if (/QUINTA|QUINTO/i.test(ord)) return '5'
      if (/SEXTA|SEXTO/i.test(ord)) return '6'
      if (/SÉPTIMA|SÉPTIMO/i.test(ord)) return '7'
      if (/OCTAVA|OCTAVO/i.test(ord)) return '8'
      if (/NOVENA|NOVENO/i.test(ord)) return '9'
      if (/DÉCIMA|DÉCIMO/i.test(ord)) return '10'
      return ord
    }
    // Si no hay palabra ordinal, buscar número
    const disposicionNumMatch = codigo.match(/(\d+)/)
    if (disposicionNumMatch) {
      return disposicionNumMatch[1]
    }
    
    // Fallback: buscar cualquier número romano o número al final
    const fallbackMatch = codigo.match(/(PRELIMINAR|[IVXLCDM]+|\d+)$/i)
    return fallbackMatch && fallbackMatch[1] ? fallbackMatch[1].toUpperCase() : '?'
  }

  // Generar anchor simple
  const generateAnchor = (prefix: string, ordinal: string): string => {
    if (!ordinal || ordinal === '?') return `${prefix}-unknown`
    return `${prefix}-${ordinal.toLowerCase()}`
  }

  // Solo usar la página de inicio (la que aparece en el índice del PDF)
  const pagesFromInicio = (inicio: number): number[] => {
    if (!inicio || inicio <= 0) return []
    return [inicio] // Solo la página de inicio
  }

  // Preservar front_matter del modelo
  const transformed: any = {
    metadata: outline.metadata || {
      document_title: source || lawName,
      source: source || lawName,
      language: 'es',
      generated_at: new Date().toISOString().split('T')[0]
    },
    front_matter: {
      preambulo: outline.front_matter?.preambulo || { present: false, anchor: null, pages: null },
      exposicion_motivos: outline.front_matter?.exposicion_motivos || { present: false, anchor: null, pages: null }
    },
    titulos: [],
    disposiciones: {
      adicionales: [],
      transitorias: [],
      derogatorias: [],
      finales: []
    }
  }
  
  // Asegurar que si el preambulo tiene pages, se preserve como array
  if (transformed.front_matter.preambulo?.pages && !Array.isArray(transformed.front_matter.preambulo.pages)) {
    const pageNum = Number(transformed.front_matter.preambulo.pages)
    if (!isNaN(pageNum) && pageNum > 0) {
      transformed.front_matter.preambulo.pages = [pageNum]
    }
  }

  // Transformar títulos
  if (Array.isArray(outline.titulos)) {
    transformed.titulos = outline.titulos.map((titulo: any) => {
      const ordinal = extractOrdinal(titulo.codigo_titulo || '')
      const titulo_texto = titulo.subtitulo_titulo || ''
      const pages = pagesFromInicio(titulo.pagina_inicio_titulo)

      // Transformar artículos sin capítulo
      const articulos = (titulo.articulos_sin_capitulo || []).map((art: any) => {
        const numeroArticulo = art.numero_articulo || art.numero || '?'
        // Extraer solo el número (sin "Artículo")
        const numero = typeof numeroArticulo === 'string' 
          ? numeroArticulo.replace(/^Art[íi]culo\s+/i, '').trim() 
          : numeroArticulo
        return {
          numero: numero,
          articulo_texto: art.rubrica_articulo || art.articulo_texto || '',
          texto_completo: art.texto_articulo || art.texto_completo || null,
          pagina_articulo: art.pagina_inicio_articulo || art.pagina_articulo || 0,
          pages: pagesFromInicio(art.pagina_inicio_articulo),
          anchor: generateAnchor('art', extractOrdinal(numeroArticulo))
        }
      })

      // Transformar capítulos
      const capitulos = (titulo.capitulos || []).map((cap: any) => {
        const capOrdinal = extractOrdinal(cap.codigo_capitulo || '')
        const capPages = pagesFromInicio(cap.pagina_inicio_capitulo)

        // Transformar artículos sin sección
        const capArticulos = (cap.articulos_sin_seccion || []).map((art: any) => {
          const numeroArticulo = art.numero_articulo || art.numero || '?'
          // Extraer solo el número (sin "Artículo")
          const numero = typeof numeroArticulo === 'string' 
            ? numeroArticulo.replace(/^Art[íi]culo\s+/i, '').trim() 
            : numeroArticulo
          return {
            numero: numero,
            articulo_texto: art.rubrica_articulo || art.articulo_texto || '',
            texto_completo: art.texto_articulo || art.texto_completo || null,
            pagina_articulo: art.pagina_inicio_articulo || art.pagina_articulo || 0,
            pages: pagesFromInicio(art.pagina_inicio_articulo),
            anchor: generateAnchor('art', extractOrdinal(numeroArticulo))
          }
        })

        // Transformar secciones
        const secciones = (cap.secciones || []).map((sec: any) => {
          const secOrdinal = extractOrdinal(sec.codigo_seccion || '')
          const secPages = pagesFromInicio(sec.pagina_inicio_seccion)

          const secArticulos = (sec.articulos || []).map((art: any) => {
            const numeroArticulo = art.numero_articulo || art.numero || '?'
            // Extraer solo el número (sin "Artículo")
            const numero = typeof numeroArticulo === 'string' 
              ? numeroArticulo.replace(/^Art[íi]culo\s+/i, '').trim() 
              : numeroArticulo
            return {
              numero: numero,
              articulo_texto: art.rubrica_articulo || art.articulo_texto || '',
              texto_completo: art.texto_articulo || art.texto_completo || null,
              pagina_articulo: art.pagina_inicio_articulo || art.pagina_articulo || 0,
              pages: pagesFromInicio(art.pagina_inicio_articulo),
              anchor: generateAnchor('art', extractOrdinal(numeroArticulo))
            }
          })

          return {
            ordinal: secOrdinal,
            seccion_texto: sec.subtitulo_seccion || '',
            pagina_inicio_seccion: sec.pagina_inicio_seccion || 0,
            pagina_fin_seccion: sec.pagina_fin_seccion || 0,
            pages: secPages,
            anchor: generateAnchor('sec', secOrdinal),
            articulos: secArticulos
          }
        })

        return {
          ordinal: capOrdinal,
          capitulo_texto: cap.subtitulo_capitulo || '',
          pagina_inicio_capitulo: cap.pagina_inicio_capitulo || 0,
          pagina_fin_capitulo: cap.pagina_fin_capitulo || 0,
          pages: capPages,
          anchor: generateAnchor('cap', capOrdinal),
          articulos: capArticulos,
          secciones: secciones
        }
      })

      return {
        ordinal: ordinal,
        titulo_texto: titulo_texto,
        pagina_inicio_titulo: titulo.pagina_inicio_titulo || 0,
        pagina_fin_titulo: titulo.pagina_fin_titulo || 0,
        pages: pages,
        anchor: generateAnchor('tit', ordinal),
        articulos: articulos,
        capitulos: capitulos
      }
    })
  }

  // Transformar disposiciones
  if (outline.disposiciones && typeof outline.disposiciones === 'object') {
    const transformDisposiciones = (items: any[]) => {
      return (items || []).map((dis: any) => ({
        numero: dis.numero_disposicion || dis.numero || '?',
        texto_encabezado: dis.texto_encabezado || '',
        pagina_disposicion: dis.pagina_inicio_disposicion || dis.pagina_disposicion || 0,
        pages: pagesFromInicio(dis.pagina_inicio_disposicion),
        anchor: generateAnchor('dis', extractOrdinal(dis.numero_disposicion || dis.numero || ''))
      }))
    }

    transformed.disposiciones = {
      adicionales: transformDisposiciones(outline.disposiciones.adicionales || []),
      transitorias: transformDisposiciones(outline.disposiciones.transitorias || []),
      derogatorias: transformDisposiciones(outline.disposiciones.derogatorias || []),
      finales: transformDisposiciones(outline.disposiciones.finales || [])
    }
  }

  return transformed
}

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json()
    const source = typeof payload?.source === 'string' ? payload.source : ''
    const lawName = typeof payload?.lawName === 'string' ? payload.lawName : ''
    const pagesFull = Array.isArray(payload?.pagesFull) ? payload.pagesFull : []

    if (!pagesFull.length) {
      return NextResponse.json({ ok: false, error: 'pagesFull requerido' }, { status: 400 })
    }

    const normalizedPages: PageEntry[] = pagesFull.map((entry: any, idx: number) => ({
      num: typeof entry?.num === 'number' ? entry.num : idx + 1,
      text: typeof entry?.text === 'string' ? entry.text : '',
    }))

    logEvent('mentalOutline.generate.direct', {
      source: source || lawName,
      totalPages: normalizedPages.length
    })

    // Extraer índice
    const indiceText = extractIndiceFromPages(normalizedPages)
    
    if (!indiceText || indiceText.trim().length === 0) {
      return NextResponse.json({ 
        ok: false, 
        error: 'No se pudo encontrar el índice en las primeras páginas del documento' 
      }, { status: 400 })
    }

    // Debug: mostrar el índice completo extraído
    const linesDivided = splitIndiceIntoLines(indiceText)
    
    // Debug: contar artículos por título ANTES de parsear
    const articulosPorTituloAntes: any = {}
    let currentTituloAntes = ''
    for (const line of linesDivided) {
      if (/^T[ÍI]TULO\s+/i.test(line.trim())) {
        const match = line.match(/T[ÍI]TULO\s+(PRELIMINAR|[IVXLCDM]+|\d+)/i)
        if (match) {
          currentTituloAntes = match[0].toUpperCase().trim()
          if (!articulosPorTituloAntes[currentTituloAntes]) {
            articulosPorTituloAntes[currentTituloAntes] = []
          }
        }
      } else if (/Art[íi]culo\s+\d+/i.test(line) && currentTituloAntes) {
        const match = line.match(/Art[íi]culo\s+(\d+)/i)
        if (match) {
          articulosPorTituloAntes[currentTituloAntes].push(match[1])
        }
      }
    }
    
    logEvent('mentalOutline.generate.direct.indice.parsing', {
      indiceLength: indiceText.length,
      totalLines: linesDivided.length,
      indiceFullText: indiceText.substring(0, 5000), // Primeros 5000 caracteres
      linesSample: linesDivided.slice(0, 50), // Primeras 50 líneas
      linesWithArticulo: linesDivided.filter(l => /Art[íi]culo/i.test(l)).slice(0, 20), // Primeras 20 líneas con "Artículo"
      articulosPorTituloAntes: articulosPorTituloAntes
    })
    
    // Parsear índice y generar esquema
    const schema = parseIndiceToSchema(indiceText, source, lawName, normalizedPages)
    
    // TEMPORALMENTE DESHABILITADO: Buscar artículos en el contenido del documento si no están en el índice
    // El índice puede no listar todos los artículos individuales (como en la Constitución)
    // enrichSchemaWithArticulos(schema, normalizedPages)

    // Debug: contar líneas que contienen "Artículo" (usar las líneas divididas correctamente)
    const linesWithArticulo = linesDivided.filter(l => /Art[íi]culo/i.test(l))
    
    // Debug: ver qué artículos se detectaron en el parsing
    const articulosEnSchema: any[] = []
    schema.titulos.forEach((t: any) => {
      if (t.articulos_sin_capitulo) articulosEnSchema.push(...t.articulos_sin_capitulo)
      if (t.capitulos) {
        t.capitulos.forEach((cap: any) => {
          if (cap.articulos_sin_seccion) articulosEnSchema.push(...cap.articulos_sin_seccion)
          if (cap.secciones) {
            cap.secciones.forEach((sec: any) => {
              if (sec.articulos) articulosEnSchema.push(...sec.articulos)
            })
          }
        })
      }
    })

    // Calcular total de artículos
    const totalArticulos = articulosEnSchema.length
    
    // Limpiar debug log del schema antes de devolver
    const debugLog = (schema as any).__debugLog || []
    delete (schema as any).__debugLog

    logEvent('mentalOutline.generate.direct.success', {
      source: source || lawName,
      titulos: schema.titulos.length,
      totalArticulos: totalArticulos,
      indiceLength: indiceText.length,
      linesWithArticulo: linesWithArticulo.length,
      articulosEnSchema: articulosEnSchema.length,
      primerosArticulos: articulosEnSchema.slice(0, 5).map((a: any) => a.numero_articulo),
      indicePreview: indiceText.substring(0, 1000),
      articulosDetectados: linesWithArticulo.slice(0, 10), // Primeras 10 líneas con "Artículo"
      debugLog: debugLog.slice(0, 30), // Primeros 30 mensajes de debug
      sampleLines: linesDivided.slice(0, 20), // Primeras 20 líneas divididas
      totalSecciones: schema.titulos.reduce((acc: number, t: any) => {
        return acc + (t.capitulos || []).reduce((capAcc: number, cap: any) => {
          return capAcc + (cap.secciones || []).length
        }, 0)
      }, 0),
      totalCapitulos: schema.titulos.reduce((acc: number, t: any) => acc + (t.capitulos || []).length, 0),
      estructuraDetectada: schema.titulos.map((t: any) => ({
        titulo: t.codigo_titulo,
        capitulos: (t.capitulos || []).length,
        secciones: (t.capitulos || []).reduce((acc: number, cap: any) => acc + (cap.secciones || []).length, 0),
        articulos: (t.articulos_sin_capitulo || []).length + (t.capitulos || []).reduce((acc: number, cap: any) => {
          return acc + (cap.articulos_sin_seccion || []).length + (cap.secciones || []).reduce((secAcc: number, sec: any) => secAcc + (sec.articulos || []).length, 0)
        }, 0)
      }))
    })

    // Transformar el esquema al formato del frontend (igual que en chunk)
    const transformedSchema = transformOutlineToFrontendFormat(schema, source, lawName)

    // Debug: verificar artículos después de transformación
    const articulosTransformados = transformedSchema.titulos.reduce((acc: number, t: any) => {
      return acc + (t.articulos || []).length + (t.capitulos || []).reduce((capAcc: number, cap: any) => {
        return capAcc + (cap.articulos || []).length + (cap.secciones || []).reduce((secAcc: number, sec: any) => {
          return secAcc + (sec.articulos || []).length
        }, 0)
      }, 0)
    }, 0)
    
    // Debug detallado: ver artículos por título
    const articulosPorTitulo = transformedSchema.titulos.map((t: any) => ({
      titulo: t.ordinal,
      articulosDirectos: (t.articulos || []).length,
      articulosEnCapitulos: (t.capitulos || []).reduce((acc: number, cap: any) => {
        return acc + (cap.articulos || []).length + (cap.secciones || []).reduce((secAcc: number, sec: any) => {
          return secAcc + (sec.articulos || []).length
        }, 0)
      }, 0),
      primerosArticulos: (t.articulos || []).slice(0, 3).map((a: any) => `${a.numero}: ${a.articulo_texto?.substring(0, 30) || 'SIN TEXTO'}`)
    }))
    
    logEvent('mentalOutline.generate.direct.transform', {
      articulosAntes: articulosEnSchema.length,
      articulosDespues: articulosTransformados,
      articulosPorTitulo: articulosPorTitulo,
      primerosArticulosTransformados: transformedSchema.titulos.flatMap((t: any) => 
        (t.articulos || []).slice(0, 3).map((a: any) => `${a.numero}: ${a.articulo_texto?.substring(0, 30)}`)
      )
    })

    return NextResponse.json({
      ok: true,
      schema: transformedSchema,
      indice: indiceText
    })
  } catch (error: any) {
    logEvent('mentalOutline.generate.direct.error', {
      error: error.message || String(error),
      stack: error.stack
    })
    return NextResponse.json(
      { ok: false, error: error.message || 'Error generando esquema mental' },
      { status: 500 }
    )
  }
}

