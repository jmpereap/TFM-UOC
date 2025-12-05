export type FicheDispositionData = {
  lawName: string
  dispositionNumber: string
  dispositionRubrica: string
  dispositionText: string
  dispositionType: 'adicionales' | 'transitorias' | 'derogatorias' | 'finales'
}

/**
 * Formatea una ficha de disposición con el formato especificado
 * @param data - Datos de la ficha
 * @returns Texto formateado de la ficha
 */
export function formatFicheDisposition(data: FicheDispositionData): string {
  const { lawName, dispositionNumber, dispositionRubrica, dispositionText, dispositionType } = data

  const lines: string[] = []

  // Encabezado
  lines.push('═══════════════════════════════════════════════════════════')
  lines.push('                  FICHA DE DISPOSICIÓN')
  lines.push('═══════════════════════════════════════════════════════════')
  lines.push('')

  // Documento
  lines.push(`📄 Documento: ${lawName || '—'}`)
  lines.push('')

  lines.push('───────────────────────────────────────────────────────────')
  lines.push('')

  // Disposición con formato mejorado
  const tipoLabel = dispositionType === 'adicionales' ? 'Adicional' : 
                    dispositionType === 'transitorias' ? 'Transitoria' : 
                    dispositionType === 'derogatorias' ? 'Derogatoria' : 'Final'
  
  let numeroDisposicion = dispositionNumber.trim()
  if (numeroDisposicion && numeroDisposicion !== '(sin número)') {
    // Si ya incluye "Disposición", no duplicarlo
    if (numeroDisposicion.toLowerCase().startsWith('disposición')) {
      lines.push(`📌 ${numeroDisposicion}`)
    } else {
      lines.push(`📌 Disposición ${tipoLabel} ${numeroDisposicion}`)
    }
  } else {
    lines.push(`📌 Disposición ${tipoLabel}`)
  }
  
  lines.push('')
  lines.push('───────────────────────────────────────────────────────────')
  lines.push('')
  lines.push('Texto de la disposición:')
  lines.push('')

  // Formatear el texto de la disposición
  if (dispositionText) {
    let textoFormateado = dispositionText.trim()
    
    // Si hay rúbrica, eliminar del inicio del texto si coincide
    if (dispositionRubrica) {
      const rubricaNormalizada = dispositionRubrica.trim()
      const rubricaSinEspacios = rubricaNormalizada.replace(/\s+/g, ' ').toLowerCase()
      const textoSinEspacios = textoFormateado.replace(/\s+/g, ' ').toLowerCase()
      
      // Construir el patrón completo: "Disposición [Tipo] [Número]. Rúbrica."
      const disposicionConRubrica = numeroDisposicion && numeroDisposicion !== '(sin número)'
        ? `Disposición ${tipoLabel} ${numeroDisposicion}. ${rubricaNormalizada}`
        : `Disposición ${tipoLabel}. ${rubricaNormalizada}`
      const disposicionConRubricaSinEspacios = disposicionConRubrica.replace(/\s+/g, ' ').toLowerCase()
      
      // Si el texto empieza con "Disposición [Tipo] [Número]. Rúbrica", eliminarlo
      if (textoSinEspacios.startsWith(disposicionConRubricaSinEspacios)) {
        const index = textoFormateado.toLowerCase().indexOf(disposicionConRubrica.toLowerCase())
        if (index === 0) {
          let endIndex = disposicionConRubrica.length
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
        // Si solo empieza con la rúbrica, también eliminarla
        const index = textoFormateado.toLowerCase().indexOf(rubricaNormalizada.toLowerCase())
        if (index === 0 || (index > 0 && /^Disposici[óo]n\s+(Adicional|Transitoria|Derogatoria|Final)/i.test(textoFormateado.substring(0, index).trim()))) {
          let endIndex = index + rubricaNormalizada.length
          if (endIndex < textoFormateado.length && 
              (textoFormateado[endIndex] === '.' || textoFormateado[endIndex] === ':')) {
            endIndex++
          }
          while (endIndex < textoFormateado.length && 
                 (textoFormateado[endIndex] === ' ' || textoFormateado[endIndex] === '\n')) {
            endIndex++
          }
          textoFormateado = textoFormateado.substring(endIndex).trim()
        }
      }
    }
    
    // Dividir por \n y añadir cada línea respetando exactamente los saltos de línea de la IA
    const lineasTexto = textoFormateado.split('\n')
    
    for (const linea of lineasTexto) {
      // Respetar la línea tal como viene de la IA, manteniendo espacios si los hay
      // Solo eliminar espacios al final de la línea, pero mantener los del inicio (indentación)
      const lineaSinEspaciosFinal = linea.replace(/\s+$/, '')
      if (lineaSinEspaciosFinal.length > 0) {
        lines.push(lineaSinEspaciosFinal)
      } else {
        // Mantener líneas vacías para respetar los saltos de línea de la IA
        lines.push('')
      }
    }
  } else if (dispositionRubrica) {
    // Si no hay texto pero hay rúbrica, mostrar la rúbrica
    lines.push(dispositionRubrica.trim())
  } else {
    lines.push('(Texto no disponible)')
  }

  lines.push('')
  lines.push('───────────────────────────────────────────────────────────')
  lines.push('')

  return lines.join('\n')
}

