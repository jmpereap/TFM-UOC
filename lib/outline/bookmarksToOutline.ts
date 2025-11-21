import type { BookmarkItem } from '@/lib/pdf/extractBookmarks'
import type { MentalOutline, Titulo, Capitulo, Seccion, Articulo, DisposicionItem } from '@/types/mentalOutline'
import { logEvent } from '@/lib/logging/logger'

/**
 * Convierte bookmarks/marcadores del PDF a MentalOutline
 * Detecta Títulos, Capítulos, Secciones y Artículos por patrones de texto
 */
export function convertBookmarksToMentalOutline(
  bookmarks: BookmarkItem[],
  source: string = 'Documento sin título',
  lawName: string = 'Documento legal'
): MentalOutline {
  const outline: MentalOutline = {
    metadata: {
      document_title: source || lawName,
      source: source || lawName,
      language: 'es',
      generated_at: new Date().toISOString().split('T')[0],
    },
    front_matter: {
      preambulo: {
        present: false,
        anchor: null,
        pages: null,
      },
      exposicion_motivos: {
        present: false,
        anchor: null,
        pages: null,
      },
    },
    titulos: [],
    disposiciones: {
      adicionales: [],
      transitorias: [],
      derogatorias: [],
      finales: [],
    },
  }

  // Patrones para detectar elementos estructurales
  // Sin ^ al inicio para permitir espacios/puntos antes (más flexible)
  // Aceptar puntos al final y corchetes alrededor
  // También aceptar versiones sin acentos (por problemas de encoding)
  const tituloPattern = /T[ÍI]TULO\s+(PRELIMINAR|[IVXLCDM]+|\d+)/i
  const tituloPatternNoAccent = /T[I]TULO\s+(PRELIMINAR|[IVXLCDM]+|\d+)/i  // Sin acento en Í
  const capituloPattern = /CAP[ÍI]TULO\s+(PRELIMINAR|PRIMERO|SEGUNDO|TERCERO|CUARTO|QUINTO|SEXTO|S[ÉE]PTIMO|OCTAVO|NOVENO|D[ÉE]CIMO|[IVXLCDM]+|\d+)/i
  const capituloPatternNoAccent = /CAP[I]TULO\s+(PRELIMINAR|PRIMERO|SEGUNDO|TERCERO|CUARTO|QUINTO|SEXTO|SEPTIMO|OCTAVO|NOVENO|DECIMO|[IVXLCDM]+|\d+)/i
  const seccionPattern = /SECCI[ÓO]N\s+(\d+\.?\s*[ªº]|\d+|[IVXLCDM]+)/i
  const seccionPatternNoAccent = /SECCI[O]N\s+(\d+\.?\s*[ªº]|\d+|[IVXLCDM]+)/i
  const articuloPattern = /Art[íi]culo\s+(\d+|[IVXLCDM]+)(?:\s+(?:bis|ter|quater|quinquies|sexies|septies|octies|nonies|decies))?\.?/i
  const articuloPatternNoAccent = /Art[i]culo\s+(\d+|[IVXLCDM]+)(?:\s+(?:bis|ter|quater|quinquies|sexies|septies|octies|nonies|decies))?\.?/i
  const preambuloPattern = /\[?Pre[áa]mbulo\]?/i
  const preambuloPatternNoAccent = /\[?Pre[áa]mbulo\]?/i
  const exposicionPattern = /Exposici[óo]n\s+de\s+motivos/i
  const disposicionPattern = /Disposici[óo]n\s+(Adicional|Transitoria|Derogatoria|Final)/i

  // Variables de estado para el procesamiento
  let currentTitulo: Titulo | null = null
  let currentCapitulo: Capitulo | null = null
  let currentSeccion: Seccion | null = null

  // Función auxiliar para extraer el subtítulo (texto después del código)
  function extractSubtitle(text: string, pattern: RegExp): string {
    const match = text.match(pattern)
    if (!match) return ''
    const afterMatch = text.substring(match[0].length).trim()
    // Limpiar separadores comunes
    return afterMatch
      .replace(/^[—–\-•:.\s]+/, '')
      .replace(/[—–\-•:.\s]+$/, '')
      .trim()
  }

  // Función auxiliar para extraer ordinal de código
  function extractOrdinal(text: string, pattern: RegExp): string {
    const match = text.match(pattern)
    if (!match || !match[1]) return ''
    return match[1].toUpperCase()
  }

  // Función auxiliar para generar anchor
  function generateAnchor(prefix: string, ordinal: string): string {
    if (!ordinal || ordinal === '?') return `${prefix}-unknown`
    return `${prefix}-${ordinal.toLowerCase()}`
  }

  // Función auxiliar para normalizar el título (arreglar encoding y limpiar)
  function normalizeTitle(title: string): string {
    if (!title) return ''
    
    // Intentar arreglar problemas de encoding comunes
    // Los caracteres pueden venir mal codificados desde el PDF
    let normalized = title
      // Reemplazar caracteres mal codificados comunes (UTF-8 mal interpretado como Latin1)
      .replace(/\xED/g, 'í')  // í en Latin1
      .replace(/\xF3/g, 'ó')  // ó en Latin1
      .replace(/\xFA/g, 'ú')  // ú en Latin1
      .replace(/\xE1/g, 'á')  // á en Latin1
      .replace(/\xE9/g, 'é')  // é en Latin1
      .replace(/\xF1/g, 'ñ')  // ñ en Latin1
      .replace(/\xCD/g, 'Í')  // Í en Latin1
      .replace(/\xD3/g, 'Ó')  // Ó en Latin1
      .replace(/\xDA/g, 'Ú')  // Ú en Latin1
      .replace(/\xC1/g, 'Á')  // Á en Latin1
      .replace(/\xC9/g, 'É')  // É en Latin1
      .replace(/\xD1/g, 'Ñ')  // Ñ en Latin1
      // También intentar con caracteres de reemplazo Unicode
      .replace(/\uFFFD/g, 'í')  // Carácter de reemplazo Unicode
      .trim()
    
    return normalized
  }

  // Función recursiva para procesar bookmarks
  function processBookmark(bookmark: BookmarkItem, level: number = 0) {
    const rawTitle = bookmark.title?.trim() || ''
    const title = normalizeTitle(rawTitle)
    const pageNumber = bookmark.pageNumber

    if (!title) return

    // PREÁMBULO (puede tener corchetes: [Preámbulo])
    if (preambuloPattern.test(title) || preambuloPatternNoAccent.test(title)) {
      outline.front_matter.preambulo.present = true
      outline.front_matter.preambulo.pages = pageNumber ? [pageNumber] : null
      logEvent('mentalOutline.bookmarks.preambulo', { pageNumber, title, rawTitle })
      
      // Procesar hijos recursivamente (aunque es raro)
      if (bookmark.children && bookmark.children.length > 0) {
        for (const child of bookmark.children) {
          processBookmark(child, level + 1)
        }
      }
      return
    }

    // EXPOSICIÓN DE MOTIVOS
    if (exposicionPattern.test(title)) {
      outline.front_matter.exposicion_motivos.present = true
      outline.front_matter.exposicion_motivos.pages = pageNumber ? [pageNumber] : null
      logEvent('mentalOutline.bookmarks.exposicion', { pageNumber, title })
      
      // Procesar hijos recursivamente (aunque es raro)
      if (bookmark.children && bookmark.children.length > 0) {
        for (const child of bookmark.children) {
          processBookmark(child, level + 1)
        }
      }
      return
    }

    // TÍTULO (aceptar con o sin acentos)
    const isTitulo = tituloPattern.test(title) || tituloPatternNoAccent.test(title)
    if (isTitulo) {
      // Intentar extraer ordinal con ambos patrones
      let ordinal = extractOrdinal(title, tituloPattern)
      if (!ordinal) {
        ordinal = extractOrdinal(title, tituloPatternNoAccent)
      }
      // Si aún no hay ordinal, intentar extraer manualmente
      if (!ordinal) {
        const match = title.match(/T[I]TULO\s+(PRELIMINAR|[IVXLCDM]+|\d+)/i)
        ordinal = match ? match[1].toUpperCase() : ''
      }
      
      let subtitulo = extractSubtitle(title, tituloPattern)
      if (!subtitulo) {
        subtitulo = extractSubtitle(title, tituloPatternNoAccent)
      }
      // Limpiar puntos al final del subtítulo
      subtitulo = subtitulo.replace(/\.+$/, '').trim()
      
      // Cerrar el título anterior si existe
      if (currentTitulo) {
        // Calcular página de fin del título anterior
        if (pageNumber && currentTitulo.pagina_inicio_titulo) {
          currentTitulo.pagina_fin_titulo = pageNumber - 1
        }
      }

      currentTitulo = {
        codigo_titulo: `TÍTULO ${ordinal}`,
        subtitulo_titulo: subtitulo,
        pagina_inicio_titulo: pageNumber || 0,
        pagina_fin_titulo: 0,
        articulos_sin_capitulo: [],
        capitulos: [],
        ordinal: ordinal,
        titulo_texto: subtitulo,
        pages: pageNumber ? [pageNumber] : [],
        anchor: generateAnchor('tit', ordinal),
      }
      outline.titulos.push(currentTitulo)
      currentCapitulo = null
      currentSeccion = null
      logEvent('mentalOutline.bookmarks.titulo', { ordinal, subtitulo, pageNumber, title })
      
      // Procesar hijos recursivamente (pueden contener capítulos y artículos)
      if (bookmark.children && bookmark.children.length > 0) {
        for (const child of bookmark.children) {
          processBookmark(child, level + 1)
        }
      }
      return
    }

    // CAPÍTULO (aceptar con o sin acentos)
    const isCapitulo = capituloPattern.test(title) || capituloPatternNoAccent.test(title)
    if (isCapitulo) {
      if (!currentTitulo) {
        // Si no hay título, crear uno temporal
        currentTitulo = {
          codigo_titulo: 'TÍTULO TEMPORAL',
          subtitulo_titulo: '',
          pagina_inicio_titulo: pageNumber || 0,
          pagina_fin_titulo: 0,
          articulos_sin_capitulo: [],
          capitulos: [],
          ordinal: '?',
          titulo_texto: '',
          pages: pageNumber ? [pageNumber] : [],
          anchor: 'tit-unknown',
        }
        outline.titulos.push(currentTitulo)
        logEvent('mentalOutline.bookmarks.titulo.temporal', { pageNumber, title })
      }

      // Intentar extraer ordinal con ambos patrones
      let ordinal = extractOrdinal(title, capituloPattern)
      if (!ordinal) {
        ordinal = extractOrdinal(title, capituloPatternNoAccent)
      }
      
      let subtitulo = extractSubtitle(title, capituloPattern)
      if (!subtitulo) {
        subtitulo = extractSubtitle(title, capituloPatternNoAccent)
      }

      // Cerrar el capítulo anterior si existe
      if (currentCapitulo && pageNumber && currentCapitulo.pagina_inicio_capitulo) {
        currentCapitulo.pagina_fin_capitulo = pageNumber - 1
      }

      currentCapitulo = {
        codigo_capitulo: `CAPÍTULO ${ordinal}`,
        subtitulo_capitulo: subtitulo,
        pagina_inicio_capitulo: pageNumber || 0,
        pagina_fin_capitulo: 0,
        articulos_sin_seccion: [],
        secciones: [],
        ordinal: ordinal,
        capitulo_texto: subtitulo,
        pages: pageNumber ? [pageNumber] : [],
        anchor: generateAnchor('cap', ordinal),
      }
      currentTitulo.capitulos.push(currentCapitulo)
      currentSeccion = null
      logEvent('mentalOutline.bookmarks.capitulo', { ordinal, subtitulo, pageNumber, title, titulo: currentTitulo.codigo_titulo })
      
      // Procesar hijos recursivamente (pueden contener secciones y artículos)
      if (bookmark.children && bookmark.children.length > 0) {
        for (const child of bookmark.children) {
          processBookmark(child, level + 1)
        }
      }
      return
    }

    // SECCIÓN (aceptar con o sin acentos)
    const isSeccion = seccionPattern.test(title) || seccionPatternNoAccent.test(title)
    if (isSeccion) {
      if (!currentTitulo) {
        // Si no hay título, crear uno temporal
        currentTitulo = {
          codigo_titulo: 'TÍTULO TEMPORAL',
          subtitulo_titulo: '',
          pagina_inicio_titulo: pageNumber || 0,
          pagina_fin_titulo: 0,
          articulos_sin_capitulo: [],
          capitulos: [],
          ordinal: '?',
          titulo_texto: '',
          pages: pageNumber ? [pageNumber] : [],
          anchor: 'tit-unknown',
        }
        outline.titulos.push(currentTitulo)
      }

      if (!currentCapitulo) {
        // Si no hay capítulo, crear uno temporal
        currentCapitulo = {
          codigo_capitulo: 'CAPÍTULO TEMPORAL',
          subtitulo_capitulo: '',
          pagina_inicio_capitulo: pageNumber || 0,
          pagina_fin_capitulo: 0,
          articulos_sin_seccion: [],
          secciones: [],
          ordinal: '?',
          capitulo_texto: '',
          pages: pageNumber ? [pageNumber] : [],
          anchor: 'cap-unknown',
        }
        currentTitulo.capitulos.push(currentCapitulo)
      }

      // Intentar extraer ordinal con ambos patrones
      let ordinal = extractOrdinal(title, seccionPattern)
      if (!ordinal) {
        ordinal = extractOrdinal(title, seccionPatternNoAccent)
      }
      
      let subtitulo = extractSubtitle(title, seccionPattern)
      if (!subtitulo) {
        subtitulo = extractSubtitle(title, seccionPatternNoAccent)
      }

      // Cerrar la sección anterior si existe
      if (currentSeccion && pageNumber && currentSeccion.pagina_inicio_seccion) {
        currentSeccion.pagina_fin_seccion = pageNumber - 1
      }

      currentSeccion = {
        codigo_seccion: `SECCIÓN ${ordinal}`,
        subtitulo_seccion: subtitulo,
        pagina_inicio_seccion: pageNumber || 0,
        pagina_fin_seccion: 0,
        articulos: [],
        ordinal: ordinal,
        seccion_texto: subtitulo,
        pages: pageNumber ? [pageNumber] : [],
        anchor: generateAnchor('sec', ordinal),
      }
      currentCapitulo.secciones.push(currentSeccion)
      logEvent('mentalOutline.bookmarks.seccion', { ordinal, subtitulo, pageNumber, title, capitulo: currentCapitulo.codigo_capitulo })
      
      // Procesar hijos recursivamente (pueden contener artículos)
      if (bookmark.children && bookmark.children.length > 0) {
        for (const child of bookmark.children) {
          processBookmark(child, level + 1)
        }
      }
      return
    }

    // ARTÍCULO (aceptar con o sin acentos)
    const isArticulo = articuloPattern.test(title) || articuloPatternNoAccent.test(title)
    if (isArticulo) {
      if (!currentTitulo) {
        // Si no hay título, crear uno temporal
        currentTitulo = {
          codigo_titulo: 'TÍTULO TEMPORAL',
          subtitulo_titulo: '',
          pagina_inicio_titulo: pageNumber || 0,
          pagina_fin_titulo: 0,
          articulos_sin_capitulo: [],
          capitulos: [],
          ordinal: '?',
          titulo_texto: '',
          pages: pageNumber ? [pageNumber] : [],
          anchor: 'tit-unknown',
        }
        outline.titulos.push(currentTitulo)
      }

      // Intentar extraer número con ambos patrones
      let match = title.match(articuloPattern)
      if (!match) {
        match = title.match(articuloPatternNoAccent)
      }
      const numero = match ? match[1] : ''
      
      let rubrica = extractSubtitle(title, articuloPattern)
      if (!rubrica) {
        rubrica = extractSubtitle(title, articuloPatternNoAccent)
      }
      // Limpiar puntos al final de la rúbrica
      rubrica = rubrica.replace(/\.+$/, '').trim()

      const articulo: Articulo = {
        numero: numero,
        articulo_texto: rubrica,
        pagina_articulo: pageNumber || 0,
        pages: pageNumber ? [pageNumber] : [],
        anchor: generateAnchor('art', numero),
      }

      // Asignar según jerarquía: sección > capítulo > título
      if (currentSeccion) {
        currentSeccion.articulos.push(articulo)
        logEvent('mentalOutline.bookmarks.articulo', { numero, rubrica, pageNumber, title, ubicacion: 'seccion', seccion: currentSeccion.codigo_seccion })
      } else if (currentCapitulo) {
        currentCapitulo.articulos_sin_seccion.push(articulo)
        logEvent('mentalOutline.bookmarks.articulo', { numero, rubrica, pageNumber, title, ubicacion: 'capitulo', capitulo: currentCapitulo.codigo_capitulo })
      } else {
        currentTitulo.articulos_sin_capitulo.push(articulo)
        logEvent('mentalOutline.bookmarks.articulo', { numero, rubrica, pageNumber, title, ubicacion: 'titulo', titulo: currentTitulo.codigo_titulo })
      }
      
      // Procesar hijos recursivamente (aunque es raro, un artículo podría tener sub-artículos)
      if (bookmark.children && bookmark.children.length > 0) {
        for (const child of bookmark.children) {
          processBookmark(child, level + 1)
        }
      }
      return
    }

    // DISPOSICIÓN
    if (disposicionPattern.test(title)) {
      const match = title.match(disposicionPattern)
      if (match) {
        const tipo = match[1].toLowerCase()
        const tipoKey = tipo === 'adicional' ? 'adicionales' :
                       tipo === 'transitoria' ? 'transitorias' :
                       tipo === 'derogatoria' ? 'derogatorias' : 'finales'
        
        const textoEncabezado = extractSubtitle(title, disposicionPattern)
        
        const disposicion: DisposicionItem = {
          numero: `Disposición ${match[1]}`,
          texto_encabezado: textoEncabezado,
          pagina_disposicion: pageNumber || 0,
          pages: pageNumber ? [pageNumber] : [],
          anchor: generateAnchor('dis', match[1]),
        }
        
        outline.disposiciones[tipoKey].push(disposicion)
        logEvent('mentalOutline.bookmarks.disposicion', { tipo, textoEncabezado, pageNumber, title })
      }
      
      // Procesar hijos recursivamente
      if (bookmark.children && bookmark.children.length > 0) {
        for (const child of bookmark.children) {
          processBookmark(child, level + 1)
        }
      }
      return
    }

    // Si no coincide con ningún patrón, procesar hijos recursivamente
    // Esto permite manejar estructuras anidadas
    if (bookmark.children && bookmark.children.length > 0) {
      for (const child of bookmark.children) {
        processBookmark(child, level + 1)
      }
    }
  }

  // Procesar todos los bookmarks
  // Logging para debugging: mostrar algunos títulos de ejemplo
  const sampleTitles: string[] = []
  function collectSampleTitles(bm: BookmarkItem, level: number = 0) {
    if (level < 3 && bm.title && sampleTitles.length < 20) {
      sampleTitles.push(bm.title.substring(0, 150))
    }
    if (bm.children && bm.children.length > 0) {
      for (const child of bm.children) {
        collectSampleTitles(child, level + 1)
      }
    }
  }
  
  for (const bookmark of bookmarks) {
    collectSampleTitles(bookmark)
  }
  
  logEvent('mentalOutline.bookmarks.samples', {
    totalBookmarks: bookmarks.length,
    sampleTitles: sampleTitles.slice(0, 10),
  })
  
  // Procesar todos los bookmarks
  for (const bookmark of bookmarks) {
    processBookmark(bookmark)
  }

  // Calcular páginas de fin para elementos que no se cerraron
  for (let i = 0; i < outline.titulos.length; i++) {
    const titulo = outline.titulos[i]
    const nextTitulo = outline.titulos[i + 1]
    
    if (!titulo.pagina_fin_titulo || titulo.pagina_fin_titulo === 0) {
      titulo.pagina_fin_titulo = nextTitulo ? (nextTitulo.pagina_inicio_titulo - 1) : 0
    }

    // Calcular páginas de fin para capítulos
    if (titulo.capitulos && titulo.capitulos.length > 0) {
      for (let j = 0; j < titulo.capitulos.length; j++) {
        const cap = titulo.capitulos[j]
        const nextCap = titulo.capitulos[j + 1]
        
        if (!cap.pagina_fin_capitulo || cap.pagina_fin_capitulo === 0) {
          cap.pagina_fin_capitulo = nextCap 
            ? (nextCap.pagina_inicio_capitulo - 1) 
            : titulo.pagina_fin_titulo
        }

        // Calcular páginas de fin para secciones
        if (cap.secciones && cap.secciones.length > 0) {
          for (let k = 0; k < cap.secciones.length; k++) {
            const sec = cap.secciones[k]
            const nextSec = cap.secciones[k + 1]
            
            if (!sec.pagina_fin_seccion || sec.pagina_fin_seccion === 0) {
              sec.pagina_fin_seccion = nextSec 
                ? (nextSec.pagina_inicio_seccion - 1) 
                : cap.pagina_fin_capitulo
            }

            // Calcular páginas de fin para artículos en secciones
            if (sec.articulos && sec.articulos.length > 0) {
              for (let l = 0; l < sec.articulos.length; l++) {
                const art = sec.articulos[l]
                const nextArt = sec.articulos[l + 1]
                // Los artículos no tienen pagina_fin_articulo en el tipo, pero podemos calcularlo si es necesario
              }
            }
          }
        }

        // Calcular páginas de fin para artículos sin sección
        if (cap.articulos_sin_seccion && cap.articulos_sin_seccion.length > 0) {
          for (let l = 0; l < cap.articulos_sin_seccion.length; l++) {
            const art = cap.articulos_sin_seccion[l]
            const nextArt = cap.articulos_sin_seccion[l + 1]
            // Los artículos no tienen pagina_fin_articulo en el tipo
          }
        }
      }
    }

    // Calcular páginas de fin para artículos sin capítulo
    if (titulo.articulos_sin_capitulo && titulo.articulos_sin_capitulo.length > 0) {
      for (let l = 0; l < titulo.articulos_sin_capitulo.length; l++) {
        const art = titulo.articulos_sin_capitulo[l]
        const nextArt = titulo.articulos_sin_capitulo[l + 1]
        // Los artículos no tienen pagina_fin_articulo en el tipo
      }
    }
  }

  // Transformar al formato del frontend (igual que en generate-direct)
  return transformOutlineToFrontendFormat(outline, source, lawName)
}

/**
 * Transforma el esquema al formato esperado por el frontend
 */
function transformOutlineToFrontendFormat(
  outline: MentalOutline,
  source: string,
  lawName: string
): MentalOutline {
  // El esquema ya está en el formato correcto, solo asegurarnos de que los alias estén presentes
  for (const titulo of outline.titulos) {
    // Alias para articulos
    if (titulo.articulos_sin_capitulo && !titulo.articulos) {
      titulo.articulos = titulo.articulos_sin_capitulo
    }
    
    for (const cap of titulo.capitulos || []) {
      // Alias para articulos
      if (cap.articulos_sin_seccion && !cap.articulos) {
        cap.articulos = cap.articulos_sin_seccion
      }
    }
  }

  return outline
}

/**
 * Valida que los bookmarks tengan una estructura válida
 * Retorna true si hay al menos algunos elementos que parezcan Títulos o Artículos
 */
export function validateBookmarksStructure(bookmarks: BookmarkItem[]): {
  isValid: boolean
  hasTitulos: boolean
  hasArticulos: boolean
  tituloCount: number
  articuloCount: number
  totalItems: number
  sampleTitles: string[]
} {
  // Patrones más flexibles (sin ^ para permitir espacios antes)
  // También versiones sin acentos para manejar problemas de encoding
  const tituloPattern = /T[ÍI]TULO\s+(PRELIMINAR|[IVXLCDM]+|\d+)/i
  const tituloPatternNoAccent = /T[I]TULO\s+(PRELIMINAR|[IVXLCDM]+|\d+)/i
  const articuloPattern = /Art[íi]culo\s+(\d+|[IVXLCDM]+)\.?/i
  const articuloPatternNoAccent = /Art[i]culo\s+(\d+|[IVXLCDM]+)\.?/i

  let tituloCount = 0
  let articuloCount = 0
  let totalItems = 0
  const sampleTitles: string[] = []

  function countItems(bookmark: BookmarkItem, level: number = 0) {
    totalItems++
    const rawTitle = bookmark.title?.trim() || ''
    // Normalizar título para arreglar problemas de encoding
    const title = rawTitle
      .replace(/\xED/g, 'í')
      .replace(/\xF3/g, 'ó')
      .replace(/\xFA/g, 'ú')
      .replace(/\xE1/g, 'á')
      .replace(/\xE9/g, 'é')
      .replace(/\xF1/g, 'ñ')
      .replace(/\xCD/g, 'Í')
      .replace(/\xD3/g, 'Ó')
      .replace(/\xDA/g, 'Ú')
      .replace(/\xC1/g, 'Á')
      .replace(/\xC9/g, 'É')
      .replace(/\xD1/g, 'Ñ')
    
    // Guardar algunos títulos de ejemplo para debugging (solo primeros niveles)
    if (level < 3 && title && sampleTitles.length < 10) {
      sampleTitles.push(title.substring(0, 100))
    }
    
    // Patrones más flexibles - buscar en cualquier parte del título
    // Aceptar puntos al final y versiones sin acentos
    if (tituloPattern.test(title) || tituloPatternNoAccent.test(title)) {
      tituloCount++
    }
    // Aceptar puntos al final en artículos (con o sin acentos)
    if (articuloPattern.test(title) || articuloPatternNoAccent.test(title)) {
      articuloCount++
    }

    if (bookmark.children && bookmark.children.length > 0) {
      for (const child of bookmark.children) {
        countItems(child, level + 1)
      }
    }
  }

  for (const bookmark of bookmarks) {
    countItems(bookmark)
  }

  const hasTitulos = tituloCount > 0
  const hasArticulos = articuloCount > 0
  const isValid = hasTitulos || hasArticulos

  return {
    isValid,
    hasTitulos,
    hasArticulos,
    tituloCount,
    articuloCount,
    totalItems,
    sampleTitles,
  }
}

