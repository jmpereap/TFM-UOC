import { NextRequest, NextResponse } from 'next/server'
import { logEvent } from '@/lib/logging/logger'
import type { MentalOutline } from '@/types/mentalOutline'
import { getArticleContext } from '@/lib/outline/getArticleContext'
import { formatFiche } from '@/lib/outline/formatFiche'

export const runtime = 'nodejs'

/**
 * Endpoint para generar una ficha de artículo
 * Recibe: articleAnchor, lawName, mentalOutline, articleData
 * Devuelve: ficha formateada como texto
 */
export async function POST(req: NextRequest) {
  try {
    const payload = await req.json()
    const { articleAnchor, lawName, mentalOutline, articleData } = payload

    // Log detallado de lo que llega
    logEvent('mentalOutline.fiche.request', {
      articleAnchor,
      lawName,
      lawNameType: typeof lawName,
      lawNameLength: lawName?.length || 0,
      lawNameIsEmpty: !lawName || lawName.trim() === '',
      hasMentalOutline: !!mentalOutline,
      hasMetadata: !!mentalOutline?.metadata,
      metadataSource: mentalOutline?.metadata?.source,
      metadataDocumentTitle: mentalOutline?.metadata?.document_title,
      metadataKeys: mentalOutline?.metadata ? Object.keys(mentalOutline.metadata) : [],
    })

    // Validar parámetros requeridos
    if (!articleAnchor) {
      return NextResponse.json(
        { ok: false, error: 'articleAnchor es requerido' },
        { status: 400 }
      )
    }

    if (!mentalOutline) {
      return NextResponse.json(
        { ok: false, error: 'mentalOutline es requerido' },
        { status: 400 }
      )
    }

    if (!articleData) {
      return NextResponse.json(
        { ok: false, error: 'articleData es requerido' },
        { status: 400 }
      )
    }

    // Obtener el contexto jerárquico del artículo
    const context = getArticleContext(mentalOutline, articleAnchor)

    // Extraer datos del artículo
    const articleNumber = articleData.numero_articulo || articleData.numero || '—'
    const articleRubrica = articleData.rubrica_articulo || articleData.articulo_texto || ''
    // Priorizar texto_completo, luego texto_articulo, y si no hay ninguno, usar resumen como fallback
    const articleText = articleData.texto_completo || articleData.texto_articulo || articleData.resumen || ''

    // Obtener el nombre del documento: usar lawName si está disponible y no está vacío, si no usar source del metadata, o document_title
    // Limpiar lawName: eliminar comillas dobles si está envuelto en ellas, y espacios
    let cleanedLawName = lawName
    if (cleanedLawName && typeof cleanedLawName === 'string') {
      cleanedLawName = cleanedLawName.trim()
      // Si está envuelto en comillas dobles, eliminarlas
      if ((cleanedLawName.startsWith('"') && cleanedLawName.endsWith('"')) || 
          (cleanedLawName.startsWith('"') && cleanedLawName.endsWith('"'))) {
        cleanedLawName = cleanedLawName.slice(1, -1).trim()
      }
    }
    
    // Verificar si lawName es válido (no vacío y no solo comillas)
    const isValidLawName = cleanedLawName && cleanedLawName !== '' && cleanedLawName !== '""' && cleanedLawName !== "''"
    let documentName = isValidLawName ? cleanedLawName : ''
    
    logEvent('mentalOutline.fiche.documentName.before', {
      lawName,
      lawNameType: typeof lawName,
      cleanedLawName,
      isValidLawName,
      documentNameBefore: documentName,
      hasMetadata: !!mentalOutline?.metadata,
      metadataSource: mentalOutline?.metadata?.source,
      metadataDocumentTitle: mentalOutline?.metadata?.document_title,
    })
    
    if (!documentName || documentName === '' || documentName === '""' || documentName === "''") {
      // Intentar obtener del metadata del esquema mental
      // Priorizar document_title sobre source
      if (mentalOutline?.metadata?.document_title && mentalOutline.metadata.document_title.trim() !== '') {
        documentName = mentalOutline.metadata.document_title.trim()
        logEvent('mentalOutline.fiche.documentName.from_document_title', {
          documentName,
          documentTitle: mentalOutline.metadata.document_title,
        })
      } else if (mentalOutline?.metadata?.source && mentalOutline.metadata.source.trim() !== '') {
        documentName = mentalOutline.metadata.source.trim()
        logEvent('mentalOutline.fiche.documentName.from_source', {
          documentName,
          source: mentalOutline.metadata.source,
        })
      } else {
        documentName = 'Documento sin título'
        logEvent('mentalOutline.fiche.documentName.fallback', {
          documentName,
        })
      }
    } else {
      logEvent('mentalOutline.fiche.documentName.from_lawName', {
        documentName,
        lawName,
        cleanedLawName,
      })
    }

    logEvent('mentalOutline.fiche.data', {
      articleAnchor,
      articleNumber,
      hasRubrica: !!articleRubrica,
      rubricaLength: articleRubrica.length,
      hasText: !!articleText,
      textLength: articleText.length,
      articleDataKeys: Object.keys(articleData),
      lawName,
      lawNameType: typeof lawName,
      lawNameValue: JSON.stringify(lawName),
      documentName,
      documentNameFinal: documentName,
      hasMetadata: !!mentalOutline?.metadata,
      metadataSource: mentalOutline?.metadata?.source,
      metadataDocumentTitle: mentalOutline?.metadata?.document_title,
    })

    // Formatear la ficha
    const fiche = formatFiche({
      lawName: documentName, // Usar documentName en lugar de lawName
      context,
      articleNumber,
      articleRubrica,
      articleText,
    })

    logEvent('mentalOutline.fiche.generated', {
      articleAnchor,
      lawName,
      hasContext: !!context,
      hasText: !!articleText,
      textLength: articleText.length,
      ficheLength: fiche.length,
      fichePreview: fiche.substring(0, 200),
    })

    return NextResponse.json({
      ok: true,
      fiche,
      format: 'text',
    })
  } catch (error: any) {
    logEvent('mentalOutline.fiche.error', {
      error: error.message || String(error),
    })

    return NextResponse.json(
      { ok: false, error: error.message || 'Error generando ficha' },
      { status: 500 }
    )
  }
}

