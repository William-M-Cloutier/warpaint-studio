import { useCallback, useEffect, useState } from 'react'
import { createId } from '../lib/color'
import { loadSchemes, saveSchemes } from '../lib/storage'
import type { ColorScheme, SchemeColor } from '../types'

export function useSchemes() {
  const [schemes, setSchemes] = useState<ColorScheme[]>(() => loadSchemes())

  useEffect(() => {
    saveSchemes(schemes)
  }, [schemes])

  const saveScheme = useCallback((name: string, colors: SchemeColor[]) => {
    const trimmed = name.trim()
    setSchemes((current) => {
      const existing = current.find((scheme) => scheme.name.toLowerCase() === trimmed.toLowerCase())
      const next: ColorScheme = {
        id: existing?.id ?? createId(),
        name: trimmed,
        colors: colors.map((entry) => ({ ...entry })),
        updatedAt: Date.now(),
      }
      return [next, ...current.filter((scheme) => scheme.id !== next.id)]
    })
  }, [])

  const deleteScheme = useCallback((id: string) => {
    setSchemes((current) => current.filter((scheme) => scheme.id !== id))
  }, [])

  return { schemes, saveScheme, deleteScheme }
}
