const HEX_6 = /^#?([0-9a-fA-F]{6})$/
const HEX_3 = /^#?([0-9a-fA-F]{3})$/

/** Accepts #RGB, #RRGGBB, and the same without a hash. Returns #rrggbb or null. */
export function normalizeHex(input: string): string | null {
  const trimmed = input.trim()
  const six = HEX_6.exec(trimmed)
  if (six) return `#${six[1].toLowerCase()}`
  const three = HEX_3.exec(trimmed)
  if (!three) return null
  const [r, g, b] = three[1]
  return `#${r}${r}${g}${g}${b}${b}`.toLowerCase()
}

export function rgbToHex(r: number, g: number, b: number): string {
  const channel = (value: number) =>
    Math.max(0, Math.min(255, Math.round(value)))
      .toString(16)
      .padStart(2, '0')
  return `#${channel(r)}${channel(g)}${channel(b)}`
}

export function displayHex(hex: string): string {
  return hex.toUpperCase()
}

export function createId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export function rememberColor(current: string[], hex: string, limit = 12): string[] {
  return [hex, ...current.filter((color) => color !== hex)].slice(0, limit)
}

export const STARTER_COLORS = [
  '#1a1c1f',
  '#8e1b1b',
  '#b08d57',
  '#cbbfa8',
  '#4d5d4a',
  '#315e72',
  '#6e4a6a',
  '#d7d4ce',
] as const

export const DEFAULT_COLOR = '#b08d57'
