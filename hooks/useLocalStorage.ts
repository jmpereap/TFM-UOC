'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

type SetStateAction<T> = T | ((prev: T) => T)

const isBrowser = () => typeof window !== 'undefined'

export function useLocalStorage<T>(key: string, initialValue: T) {
  const [value, setValue] = useState<T>(initialValue)
  const isMountedRef = useRef(false)

  useEffect(() => {
    if (!isBrowser()) return
    try {
      const raw = window.localStorage.getItem(key)
      if (raw !== null) {
        setValue(JSON.parse(raw))
      } else {
        window.localStorage.setItem(key, JSON.stringify(initialValue))
      }
    } catch {
      // Ignore parsing errors and fall back to the initial value
    }
    isMountedRef.current = true
  }, [initialValue, key])

  const updateValue = useCallback(
    (next: SetStateAction<T>) => {
      setValue((prev) => {
        const resolved = next instanceof Function ? next(prev) : next
        if (isBrowser()) {
          try {
            if (resolved === undefined) {
              window.localStorage.removeItem(key)
            } else {
              window.localStorage.setItem(key, JSON.stringify(resolved))
            }
          } catch {
            // Ignore quota or serialization errors
          }
        }
        return resolved
      })
    },
    [key]
  )

  useEffect(() => {
    if (!isBrowser() || !isMountedRef.current) return
    const handleStorage = (event: StorageEvent) => {
      if (event.key === key && event.storageArea === window.localStorage) {
        try {
          setValue(event.newValue ? JSON.parse(event.newValue) : initialValue)
        } catch {
          setValue(initialValue)
        }
      }
    }
    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [initialValue, key])

  return [value, updateValue] as const
}


