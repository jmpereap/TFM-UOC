import { NextRequest, NextResponse } from 'next/server'
import { logEvent } from '@/lib/logging/logger'
import type { MentalOutline } from '@/types/mentalOutline'
import { formatFicheDisposition } from '@/lib/outline/formatFicheDisposition'

export const runtime = 'nodejs'

/**
 * Endpoint para generar una ficha de disposición
 * Recibe: dispositionAnchor, lawName, mentalOutline, dispositionData, dispositionType
 * Devuelve: ficha formateada como texto
 */
export async function POST(req: NextRequest) {
  try {
    const payload = await req.json()
    const { dispositionAnchor, lawName, mentalOutline, dispositionData, dispositionType } = payload

    // Log detallado
    logEvent('mentalOutline.ficheDisposition.request', {
      dispositionAnchor,
      lawName,
      dispositionType,
      hasMentalOutline: !!mentalOutline,
      hasDispositionData: !!dispositionData,
    })

    // Validar parámetros requeridos
    if (!dispositionAnchor) {
      return NextResponse.json(
        { ok: false, error: 'dispositionAnchor es requerido' },
        { status: 400 }
      )
    }

    if (!mentalOutline) {
      return NextResponse.json(
        { ok: false, error: 'mentalOutline es requerido' },
        { status: 400 }
      )
    }

    if (!dispositionData) {
      return NextResponse.json(
        { ok: false, error: 'dispositionData es requerido' },
        { status: 400 }
      )
    }

    // Extraer datos de la disposición
    const dispositionNumber = dispositionData.numero_disposicion || dispositionData.numero || '—'
    const dispositionRubrica = dispositionData.rubrica_disposicion || dispositionData.texto_encabezado || ''
    // Priorizar fullText (de la IA), luego texto_completo, luego resumen como fallback
    const dispositionText = dispositionData.fullText || dispositionData.texto_completo || dispositionData.resumen || ''

    // Obtener el nombre del documento
    let cleanedLawName = lawName
    if (cleanedLawName && typeof cleanedLawName === 'string') {
      cleanedLawName = cleanedLawName.trim()
      if ((cleanedLawName.startsWith('"') && cleanedLawName.endsWith('"')) || 
          (cleanedLawName.startsWith('"') && cleanedLawName.endsWith('"'))) {
        cleanedLawName = cleanedLawName.slice(1, -1).trim()
      }
    }
    
    const isValidLawName = cleanedLawName && cleanedLawName !== '' && cleanedLawName !== '""' && cleanedLawName !== "''"
    let documentName = isValidLawName ? cleanedLawName : ''
    
    if (!documentName || documentName === '' || documentName === '""' || documentName === "''") {
      if (mentalOutline?.metadata?.document_title && mentalOutline.metadata.document_title.trim() !== '') {
        documentName = mentalOutline.metadata.document_title.trim()
      } else if (mentalOutline?.metadata?.source && mentalOutline.metadata.source.trim() !== '') {
        documentName = mentalOutline.metadata.source.trim()
      } else {
        documentName = 'Documento sin título'
      }
    }

    logEvent('mentalOutline.ficheDisposition.data', {
      dispositionAnchor,
      dispositionNumber,
      hasRubrica: !!dispositionRubrica,
      hasText: !!dispositionText,
      textLength: dispositionText.length,
      documentName,
      dispositionType,
    })

    // Formatear la ficha
    const fiche = formatFicheDisposition({
      lawName: documentName,
      dispositionNumber,
      dispositionRubrica,
      dispositionText,
      dispositionType: dispositionType || 'adicionales',
    })

    logEvent('mentalOutline.ficheDisposition.generated', {
      dispositionAnchor,
      hasText: !!dispositionText,
      textLength: dispositionText.length,
      ficheLength: fiche.length,
      fichePreview: fiche.substring(0, 200),
    })

    return NextResponse.json({
      ok: true,
      fiche,
      format: 'text',
    })
  } catch (error: any) {
    logEvent('mentalOutline.ficheDisposition.error', {
      error: error.message || String(error),
    })

    return NextResponse.json(
      { ok: false, error: error.message || 'Error generando ficha' },
      { status: 500 }
    )
  }
}

