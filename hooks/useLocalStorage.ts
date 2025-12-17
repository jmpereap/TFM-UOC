import { useEffect, useState } from 'react'

export function useLocalStorage<T>(key: string, initial: T) {
  // Siempre usar el valor inicial en el servidor para evitar problemas de hidratación
  const [value, setValue] = useState<T>(initial)
  const [isMounted, setIsMounted] = useState(false)

  // Sincronizar con localStorage solo después del montaje en el cliente
  useEffect(() => {
    setIsMounted(true)
    try {
      const raw = window.localStorage.getItem(key)
      if (raw) {
        setValue(JSON.parse(raw) as T)
      }
    } catch {
      // Ignorar errores de parseo
    }
  }, [key])

  // Guardar en localStorage cuando cambia el valor (solo en cliente)
  useEffect(() => {
    if (isMounted) {
      try {
        window.localStorage.setItem(key, JSON.stringify(value))
      } catch {
        // Ignorar errores de escritura
      }
    }
  }, [key, value, isMounted])

  return [value, setValue] as const
}
















