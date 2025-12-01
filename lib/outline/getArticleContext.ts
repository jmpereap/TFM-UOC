import type { MentalOutline, Articulo, Titulo, Capitulo, Seccion } from '@/types/mentalOutline'

export type ArticleContext = {
  titulo: {
    codigo?: string
    subtitulo?: string
    ordinal?: string
  } | null
  capitulo: {
    codigo?: string
    subtitulo?: string
    ordinal?: string
  } | null
  seccion: {
    codigo?: string
    subtitulo?: string
    ordinal?: string
  } | null
}

/**
 * Obtiene el contexto jerárquico de un artículo navegando hacia arriba en el mentalOutline
 * @param mentalOutline - Estructura completa del esquema mental
 * @param articleAnchor - Anchor del artículo a buscar
 * @returns Contexto jerárquico (título, capítulo, sección) o null si no se encuentra
 */
export function getArticleContext(
  mentalOutline: MentalOutline,
  articleAnchor: string
): ArticleContext | null {
  // Buscar el artículo en todos los títulos
  for (const titulo of mentalOutline.titulos) {
    // Buscar en artículos directos del título
    if (titulo.articulos_sin_capitulo) {
      for (const art of titulo.articulos_sin_capitulo) {
        if (art.anchor === articleAnchor) {
          return {
            titulo: {
              codigo: titulo.codigo_titulo,
              subtitulo: titulo.subtitulo_titulo,
              ordinal: titulo.ordinal,
            },
            capitulo: null,
            seccion: null,
          }
        }
      }
    }

    // Buscar en capítulos
    for (const capitulo of titulo.capitulos) {
      // Buscar en artículos directos del capítulo
      if (capitulo.articulos_sin_seccion) {
        for (const art of capitulo.articulos_sin_seccion) {
          if (art.anchor === articleAnchor) {
            return {
              titulo: {
                codigo: titulo.codigo_titulo,
                subtitulo: titulo.subtitulo_titulo,
                ordinal: titulo.ordinal,
              },
              capitulo: {
                codigo: capitulo.codigo_capitulo,
                subtitulo: capitulo.subtitulo_capitulo,
                ordinal: capitulo.ordinal,
              },
              seccion: null,
            }
          }
        }
      }

      // Buscar en secciones
      for (const seccion of capitulo.secciones) {
        for (const art of seccion.articulos) {
          if (art.anchor === articleAnchor) {
            return {
              titulo: {
                codigo: titulo.codigo_titulo,
                subtitulo: titulo.subtitulo_titulo,
                ordinal: titulo.ordinal,
              },
              capitulo: {
                codigo: capitulo.codigo_capitulo,
                subtitulo: capitulo.subtitulo_capitulo,
                ordinal: capitulo.ordinal,
              },
              seccion: {
                codigo: seccion.codigo_seccion,
                subtitulo: seccion.subtitulo_seccion,
                ordinal: seccion.ordinal,
              },
            }
          }
        }
      }
    }
  }

  // Si no se encuentra, devolver null
  return null
}

