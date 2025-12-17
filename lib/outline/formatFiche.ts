import type { ArticleContext } from './getArticleContext'

export type FicheData = {
  lawName: string
  context: ArticleContext | null
  articleNumber: string
  articleRubrica: string
  articleText: string
}

/**
 * Formatea el texto del artículo para mejorar su legibilidad
 * Añade saltos de línea antes de apartados numerados y letras
 */
function formatArticleText(text: string): string[] {
  if (!text || !text.trim()) return []

  // Normalizar el texto: eliminar líneas vacías y números solos, unir líneas continuas
  let texto = text.trim()
  
  // Eliminar líneas que sean solo números (1, 2, 3, etc.)
  const lineasOriginales = texto.split('\n')
  const lineasFiltradas = lineasOriginales.filter(l => {
    const trimmed = l.trim()
    if (trimmed.length === 0) return false
    if (/^\d+$/.test(trimmed)) return false
    return true
  })
  
  // Unir todas las líneas continuas en un solo texto (reemplazar saltos simples por espacios)
  texto = lineasFiltradas.map(l => l.trim()).join(' ').trim()
  
  // Normalizar espacios múltiples
  texto = texto.replace(/\s+/g, ' ')
  
  if (!texto || texto.length === 0) return []
  
  // Detectar apartados numerados (1., 2., 3., etc.)
  // IMPORTANTE: Solo detectar si está al inicio de un párrafo, no cuando es parte de una referencia
  // Ejemplo: "artículo 3." NO debe marcar inicio de párrafo, pero "3. Texto" SÍ debe
  const apartadoPattern = /\b(\d+)\.\s+/g
  const matches: Array<{ index: number; numero: string; type: 'apartado' | 'letra' }> = []
<<<<<<< HEAD
  let matchApartado: RegExpExecArray | null

  while ((matchApartado = apartadoPattern.exec(texto)) !== null) {
    const matchIndex = matchApartado.index
    const numeroMatch = matchApartado[1]
=======
  let match: RegExpExecArray | null
  
  while ((match = apartadoPattern.exec(texto)) !== null) {
    const matchIndex = match.index
    const numeroMatch = match[1]
>>>>>>> feature/nonlegal-outline
    
    // Verificar que NO sea parte de una referencia como "artículo 3.", "apartado 2.", etc.
    // Buscar hacia atrás para ver si hay palabras que indiquen una referencia
    // Buscar en un rango más amplio (hasta 100 caracteres) para capturar referencias con saltos de línea
    const contextStart = Math.max(0, matchIndex - 100)
    const beforeMatch = texto.substring(contextStart, matchIndex)
    // Normalizar espacios y saltos de línea para la búsqueda
    const beforeMatchNormalized = beforeMatch.replace(/\s+/g, ' ').toLowerCase()
    
    // Verificar que NO esté precedido por palabras de referencia seguidas del mismo número
    // Buscar patrones como "artículo 3", "apartado 2", etc. (con espacios normalizados)
    // El número debe coincidir exactamente con el número encontrado
    const palabrasReferencia = [
      'artículo', 'art', 'apartado', 'párrafo', 'parrafo', 'inciso', 
      'numeral', 'punto', 'reglamento', 'ley', 'decreto', 'orden', 
      'resolución', 'resolucion', 'disposición', 'disposicion'
    ]
    
    // Buscar si alguna palabra de referencia está seguida del mismo número
    let esReferencia = false
    for (const palabra of palabrasReferencia) {
      // Buscar patrones como "artículo 3", "del artículo 3", "en el artículo 3", etc.
      const patrones = [
        new RegExp(`\\b${palabra}\\s+${numeroMatch}\\.?\\s*$`, 'i'),
        new RegExp(`\\bdel\\s+${palabra}\\s+${numeroMatch}\\.?\\s*$`, 'i'),
        new RegExp(`\\ben\\s+el\\s+${palabra}\\s+${numeroMatch}\\.?\\s*$`, 'i'),
        new RegExp(`\\bde\\s+la\\s+${palabra}\\s+${numeroMatch}\\.?\\s*$`, 'i'),
        new RegExp(`\\bde\\s+el\\s+${palabra}\\s+${numeroMatch}\\.?\\s*$`, 'i'),
      ]
      
      if (patrones.some(patron => patron.test(beforeMatchNormalized))) {
        esReferencia = true
        break
      }
    }
    
    // También verificar que esté al inicio de párrafo (después de punto, dos puntos, punto y coma, o inicio de texto)
    // Buscar los últimos 3 caracteres antes del match para ver si hay un delimitador
    const charsBefore = matchIndex > 0 ? texto.substring(Math.max(0, matchIndex - 3), matchIndex) : ''
    const estaAlInicio = matchIndex === 0 || 
                        /[\s\.:;]\s*$/.test(charsBefore) ||
                        /^[\s\.:;]/.test(charsBefore)
    
    // Solo añadir si NO es una referencia Y está al inicio de párrafo
    if (!esReferencia && estaAlInicio) {
      matches.push({
        index: matchIndex,
        numero: numeroMatch,
        type: 'apartado'
      })
    }
  }
  
  // Detectar letras (a), b), c), etc.)
  const letraPattern = /\b([a-z])\)\s+/gi
  let matchLetra: RegExpExecArray | null
  while ((matchLetra = letraPattern.exec(texto)) !== null) {
    // Solo añadir si no está ya en matches (evitar duplicados)
<<<<<<< HEAD
    const yaExiste = matches.some((m) => Math.abs(m.index - (matchLetra?.index ?? 0)) < 5)
=======
    const yaExiste = matches.some((m) => Math.abs(m.index - (match?.index ?? 0)) < 5)
>>>>>>> feature/nonlegal-outline
    if (!yaExiste) {
      matches.push({
        index: matchLetra.index,
        numero: matchLetra[1],
        type: 'letra'
      })
    }
  }
  
  // Ordenar matches por índice
  matches.sort((a, b) => a.index - b.index)
  
  // Si no hay apartados ni letras, devolver el texto como un solo párrafo continuo
  if (matches.length === 0) {
    return [texto]
  }
  
  // Dividir el texto en partes basándose en los apartados/letras
  const partes: string[] = []
  let inicio = 0
  
  for (const m of matches) {
    // Añadir el texto antes del apartado/letra
    if (m.index > inicio) {
      const antes = texto.substring(inicio, m.index).trim()
      if (antes.length > 0) {
        partes.push(antes)
      }
    }
    
    // Encontrar el final del apartado/letra actual
    let fin = texto.length
    const siguienteMatch = matches.find(mm => mm.index > m.index)
    if (siguienteMatch) {
      fin = siguienteMatch.index
    }
    
    // Extraer el apartado/letra completo
    const apartadoCompleto = texto.substring(m.index, fin).trim()
    if (apartadoCompleto.length > 0) {
      partes.push(apartadoCompleto)
    }
    
    inicio = fin
  }
  
  // Añadir el texto final si queda algo
  if (inicio < texto.length) {
    const final = texto.substring(inicio).trim()
    if (final.length > 0) {
      partes.push(final)
    }
  }
  
  return partes.length > 0 ? partes : [texto]
}

/**
 * Formatea una ficha de artículo con el formato especificado
 * @param data - Datos de la ficha
 * @returns Texto formateado de la ficha
 */
export function formatFiche(data: FicheData): string {
  const { lawName, context, articleNumber, articleRubrica, articleText } = data

  const lines: string[] = []

  // Encabezado mejorado
  lines.push('═══════════════════════════════════════════════════════════')
  lines.push('                    FICHA DE ARTÍCULO')
  lines.push('═══════════════════════════════════════════════════════════')
  lines.push('')

  // Documento
  lines.push(`📄 Documento: ${lawName || '—'}`)
  lines.push('')

  // Contexto jerárquico con mejor formato
  if (context) {
    const contextLines: string[] = []
    
    if (context.titulo) {
      const tituloText = context.titulo.codigo || 
                        (context.titulo.ordinal ? `TÍTULO ${context.titulo.ordinal}` : 'TÍTULO')
      const tituloSubtitle = context.titulo.subtitulo ? ` - ${context.titulo.subtitulo}` : ''
      contextLines.push(`📑 ${tituloText}${tituloSubtitle}`)
    }

    if (context.capitulo) {
      const capituloText = context.capitulo.codigo || 
                          (context.capitulo.ordinal ? `CAPÍTULO ${context.capitulo.ordinal}` : 'CAPÍTULO')
      const capituloSubtitle = context.capitulo.subtitulo ? ` - ${context.capitulo.subtitulo}` : ''
      contextLines.push(`📖 ${capituloText}${capituloSubtitle}`)
    }

    if (context.seccion) {
      const seccionText = context.seccion.codigo || 
                         (context.seccion.ordinal ? `SECCIÓN ${context.seccion.ordinal}` : 'SECCIÓN')
      const seccionSubtitle = context.seccion.subtitulo ? ` - ${context.seccion.subtitulo}` : ''
      contextLines.push(`📋 ${seccionText}${seccionSubtitle}`)
    }
    
    if (contextLines.length > 0) {
      lines.push('Estructura:')
      contextLines.forEach(line => lines.push(`  ${line}`))
      lines.push('')
    }
  }

  lines.push('───────────────────────────────────────────────────────────')
  lines.push('')

  // Artículo con formato mejorado
  // Normalizar articleNumber: si ya incluye "Artículo", no duplicarlo
  let numeroArticulo = articleNumber.trim()
  if (numeroArticulo.toLowerCase().startsWith('artículo')) {
    // Ya incluye "Artículo", usarlo tal cual
    lines.push(`📌 ${numeroArticulo}`)
  } else {
    // No incluye "Artículo", añadirlo
    lines.push(`📌 Artículo ${numeroArticulo}`)
  }
  
  lines.push('')
  lines.push('───────────────────────────────────────────────────────────')
  lines.push('')
  lines.push('Texto del artículo:')
  lines.push('')

  // Función simple para formatear el texto del artículo
  // Usa el texto completo y respeta los \n como saltos de línea
  // Elimina la rúbrica del inicio si coincide con el title
  if (articleText) {
    let textoFormateado = articleText.trim()
    
    // Si hay rúbrica, eliminar del inicio del texto si coincide
    if (articleRubrica) {
      const rubricaNormalizada = articleRubrica.trim()
      
      // Normalizar espacios para comparar
      const rubricaSinEspacios = rubricaNormalizada.replace(/\s+/g, ' ').toLowerCase()
      const textoSinEspacios = textoFormateado.replace(/\s+/g, ' ').toLowerCase()
      
      // Construir el patrón completo: "Artículo X. Rúbrica."
      const articuloConRubrica = `Artículo ${articleNumber}. ${rubricaNormalizada}`
      const articuloConRubricaSinEspacios = articuloConRubrica.replace(/\s+/g, ' ').toLowerCase()
      
      // Si el texto empieza con "Artículo X. Rúbrica", eliminarlo
      if (textoSinEspacios.startsWith(articuloConRubricaSinEspacios)) {
        // Buscar el patrón en el texto original (case-sensitive)
        const index = textoFormateado.toLowerCase().indexOf(articuloConRubrica.toLowerCase())
        if (index === 0) {
          // Eliminar desde el inicio hasta después de la rúbrica
          let endIndex = articuloConRubrica.length
          // Si hay punto o dos puntos después, incluirlos
          if (endIndex < textoFormateado.length && 
              (textoFormateado[endIndex] === '.' || textoFormateado[endIndex] === ':')) {
            endIndex++
          }
          // Saltar espacios y saltos de línea
          while (endIndex < textoFormateado.length && 
                 (textoFormateado[endIndex] === ' ' || textoFormateado[endIndex] === '\n')) {
            endIndex++
          }
          textoFormateado = textoFormateado.substring(endIndex).trim()
        }
      } else if (textoSinEspacios.startsWith(rubricaSinEspacios)) {
        // Si solo empieza con la rúbrica (sin "Artículo X."), también eliminarla
        const index = textoFormateado.toLowerCase().indexOf(rubricaNormalizada.toLowerCase())
        if (index === 0 || (index > 0 && /^Artículo\s+\d+\.\s*$/i.test(textoFormateado.substring(0, index).trim()))) {
          let endIndex = index + rubricaNormalizada.length
          // Si hay punto o dos puntos después, incluirlos
          if (endIndex < textoFormateado.length && 
              (textoFormateado[endIndex] === '.' || textoFormateado[endIndex] === ':')) {
            endIndex++
          }
          // Saltar espacios y saltos de línea
          while (endIndex < textoFormateado.length && 
                 (textoFormateado[endIndex] === ' ' || textoFormateado[endIndex] === '\n')) {
            endIndex++
          }
          textoFormateado = textoFormateado.substring(endIndex).trim()
        }
      }
    }
    
    // Dividir por \n y añadir cada línea respetando los saltos de línea
    const lineasTexto = textoFormateado.split('\n')
    
    for (const linea of lineasTexto) {
      const lineaTrimmed = linea.trim()
      if (lineaTrimmed.length > 0) {
        lines.push(lineaTrimmed)
      } else {
        // Si la línea está vacía, mantener un salto de línea solo si no es el inicio
        if (lines.length > 0 && lines[lines.length - 1] !== '') {
          lines.push('')
        }
      }
    }
  } else if (articleRubrica) {
    // Si no hay texto pero hay rúbrica, mostrar la rúbrica
    lines.push(articleRubrica.trim())
  } else {
    lines.push('(Texto no disponible)')
  }

  lines.push('')
  lines.push('───────────────────────────────────────────────────────────')
  lines.push('')

  return lines.join('\n')
}

