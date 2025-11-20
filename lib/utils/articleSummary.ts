import { callModelJSON } from '@/lib/qa/callModel'
import { logEvent } from '@/lib/logging/logger'

/**
 * Genera un resumen de un artículo legal usando IA (OpenAI)
 * @param textoCompleto - El texto completo del artículo
 * @param rubricaArticulo - La rúbrica del artículo (opcional)
 * @param numeroArticulo - El número del artículo (opcional)
 * @returns Un resumen conciso y coherente del artículo generado por IA
 */
export async function generateArticleSummaryWithAI(
  textoCompleto: string,
  rubricaArticulo: string = '',
  numeroArticulo: string = ''
): Promise<string> {
  if (!textoCompleto || textoCompleto.trim().length < 20) {
    return ''
  }

  try {
    // Logging del texto completo del artículo
    logEvent('articleSummary.ai.input', {
      numeroArticulo: numeroArticulo,
      rubricaArticulo: rubricaArticulo,
      textoLength: textoCompleto.length,
      textoCompleto: textoCompleto, // Texto completo del artículo
      textoPreview: textoCompleto.substring(0, 500)
    })

    // Construir el prompt para la IA
    const prompt = `Eres un experto en derecho español. Resume de forma clara y coherente el siguiente artículo legal.

${rubricaArticulo ? `Rúbrica: ${rubricaArticulo}\n\n` : ''}${numeroArticulo ? `Artículo ${numeroArticulo}\n\n` : ''}Texto del artículo:

${textoCompleto}

Genera un resumen completo y detallado (máximo 1200 caracteres) que:
1. Sea coherente y bien estructurado
2. Capture TODOS los puntos principales del artículo
3. Incluya los apartados numerados (1., 2., 3., etc.) y sus contenidos principales
4. Incluya las letras (a), b), c), etc.) si son relevantes
5. Use lenguaje claro y preciso
6. Puede perder el formato original si es necesario para mayor claridad

Responde SOLO con un objeto JSON que tenga un campo "resumen" con el texto del resumen. Ejemplo: {"resumen": "Texto del resumen aquí"}`

    // Llamar a la IA para generar el resumen
    const response = await callModelJSON(
      prompt,
      30000, // timeout de 30 segundos
      1500, // max tokens para el resumen (aumentado de 800 a 1500)
      {
        endpoint: 'article-summary-ai',
        numeroArticulo: numeroArticulo,
        textoLength: textoCompleto.length
      }
    )

    // Extraer el resumen de la respuesta JSON
    let resumen = ''
    if (response && typeof response === 'object') {
      // Buscar el campo 'resumen' en la respuesta
      resumen = (response as any).resumen || (response as any).summary || ''
    } else if (typeof response === 'string') {
      // Si es string, intentar parsearlo
      try {
        const parsed = JSON.parse(response)
        resumen = parsed.resumen || parsed.summary || response
      } catch {
        resumen = response
      }
    }

    // Limpiar y validar el resumen
    resumen = resumen.trim()
    if (resumen.length < 20) {
      // Si el resumen es muy corto, puede que haya un problema
      logEvent('articleSummary.ai.short_response', {
        numeroArticulo: numeroArticulo,
        resumenLength: resumen.length,
        response: JSON.stringify(response)
      })
      return ''
    }

    // Limitar longitud si es muy largo (aumentado a 1200 caracteres)
    if (resumen.length > 1200) {
      const ultimoPunto = resumen.lastIndexOf('.', 1200)
      if (ultimoPunto > 600) {
        resumen = resumen.substring(0, ultimoPunto + 1)
      } else {
        const ultimoPuntoComa = resumen.lastIndexOf(';', 1200)
        if (ultimoPuntoComa > 600) {
          resumen = resumen.substring(0, ultimoPuntoComa + 1)
        } else {
          resumen = resumen.substring(0, 1200) + '...'
        }
      }
    }

    logEvent('articleSummary.ai.output', {
      numeroArticulo: numeroArticulo,
      resumenLength: resumen.length,
      resumen: resumen
    })

    return resumen
  } catch (error: any) {
    logEvent('articleSummary.ai.error', {
      numeroArticulo: numeroArticulo,
      error: error.message || String(error),
      textoLength: textoCompleto.length
    })
    console.error('Error generando resumen con IA:', error)
    return ''
  }
}

/**
 * Genera un resumen extractivo de un artículo legal usando algoritmos de procesamiento de texto
 * @param textoCompleto - El texto completo del artículo
 * @param rubricaArticulo - La rúbrica del artículo (opcional)
 * @param numeroArticulo - El número del artículo (opcional)
 * @returns Un resumen conciso del artículo
 */
export async function generateArticleSummary(
  textoCompleto: string,
  rubricaArticulo: string = '',
  numeroArticulo: string = ''
): Promise<string> {
  if (!textoCompleto || textoCompleto.trim().length < 20) {
    return ''
  }

  try {
    // Limpiar y preparar el texto, preservando estructura de apartados
    let textoLimpio = textoCompleto
      .replace(/\n{3,}/g, '\n\n') // Múltiples saltos de línea
      .replace(/\s+/g, ' ') // Espacios múltiples
      .trim()

    // Si el texto es muy corto o parece estar cortado, intentar mejorarlo
    if (textoLimpio.length < 100) {
      // Puede ser que el texto esté mal extraído
      return textoLimpio
    }

    // Para artículos legales, priorizar estructura: apartados, letras, etc.
    // Dividir por apartados primero (1., 2., 3., etc.)
    const apartados = textoLimpio.split(/(?=\d+\.\s)/)
    
    // Si hay apartados estructurados, construir resumen desde ellos
    if (apartados.length > 1 && apartados[0].trim().length < 200) {
      // El primer elemento puede ser la introducción, los demás son apartados
      let resumen = ''
      
      // Añadir la introducción si existe y es relevante
      const introduccion = apartados[0].trim()
      if (introduccion.length > 30 && introduccion.length < 300) {
        resumen += introduccion + ' '
      }
      
      // Añadir el inicio de cada apartado (primeras 2-3 oraciones)
      for (let i = 1; i < Math.min(apartados.length, 4); i++) {
        const apartado = apartados[i].trim()
        if (apartado.length > 20) {
          // Extraer las primeras oraciones del apartado
          const oracionesApartado = apartado
            .split(/(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÑ])/)
            .filter(s => s.trim().length > 10)
            .slice(0, 2) // Primeras 2 oraciones de cada apartado
          
          if (oracionesApartado.length > 0) {
            resumen += oracionesApartado.join(' ') + ' '
          }
        }
        
        // Limitar longitud del resumen
        if (resumen.length > 600) break
      }
      
      if (resumen.trim().length > 50) {
        return resumen.trim()
      }
    }

    // Si no hay estructura de apartados, usar método de oraciones
    const oraciones = textoLimpio
      .split(/(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÑ])/)
      .filter(s => s.trim().length > 10)
      .map(s => s.trim())

    if (oraciones.length === 0) {
      return textoLimpio.substring(0, 500)
    }

    // Si hay muy pocas oraciones, devolver las primeras (hasta 500 caracteres)
    if (oraciones.length <= 3) {
      const resumen = oraciones.join(' ')
      return resumen.length > 500 ? resumen.substring(0, 500) + '...' : resumen
    }

    // Calcular importancia de cada oración usando análisis de frecuencia
    const palabras = textoLimpio.toLowerCase().match(/\b[a-záéíóúüñ]+\b/g) || []
    const frecuenciaPalabras = new Map<string, number>()
    const totalPalabras = palabras.length
    
    palabras.forEach(palabra => {
      frecuenciaPalabras.set(palabra, (frecuenciaPalabras.get(palabra) || 0) + 1)
    })
    
    // Calcular TF (Term Frequency) para palabras importantes
    const palabrasImportantes = Array.from(frecuenciaPalabras.entries())
      .filter(([_, freq]) => freq > 1 && freq < totalPalabras * 0.3) // Evitar palabras muy comunes o muy raras
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([palabra]) => palabra)

    // Palabras clave jurídicas que dan importancia
    const palabrasClaveJuridicas = [
      'artículo', 'dispone', 'establece', 'regula', 'prohibe', 'permite',
      'obligación', 'derecho', 'deber', 'competencia', 'autoridad',
      'procedimiento', 'plazo', 'requisito', 'condición', 'aplicación',
      'sujeto', 'destinatario', 'responsable', 'sancion', 'infracción'
    ]

    // Calcular score para cada oración
    const oracionesConScore = oraciones.map((oracion, idx) => {
      const palabrasOracion = oracion.toLowerCase().match(/\b[a-záéíóúüñ]+\b/g) || []
      let score = 0

      // Priorizar primeras oraciones (suelen ser más importantes)
      score += (oraciones.length - idx) * 0.1

      // Priorizar oraciones con palabras clave jurídicas
      palabrasOracion.forEach(palabra => {
        if (palabrasClaveJuridicas.includes(palabra)) {
          score += 2
        }
        // Priorizar oraciones con palabras importantes (TF)
        if (palabrasImportantes.includes(palabra)) {
          score += 1.5
        }
      })

      // Priorizar oraciones con números (pueden ser artículos, plazos, etc.)
      if (/\d+/.test(oracion)) {
        score += 1
      }

      // Priorizar oraciones de longitud media (ni muy cortas ni muy largas)
      const longitud = oracion.length
      if (longitud >= 50 && longitud <= 200) {
        score += 1
      }

      // Penalizar oraciones muy largas
      if (longitud > 300) {
        score -= 0.5
      }

      return { oracion, score, idx }
    })

    // Ordenar por score y tomar las mejores (más oraciones para artículos largos)
    const numOraciones = Math.min(5, Math.ceil(oraciones.length * 0.5)) // Hasta 5 oraciones o 50% del total
    const mejoresOraciones = oracionesConScore
      .sort((a, b) => b.score - a.score)
      .slice(0, numOraciones)
      .sort((a, b) => a.idx - b.idx) // Mantener orden original
      .map(item => item.oracion)

    // Construir el resumen
    let resumen = mejoresOraciones.join(' ')

    // Si el resumen es muy largo, truncarlo inteligentemente (aumentar límite a 600)
    if (resumen.length > 600) {
      // Intentar cortar en un punto lógico
      const ultimoPunto = resumen.lastIndexOf('.', 600)
      if (ultimoPunto > 300) {
        resumen = resumen.substring(0, ultimoPunto + 1)
      } else {
        // Si no hay punto cercano, buscar punto y coma o dos puntos
        const ultimoPuntoComa = resumen.lastIndexOf(';', 600)
        if (ultimoPuntoComa > 300) {
          resumen = resumen.substring(0, ultimoPuntoComa + 1)
        } else {
          resumen = resumen.substring(0, 600) + '...'
        }
      }
    }

    // Limpiar el resumen final
    resumen = resumen
      .replace(/\s+/g, ' ')
      .replace(/\s+([.!?])/g, '$1')
      .trim()

    // Validar que el resumen tenga sentido
    if (resumen.length < 20 || !/[a-zA-ZáéíóúüñÁÉÍÓÚÜÑ]/.test(resumen)) {
      // Fallback: primera oración
      resumen = oraciones[0]
      if (resumen.length > 300) {
        resumen = resumen.substring(0, 300) + '...'
      }
    }

    return resumen
  } catch (error) {
    // En caso de error, usar método simple de fallback
    console.error('Error generando resumen con node-nlp:', error)
    
    // Fallback: tomar las primeras oraciones
    const oraciones = textoCompleto
      .split(/(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÑ])/)
      .filter(s => s.trim().length > 10)
      .slice(0, 2)
      .map(s => s.trim())
      .join(' ')

    return oraciones.length > 300 ? oraciones.substring(0, 300) + '...' : oraciones
  }
}

