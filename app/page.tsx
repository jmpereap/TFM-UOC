'use client';

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'

export default function HomePage() {
  const router = useRouter()
  const { isAuthenticated } = useAuth()

  useEffect(() => {
    if (isAuthenticated === false) {
      router.push('/login')
    } else if (isAuthenticated === true) {
      router.push('/generate')
    }
  }, [isAuthenticated, router])

  // Mostrar loading mientras se verifica la autenticación
  if (isAuthenticated === null) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-slate-600">Cargando...</div>
      </div>
    )
  }

  return null
}










