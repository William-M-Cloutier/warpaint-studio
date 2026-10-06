import type { BackdropChoice } from '../types'
import { normalizeHex } from './color'

export const BACKDROP_PRESETS: readonly { id: Exclude<BackdropChoice, 'custom'>; label: string; color: string | null }[] = [
  { id: 'checker', label: 'Checker', color: null },
  { id: 'black', label: 'Black', color: '#000000' },
  { id: 'grey', label: 'Grey', color: '#8a8a8a' },
  { id: 'white', label: 'White', color: '#f4f4f4' },
  { id: 'green', label: 'Green', color: '#00b140' },
]

/** Solid viewing colour, or null for the checkerboard. Not a paint layer. */
export function backdropCssColor(choice: BackdropChoice, custom: string): string | null {
  if (choice === 'checker') return null
  if (choice === 'custom') return normalizeHex(custom) ?? '#3a3a3a'
  return BACKDROP_PRESETS.find((entry) => entry.id === choice)?.color ?? null
}
