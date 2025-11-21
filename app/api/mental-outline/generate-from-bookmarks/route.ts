import { NextRequest, NextResponse } from 'next/server'
import { logEvent } from '@/lib/logging/logger'
import { convertBookmarksToMentalOutline, validateBookmarksStructure } from '@/lib/outline/bookmarksToOutline'
import type { BookmarkItem } from '@/lib/pdf/extractBookmarks'

export const runtime = 'nodejs'

/**
 * Endpoint para generar el esquema mental desde los bookmarks/marcadores del PDF
 * Este endpoint es independiente del método actual (generate-direct)
 */
export async function POST(req: NextRequest) {
  try {
    const payload = await req.json()
    const source = typeof payload?.source === 'string' ? payload.source : ''
    const lawName = typeof payload?.lawName === 'string' ? payload.lawName : ''
    const bookmarks = Array.isArray(payload?.bookmarks) ? payload.bookmarks : []

    if (!bookmarks || bookmarks.length === 0) {
      return NextResponse.json(
        { 
          ok: false, 
          error: 'No se proporcionaron bookmarks. Asegúrate de que el PDF tenga marcadores/bookmarks.' 
        },
        { status: 400 }
      )
    }

    logEvent('mentalOutline.generate.fromBookmarks.start', {
      source: source || lawName,
      bookmarksCount: bookmarks.length,
    })

    // Validar estructura de bookmarks
    const validation = validateBookmarksStructure(bookmarks as BookmarkItem[])
    
    logEvent('mentalOutline.generate.fromBookmarks.validation', {
      isValid: validation.isValid,
      hasTitulos: validation.hasTitulos,
      hasArticulos: validation.hasArticulos,
      tituloCount: validation.tituloCount,
      articuloCount: validation.articuloCount,
      totalItems: validation.totalItems,
      sampleTitles: (validation as any).sampleTitles || [],
    })

    // Si la validación falla pero hay muchos items, intentar convertir de todas formas
    // (puede que los patrones no detecten correctamente pero la estructura esté bien)
    if (!validation.isValid && validation.totalItems > 10) {
      // Si hay muchos items pero no se detectaron títulos/artículos, 
      // puede ser que los patrones sean demasiado estrictos
      // Intentar convertir de todas formas y ver qué sale
      logEvent('mentalOutline.generate.fromBookmarks.validation.warning', {
        message: 'Validación falló pero hay items. Intentando conversión de todas formas.',
        validation,
      })
    } else if (!validation.isValid) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Los bookmarks no tienen una estructura válida. No se encontraron Títulos ni Artículos.',
          validation,
        },
        { status: 400 }
      )
    }

    // Convertir bookmarks a MentalOutline
    const outline = convertBookmarksToMentalOutline(
      bookmarks as BookmarkItem[],
      source || lawName,
      lawName || source || 'Documento legal'
    )

    // Contar elementos generados
    const titulosCount = outline.titulos.length
    const totalArticulos = outline.titulos.reduce((acc, titulo) => {
      const articulosDirectos = titulo.articulos?.length || 0
      const articulosEnCapitulos = (titulo.capitulos || []).reduce((capAcc, cap) => {
        const articulosSinSeccion = cap.articulos?.length || 0
        const articulosEnSecciones = (cap.secciones || []).reduce(
          (secAcc, sec) => secAcc + (sec.articulos?.length || 0),
          0
        )
        return capAcc + articulosSinSeccion + articulosEnSecciones
      }, 0)
      return acc + articulosDirectos + articulosEnCapitulos
    }, 0)

    const totalCapitulos = outline.titulos.reduce(
      (acc, titulo) => acc + (titulo.capitulos?.length || 0),
      0
    )
    const totalSecciones = outline.titulos.reduce(
      (acc, titulo) =>
        acc +
        (titulo.capitulos || []).reduce(
          (capAcc, cap) => capAcc + (cap.secciones?.length || 0),
          0
        ),
      0
    )

    logEvent('mentalOutline.generate.fromBookmarks.success', {
      source: source || lawName,
      titulos: titulosCount,
      capitulos: totalCapitulos,
      secciones: totalSecciones,
      articulos: totalArticulos,
      validation,
      estructura: outline.titulos.map((t) => ({
        titulo: t.codigo_titulo || t.ordinal,
        capitulos: (t.capitulos || []).length,
        secciones: (t.capitulos || []).reduce(
          (acc, cap) => acc + (cap.secciones || []).length,
          0
        ),
        articulos:
          (t.articulos?.length || 0) +
          (t.capitulos || []).reduce((capAcc, cap) => {
            return (
              capAcc +
              (cap.articulos?.length || 0) +
              (cap.secciones || []).reduce(
                (secAcc, sec) => secAcc + (sec.articulos?.length || 0),
                0
              )
            )
          }, 0),
      })),
    })

    return NextResponse.json({
      ok: true,
      schema: outline,
      source: 'bookmarks',
      validation,
      stats: {
        titulos: titulosCount,
        capitulos: totalCapitulos,
        secciones: totalSecciones,
        articulos: totalArticulos,
      },
    })
  } catch (error: any) {
    logEvent('mentalOutline.generate.fromBookmarks.error', {
      error: error.message || String(error),
      stack: error.stack,
    })
    return NextResponse.json(
      {
        ok: false,
        error: error.message || 'Error generando esquema desde bookmarks',
      },
      { status: 500 }
    )
  }
}

