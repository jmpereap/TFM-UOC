'use client';

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

export function useAuth() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null)
  const [username, setUsername] = useState<string | null>(null)
  const router = useRouter()

  useEffect(() => {
    // Verificar autenticación desde localStorage
    const authStatus = localStorage.getItem('isAuthenticated')
    const storedUsername = localStorage.getItem('username')
    
    if (authStatus === 'true') {
      setIsAuthenticated(true)
      setUsername(storedUsername)
    } else {
      setIsAuthenticated(false)
    }
  }, [])

  const login = (user: string) => {
    localStorage.setItem('isAuthenticated', 'true')
    localStorage.setItem('username', user)
    setIsAuthenticated(true)
    setUsername(user)
  }

  const logout = () => {
    localStorage.removeItem('isAuthenticated')
    localStorage.removeItem('username')
    setIsAuthenticated(false)
    setUsername(null)
    router.push('/login')
  }

  return {
    isAuthenticated,
    username,
    login,
    logout,
  }
}







