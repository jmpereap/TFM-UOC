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
  const apartadoPattern = /\b(\d+)\.\s+/g
  const matches: Array<{ index: number; numero: string; type: 'apartado' }> = []
  let match
  
  while ((match = apartadoPattern.exec(texto)) !== null) {
    matches.push({
      index: match.index,
      numero: match[1],
      type: 'apartado'
    })
  }
  
  // Detectar letras (a), b), c), etc.)
  const letraPattern = /\b([a-z])\)\s+/gi
  while ((match = letraPattern.exec(texto)) !== null) {
    // Solo añadir si no está ya en matches (evitar duplicados)
    const yaExiste = matches.some(m => Math.abs(m.index - match.index) < 5)
    if (!yaExiste) {
      matches.push({
        index: match.index,
        numero: match[1],
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
  lines.push(`📌 Artículo ${articleNumber}`)
  
  // Normalizar rúbrica y texto para comparar
  const rubricaNormalizada = articleRubrica ? articleRubrica.trim() : ''
  const textoNormalizado = articleText ? articleText.trim() : ''
  
  // Si la rúbrica y el texto completo son iguales (o muy similares), no duplicar
  const rubricaSinEspacios = rubricaNormalizada.replace(/\s+/g, ' ')
  const textoSinEspacios = textoNormalizado.replace(/\s+/g, ' ')
  const sonIguales = rubricaSinEspacios === textoSinEspacios || 
                     (rubricaSinEspacios.length > 0 && textoSinEspacios.startsWith(rubricaSinEspacios))
  
  // Si hay rúbrica y NO es igual al texto completo, mostrarla por separado
  if (rubricaNormalizada && !sonIguales) {
    lines.push('')
    lines.push('Rúbrica:')
    lines.push(`  ${rubricaNormalizada}`)
  }
  
  lines.push('')
  lines.push('───────────────────────────────────────────────────────────')
  lines.push('')
  lines.push('Texto del artículo:')
  lines.push('')

  // Texto completo del artículo - formateado con mejor espaciado
  if (textoNormalizado) {
    const formattedLines = formatArticleText(textoNormalizado)
    
    // Añadir todas las líneas formateadas con espaciado mejorado
    if (formattedLines.length > 0) {
      for (let i = 0; i < formattedLines.length; i++) {
        const line = formattedLines[i]
        const trimmed = line.trim()
        
        if (trimmed.length === 0) continue
        
        // Detectar si es un apartado numerado o letra
        const isApartado = /^\d+\.\s/.test(trimmed)
        const isLetra = /^[a-z]\)\s/i.test(trimmed)
        
        // Solo añadir línea vacía antes de apartados (no antes de letras ni párrafos continuos)
        if (isApartado && i > 0) {
          // Verificar que la línea anterior no esté vacía
          const prevLine = formattedLines[i - 1]?.trim() || ''
          if (prevLine.length > 0) {
            lines.push('')
          }
        }
        
        lines.push(trimmed)
        
        // Solo añadir línea vacía después de apartados si el siguiente no es letra
        if (isApartado && i < formattedLines.length - 1) {
          const nextLine = formattedLines[i + 1]?.trim() || ''
          if (!/^[a-z]\)\s/i.test(nextLine) && nextLine.length > 0) {
            lines.push('')
          }
        }
      }
    } else {
      // Si no hay líneas formateadas, mostrar el texto tal cual (sin saltos innecesarios)
      lines.push(textoNormalizado.replace(/\n+/g, ' ').trim())
    }
  } else if (rubricaNormalizada && sonIguales) {
    // Si no hay texto pero hay rúbrica (y son iguales), mostrar la rúbrica como texto
    lines.push(rubricaNormalizada)
  } else {
    lines.push('(Texto no disponible)')
  }

  lines.push('')
  lines.push('───────────────────────────────────────────────────────────')
  lines.push('')

  return lines.join('\n')
}

