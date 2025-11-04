import { NextRequest, NextResponse } from 'next/server'
import { logEvent } from 'lib/logging/logger'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    logEvent('client_event', { route: '/api/log', payload: body })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}


