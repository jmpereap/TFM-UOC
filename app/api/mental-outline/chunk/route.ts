import { NextRequest, NextResponse } from 'next/server'
import { callModelJSON } from '@/lib/qa/callModel'
import { logEvent } from '@/lib/logging/logger'
import { buildTextFromPages, PageEntry } from '@/lib/pdf/pagesMap'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'

export const runtime = 'nodejs'

// Tamaños de chunk para procesamiento adaptativo
const MENTAL_OUTLINE_CHUNK_SIZES = [3, 2, 1]

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json()
    const source = typeof payload?.source === 'string' ? payload.source : ''
    const lawName = typeof payload?.lawName === 'string' ? payload.lawName : ''
    // Aceptar tanto pagesFull como pagesChunk (el frontend envía pagesChunk)
    const pagesFull = Array.isArray(payload?.pagesFull) ? payload.pagesFull : 
                     Array.isArray(payload?.pagesChunk) ? payload.pagesChunk : []
    const schema = payload?.schema || null // Schema acumulado de chunks anteriores
    const indice = typeof payload?.indice === 'string' ? payload.indice : '' // Índice del PDF

    if (!pagesFull.length) {
      return NextResponse.json({ ok: false, error: 'pagesFull requerido' }, { status: 400 })
    }

    const normalizedPages: PageEntry[] = pagesFull.map((entry: any, idx: number) => ({
      num: typeof entry?.num === 'number' ? entry.num : idx + 1,
      text: typeof entry?.text === 'string' ? entry.text : '',
    }))

    const hasContent = normalizedPages.some((entry) => entry.text.trim().length > 0)
    if (!hasContent) {
      return NextResponse.json({ ok: false, error: 'Sin texto utilizable en pagesFull' }, { status: 400 })
    }

    const firstPage = normalizedPages[0]?.num || 1
    const lastPage = normalizedPages[normalizedPages.length - 1]?.num || normalizedPages.length

    const { text, pagesMap } = buildTextFromPages(normalizedPages)
    if (!text.trim()) {
      return NextResponse.json({ ok: false, error: 'Texto vacío tras normalización' }, { status: 400 })
    }

    // Detectar y extraer índice si es el primer chunk
    const detectAndExtractIndice = (): string => {
      // Si ya tenemos el índice del payload, usarlo (viene de un chunk anterior)
      if (indice && indice.trim().length > 0) {
        return indice.trim()
      }

      // Solo detectar el índice si es el primer chunk (no hay schema acumulado o está vacío)
      const isFirstChunk = !schema ||
                          !Array.isArray(schema.titulos) ||
                          schema.titulos.length === 0 ||
                          firstPage <= 10

      if (!isFirstChunk) {
        return '' // No detectar en chunks siguientes si no viene en el payload
      }

      // El índice normalmente está en las primeras 5-10 páginas
      const indiceKeywords = /índice|indice|sumario|tabla\s+de\s+contenido|contents|table\s+of\s+contents/i
      const indicePages: PageEntry[] = []

      // Buscar en las primeras páginas (hasta página 10)
      for (const page of normalizedPages) {
        if (page.num > 10) break
        const pageText = String(page.text || '').toLowerCase()
        if (indiceKeywords.test(pageText)) {
          indicePages.push(page)
        }
      }

      // Si encontramos páginas con índice, extraer su contenido
      if (indicePages.length > 0) {
        const indiceText: string[] = []
        for (const page of indicePages) {
          const pageText = String(page.text || '').trim()
          // Detectar si esta página todavía es parte del índice
          const isMainContent = /^(pre[áa]mbulo|exposici[óo]n|t[íi]tulo\s+(preliminar|[ivxlcdm]+|\d+))/i.test(pageText)
          if (isMainContent) break
          indiceText.push(pageText)
        }
        return indiceText.join('\n\n')
      }

      return ''
    }

    const indiceText = detectAndExtractIndice()

    // Construir prompt detallado para el chunk
    const buildChunkPrompt = (chunkText: string, chunkRange: [number, number], schemaAcumulado: any, indice: string) => {
      const parts: string[] = []
      
      parts.push('INSTRUCCIÓN: Analiza el fragmento del PDF de una ley (formato BOE) y construye un ESQUEMA ESTRUCTURADO con:')
      parts.push('- TÍTULOS')
      parts.push('- CAPÍTULOS')
      parts.push('- SECCIONES')
      parts.push('- ARTÍCULOS')
      parts.push('- DISPOSICIONES (adicionales, transitorias, derogatorias y finales, si existen)')
      
      parts.push('\n=== ⚠️⚠️⚠️ REGLA ABSOLUTA #1: ESQUEMA MENTAL = 100% ÍNDICE ⚠️⚠️⚠️ ===')
      parts.push('**EL ESQUEMA MENTAL SE CONSTRUYE EXCLUSIVAMENTE Y ÚNICAMENTE CON EL ÍNDICE**')
      parts.push('**EL FRAGMENTO DE PÁGINAS (' + chunkRange[0] + ' a ' + chunkRange[1] + ') NO SE USA PARA NADA MÁS QUE EXTRAER RÚBRICAS**')
      parts.push('**NO uses el fragmento para: estructura, páginas, qué artículos existen, qué títulos/capítulos/secciones hay**')
      parts.push('**TODO eso viene EXCLUSIVAMENTE del ÍNDICE**')
      parts.push('')
      
      parts.push('\n=== ⚠️⚠️⚠️ REGLA ABSOLUTA #2: INCLUYE TODOS LOS ARTÍCULOS DEL ÍNDICE ⚠️⚠️⚠️ ===')
      parts.push('**SI EL ÍNDICE LISTA 50 ARTÍCULOS, TU JSON DEBE TENER 50 ARTÍCULOS**')
      parts.push('**NO filtres artículos por el rango del fragmento (' + chunkRange[0] + '-' + chunkRange[1] + ')**')
      parts.push('**El rango del fragmento SOLO indica qué texto está disponible para extraer rúbricas**')
      parts.push('**Si un artículo está en el ÍNDICE pero NO en el fragmento, inclúyelo igualmente con rúbrica vacía o del ÍNDICE**')
      parts.push('')
      
      parts.push('\n=== ⚠️⚠️⚠️ REGLA ABSOLUTA #3: PÁGINAS = EXACTAS DEL ÍNDICE ⚠️⚠️⚠️ ===')
      parts.push('**TODAS las pagina_inicio_* DEBEN ser EXACTAMENTE las que aparecen en el ÍNDICE**')
      parts.push('**NO uses páginas del texto del fragmento. NO calcules páginas. NO uses páginas donde aparece en el texto.**')
      parts.push('**Si el ÍNDICE dice "Artículo 5" en página 10, usa página 10, NO la página donde aparece en el fragmento**')
      parts.push('')
      
      parts.push('\n=== PROCESO OBLIGATORIO PASO A PASO ===')
      parts.push('**PASO 1: Lee el ÍNDICE completo de principio a fin**')
      parts.push('**PASO 2: Identifica TODOS los elementos en el ÍNDICE:**')
      parts.push('   - Cuenta TODOS los Títulos')
      parts.push('   - Para cada Título, cuenta TODOS los Capítulos (si los tiene)')
      parts.push('   - Para cada Capítulo, cuenta TODAS las Secciones (si las tiene)')
      parts.push('   - Cuenta TODOS los Artículos (sin excepción, sin filtrar)')
      parts.push('**PASO 3: Construye el JSON con TODOS los elementos del ÍNDICE**')
      parts.push('**PASO 4: Usa las páginas EXACTAS del ÍNDICE para cada elemento**')
      parts.push('**PASO 5: Extrae las rúbricas del fragmento (si están disponibles)**')
      parts.push('**PASO 6: Verifica que el número de artículos en tu JSON coincide con el número de artículos en el ÍNDICE**')
      parts.push('')
      
      parts.push('\n=== INSTRUCCIONES ESPECÍFICAS ===')
      parts.push('1. **ESTRUCTURA JERÁRQUICA:** SOLO del ÍNDICE. Si el ÍNDICE muestra "TÍTULO I" seguido de artículos directos → sin capítulos. Si muestra "CAPÍTULO I" → con capítulos.')
      parts.push('2. **ARTÍCULOS:** INCLUYE TODOS del ÍNDICE. NO filtres. El fragmento (' + chunkRange[0] + '-' + chunkRange[1] + ') solo para rúbricas.')
      parts.push('3. **PÁGINAS:** EXACTAS del ÍNDICE. NO del fragmento.')
      parts.push('4. **PREÁMBULO:** Si aparece en el ÍNDICE con página → present: true, pages: [página]. Si no → present: false.')
      parts.push('5. **ORDEN:** EXACTO del ÍNDICE. Cada artículo en un único lugar según el ÍNDICE.')
      
      if (indice && indice.trim().length > 0) {
        parts.push('\n=== ÍNDICE DEL PDF (ÚNICA FUENTE DE VERDAD) ===')
        parts.push('**ESTE ES EL ÍNDICE DEL PDF. ES LA ÚNICA FUENTE DE VERDAD.**')
        parts.push('**ÚSALO EXCLUSIVAMENTE PARA:')
        parts.push('- Determinar la estructura jerárquica (qué Títulos tienen Capítulos, qué Capítulos tienen Secciones)')
        parts.push('- Obtener TODAS las páginas iniciales (pagina_inicio_titulo, pagina_inicio_capitulo, pagina_inicio_seccion, pagina_inicio_articulo)')
        parts.push('- Detectar el Preámbulo y su página')
        parts.push('**NO uses el texto del fragmento para estructura o páginas. SOLO el ÍNDICE.**')
        parts.push('')
        parts.push('**⚠️⚠️⚠️ PROCESO OBLIGATORIO PARA ARTÍCULOS (CRÍTICO) ⚠️⚠️⚠️:**')
        parts.push('**ANTES DE GENERAR EL JSON, HAZ ESTO:**')
        parts.push('1. Lee TODO el ÍNDICE de principio a fin, línea por línea')
        parts.push('2. Identifica CADA mención de "Artículo" seguida de un número')
        parts.push('3. Anota TODOS los artículos que encuentres (ejemplo: Artículo 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, etc.)')
        parts.push('4. CUENTA cuántos artículos hay en total en el ÍNDICE (ejemplo: 50 artículos)')
        parts.push('5. Anota ese número (ejemplo: "50 artículos")')
        parts.push('')
        parts.push('**AL GENERAR EL JSON:**')
        parts.push('6. INCLUYE TODOS los artículos que anotaste, SIN EXCEPCIÓN')
        parts.push('7. NO filtres por el rango del fragmento (' + chunkRange[0] + '-' + chunkRange[1] + ') - ese rango SOLO es para rúbricas')
        parts.push('8. Asigna cada artículo según el ÍNDICE: a "articulos_sin_capitulo", "articulos_sin_seccion" o "articulos" de sección')
        parts.push('9. Usa la página EXACTA del ÍNDICE para pagina_inicio_articulo')
        parts.push('10. DESPUÉS DE GENERAR EL JSON, CUENTA los artículos en tu JSON y verifica que coinciden con el número que anotaste en el paso 4')
        parts.push('11. Si no coinciden, REVISA y CORRIGE hasta que coincidan')
        parts.push('')
        parts.push('"""')
        parts.push(indice)
        parts.push('"""')
      } else {
        parts.push('\n=== ADVERTENCIA: NO SE PROPORCIONÓ ÍNDICE ===')
        parts.push('Sin el ÍNDICE, debes inferir la estructura del texto, pero sé MUY conservador:')
        parts.push('- Solo crea CAPÍTULOS si aparecen explícitamente en el texto con encabezados claros de "CAPÍTULO".')
        parts.push('- Solo crea SECCIONES si aparecen explícitamente en el texto con encabezados claros de "SECCIÓN".')
        parts.push('- En caso de duda, NO crees estructura jerárquica adicional.')
      }
      
      if (schemaAcumulado && typeof schemaAcumulado === 'object') {
        parts.push('\n=== ESQUEMA ACUMULADO DE CHUNKS ANTERIORES ===')
        parts.push('(Para referencia, NO duplicar elementos ya detectados)')
        parts.push(JSON.stringify(schemaAcumulado, null, 2))
      }
      
      parts.push('\n=== USO DEL TEXTO DEL FRAGMENTO (SOLO PARA RÚBRICAS) ===')
      parts.push('El fragmento SOLO extrae rúbricas. NO para estructura/páginas (eso viene del ÍNDICE).')
      parts.push('Extrae: subtítulo_titulo, subtitulo_capitulo, subtitulo_seccion, rubrica_articulo.')
      parts.push('IMPORTANTE: NO incluyas texto_articulo en el JSON. Solo la rúbrica. El texto completo se extrae después.')
      parts.push('Proceso: 1) Identifica elementos en el ÍNDICE, 2) Busca sus rúbricas en el fragmento, 3) Si no está, usa la del ÍNDICE.')
      
      parts.push('\n=== PÁGINAS - SOLO DEL ÍNDICE ===')
      parts.push('TODAS las pagina_inicio_* vienen EXACTAS del ÍNDICE. NO uses páginas del texto del fragmento.')
      parts.push('Para pagina_fin_*: usa la página donde comienza el siguiente elemento del mismo nivel según el ÍNDICE.')
      
      parts.push(`\n=== FRAGMENTO DE TEXTO (páginas ${chunkRange[0]} a ${chunkRange[1]}) ===`)
      parts.push('**USO: Este texto SOLO se usa para extraer las RÚBRICAS de los elementos.**')
      parts.push('**NO uses este texto para determinar estructura o páginas - eso viene del ÍNDICE.**')
      parts.push('')
      parts.push('"""')
      parts.push(chunkText)
      parts.push('"""')
      
      parts.push('\n=== ESTRUCTURA JSON ESPERADA ===')
      parts.push('Devuelve un JSON con esta estructura:')
      parts.push(JSON.stringify({
        metadata: {
          document_title: source || lawName,
          source: source || lawName,
          language: 'es',
          generated_at: new Date().toISOString().split('T')[0]
        },
        front_matter: {
          preambulo: {
            present: true,  // true si aparece en el ÍNDICE con página
            anchor: null,
            pages: [3]  // Array con la página EXACTA del ÍNDICE (ejemplo: página 3)
          },
          exposicion_motivos: {
            present: false,
            anchor: null,
            pages: null
          }
        },
        titulos: [
          {
            codigo_titulo: 'TÍTULO I',
            subtitulo_titulo: 'Disposiciones generales',
            pagina_inicio_titulo: 4,
            pagina_fin_titulo: 10,
            articulos_sin_capitulo: [
              {
                numero_articulo: 'Artículo 1',
                rubrica_articulo: 'Objeto de la ley',
                pagina_inicio_articulo: 4,
                pagina_fin_articulo: 5
              }
            ],
            capitulos: [
              {
                codigo_capitulo: 'CAPÍTULO I',
                subtitulo_capitulo: 'Transparencia e información',
                pagina_inicio_capitulo: 6,
                pagina_fin_capitulo: 8,
                articulos_sin_seccion: [
                  {
                    numero_articulo: 'Artículo 11',
                    rubrica_articulo: 'Transparencia e información al afectado',
                    pagina_inicio_articulo: 6,
                    pagina_fin_articulo: 7
                  }
                ],
                secciones: [
                  {
                    codigo_seccion: 'SECCIÓN 1',
                    subtitulo_seccion: 'Disposiciones comunes',
                    pagina_inicio_seccion: 7,
                    pagina_fin_seccion: 8,
                    articulos: [
                      {
                        numero_articulo: 'Artículo 12',
                        rubrica_articulo: 'Disposiciones generales',
                        pagina_inicio_articulo: 7,
                        pagina_fin_articulo: 8
                      }
                    ]
                  }
                ]
              }
            ]
          }
        ],
        disposiciones: {
          adicionales: [
            {
              numero_disposicion: 'Disposición adicional primera',
              texto_encabezado: 'Texto de la disposición',
              pagina_inicio_disposicion: 50,
              pagina_fin_disposicion: 51
            }
          ],
          transitorias: [],
          derogatorias: [],
          finales: []
        }
      }, null, 2))
      
      parts.push('\n=== ⚠️⚠️⚠️ REGLAS FINALES CRÍTICAS ⚠️⚠️⚠️ ===')
      parts.push('**1. ESTRUCTURA Y PÁGINAS:** EXCLUSIVAMENTE del ÍNDICE. Si no está en el ÍNDICE, NO lo incluyas.')
      parts.push('**2. RÚBRICAS:** Del fragmento (si está disponible). Si no está, deja vacío o usa la del ÍNDICE.')
      parts.push('**3. ARTÍCULOS (CRÍTICO):** INCLUYE TODOS del ÍNDICE, SIN FILTRAR. Solo incluye rubrica_articulo, NO texto_articulo.')
      parts.push('**4. VERIFICACIÓN OBLIGATORIA:** Antes de terminar, cuenta los artículos del ÍNDICE y los de tu JSON. DEBEN COINCIDIR.')
      parts.push('**5. JSON:** Completo y bien formado. Incluye metadata, front_matter y disposiciones siempre. NO incluyas texto_articulo.')
      parts.push('**6. ORDEN:** EXACTO del ÍNDICE. Cada artículo en un único lugar según el ÍNDICE.')
      parts.push('')
      parts.push('**RECUERDA: El fragmento (' + chunkRange[0] + '-' + chunkRange[1] + ') SOLO se usa para extraer rúbricas. NO para estructura, páginas o decidir qué artículos incluir.**')
      
      return parts.join('\n')
    }

    const prompt = buildChunkPrompt(text, [firstPage, lastPage], schema, indiceText)

    logEvent('mentalOutline.chunk.prompt', {
      source: source || lawName,
      from: firstPage,
      to: lastPage,
      size: prompt.length
    })

    // Intentar procesar con diferentes tamaños de chunk si falla
    let outline: any = null
    let lastError: any = null

    for (const chunkSize of MENTAL_OUTLINE_CHUNK_SIZES) {
      try {
        outline = await callModelJSON(prompt, 120000, 4000, {
      endpoint: 'mental-outline-chunk',
      source: source || lawName,
      range: [firstPage, lastPage],
      pages: normalizedPages.length,
    })
        break // Éxito, salir del loop
      } catch (error: any) {
        lastError = error
        logEvent('mentalOutline.chunk.error', {
      source: source || lawName,
      from: firstPage,
      to: lastPage,
          chunkSize,
          error: error.message || String(error)
        })
        // Si no es el último tamaño, continuar con el siguiente
        if (chunkSize !== MENTAL_OUTLINE_CHUNK_SIZES[MENTAL_OUTLINE_CHUNK_SIZES.length - 1]) {
          continue
        }
      }
    }

    if (!outline) {
      throw lastError || new Error('No se pudo procesar el chunk')
    }

    logEvent('mentalOutline.chunk.response', {
      source: source || lawName,
      from: firstPage,
      to: lastPage,
      titulos: Array.isArray(outline?.titulos) ? outline.titulos.length : 0
    })

    // Transformar la estructura del modelo a la estructura esperada por el frontend
    const transformOutlineToFrontendFormat = (outline: any): any => {
      if (!outline || typeof outline !== 'object') return outline

      // Extraer ordinal de código (ej: "TÍTULO I" -> "I", "Artículo 1" -> "1")
      const extractOrdinal = (codigo: string): string => {
        if (!codigo || typeof codigo !== 'string') return '?'
        
        // Para títulos, capítulos, secciones: buscar después de la palabra clave
        // Ej: "TÍTULO I" -> "I", "TÍTULO PRELIMINAR" -> "PRELIMINAR", "CAPÍTULO II" -> "II"
        const tituloMatch = codigo.match(/T[ÍI]TULO\s+(PRELIMINAR|[IVXLCDM]+|\d+)/i)
        if (tituloMatch) return tituloMatch[1].toUpperCase()
        
        const capituloMatch = codigo.match(/CAP[ÍI]TULO\s+(PRELIMINAR|[IVXLCDM]+|\d+)/i)
        if (capituloMatch) return capituloMatch[1].toUpperCase()
        
        const seccionMatch = codigo.match(/SECCI[ÓO]N\s+(PRELIMINAR|[IVXLCDM]+|\d+|[PRIMERA|SEGUNDA|TERCERA|CUARTA|QUINTA|SEXTA|SÉPTIMA|OCTAVA|NOVENA|DÉCIMA]+)/i)
        if (seccionMatch) {
          const ord = seccionMatch[1].toUpperCase()
          // Convertir números ordinales en texto a números romanos simples
          if (/PRIMERA|PRIMERO|1/i.test(ord)) return 'I'
          if (/SEGUNDA|SEGUNDO|2/i.test(ord)) return 'II'
          if (/TERCERA|TERCERO|3/i.test(ord)) return 'III'
          if (/CUARTA|CUARTO|4/i.test(ord)) return 'IV'
          if (/QUINTA|QUINTO|5/i.test(ord)) return 'V'
          return ord
        }
        
        // Para artículos: extraer el número
        // Ej: "Artículo 1" -> "1", "Artículo 11 bis" -> "11"
        const articuloMatch = codigo.match(/Art[ÍI]culo\s+(\d+)(?:\s|\.|$)/i)
        if (articuloMatch) return articuloMatch[1]
        
        // Para disposiciones: extraer el número/ordinal
        const disposicionMatch = codigo.match(/(?:primera|segunda|tercera|cuarta|quinta|sexta|séptima|octava|novena|décima|\d+)/i)
        if (disposicionMatch) {
          const ord = disposicionMatch[1].toUpperCase()
          if (/PRIMERA|PRIMERO|1/i.test(ord)) return '1'
          if (/SEGUNDA|SEGUNDO|2/i.test(ord)) return '2'
          if (/TERCERA|TERCERO|3/i.test(ord)) return '3'
          if (/CUARTA|CUARTO|4/i.test(ord)) return '4'
          if (/QUINTA|QUINTO|5/i.test(ord)) return '5'
          return ord
        }
        
        // Fallback: buscar cualquier número romano o número al final
        const fallbackMatch = codigo.match(/(PRELIMINAR|[IVXLCDM]+|\d+)$/i)
        return fallbackMatch ? fallbackMatch[1].toUpperCase() : '?'
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

      // Preservar front_matter del modelo (especialmente preambulo con su página del índice)
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

          // Transformar artículos sin capítulo (solo página de inicio del índice)
          const articulos = (titulo.articulos_sin_capitulo || []).map((art: any) => ({
            numero: art.numero_articulo || art.numero || '?',
            articulo_texto: art.rubrica_articulo || art.articulo_texto || '',
            texto_completo: art.texto_articulo || art.texto_completo || null,
            pagina_articulo: art.pagina_inicio_articulo || art.pagina_articulo || 0,
            pages: pagesFromInicio(art.pagina_inicio_articulo), // Solo página de inicio
            anchor: generateAnchor('art', extractOrdinal(art.numero_articulo || art.numero || ''))
          }))

          // Transformar capítulos (solo página de inicio del índice)
          const capitulos = (titulo.capitulos || []).map((cap: any) => {
            const capOrdinal = extractOrdinal(cap.codigo_capitulo || '')
            const capPages = pagesFromInicio(cap.pagina_inicio_capitulo) // Solo página de inicio

            // Transformar artículos sin sección (solo página de inicio del índice)
            const capArticulos = (cap.articulos_sin_seccion || []).map((art: any) => ({
              numero: art.numero_articulo || art.numero || '?',
              articulo_texto: art.rubrica_articulo || art.articulo_texto || '',
              texto_completo: art.texto_articulo || art.texto_completo || null,
              pagina_articulo: art.pagina_inicio_articulo || art.pagina_articulo || 0,
              pages: pagesFromInicio(art.pagina_inicio_articulo), // Solo página de inicio
              anchor: generateAnchor('art', extractOrdinal(art.numero_articulo || art.numero || ''))
            }))

            // Transformar secciones (solo página de inicio del índice)
            const secciones = (cap.secciones || []).map((sec: any) => {
              const secOrdinal = extractOrdinal(sec.codigo_seccion || '')
              const secPages = pagesFromInicio(sec.pagina_inicio_seccion) // Solo página de inicio

              const secArticulos = (sec.articulos || []).map((art: any) => ({
                numero: art.numero_articulo || art.numero || '?',
                articulo_texto: art.rubrica_articulo || art.articulo_texto || '',
                texto_completo: art.texto_articulo || art.texto_completo || null,
                pagina_articulo: art.pagina_inicio_articulo || art.pagina_articulo || 0,
                pages: pagesFromInicio(art.pagina_inicio_articulo), // Solo página de inicio
                anchor: generateAnchor('art', extractOrdinal(art.numero_articulo || art.numero || ''))
              }))

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
            pages: pagesFromInicio(dis.pagina_inicio_disposicion), // Solo página de inicio
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

    const transformedOutline = transformOutlineToFrontendFormat(outline)

    // Generar log detallado del chunk
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const logFileName = `mental-outline-chunk-${timestamp}.json`
      const logsDir = join(process.cwd(), 'logs')
      
      // Asegurar que el directorio existe
      try {
        await mkdir(logsDir, { recursive: true })
      } catch (err: any) {
        // Ignorar si ya existe
        if (err.code !== 'EEXIST') {
          console.error('Error creando directorio logs:', err)
        }
      }

      const logData = {
        timestamp: new Date().toISOString(),
        source: source || lawName,
        pagesRange: [firstPage, lastPage],
        schemaPrev: schema,
        schemaAcumuladoRaw: outline, // Respuesta raw del modelo
        schemaAcumuladoSanitized: transformedOutline, // Después de transformación
        mergedOutline: transformedOutline // Mismo que sanitized (el merge se hace en el frontend)
      }

      const logPath = join(logsDir, logFileName)
      await writeFile(logPath, JSON.stringify(logData, null, 2), 'utf-8')
      
      logEvent('mentalOutline.chunk.log', {
        source: source || lawName,
        from: firstPage,
        to: lastPage,
        logFile: logFileName
      })
    } catch (logError: any) {
      // No fallar si el log no se puede escribir
      console.error('Error escribiendo log detallado:', logError)
    }

    // Devolver el outline transformado y el índice para que el cliente lo guarde y reenvíe
    return NextResponse.json({
      ok: true,
      outline: transformedOutline,
      indice: indiceText, // Índice detectado o recibido (para que el cliente lo guarde y reenvíe)
    })
  } catch (error: any) {
    logEvent('mentalOutline.chunk.error', {
      error: error.message || String(error),
      stack: error.stack
    })
    return NextResponse.json(
      { ok: false, error: error.message || 'Error procesando chunk' },
      { status: 500 }
    )
  }
}
