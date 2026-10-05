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

/**
 * Composite a straight-alpha paint pixel over an opaque photo pixel.
 * Canvas getImageData uses straight alpha, so the paint RGB is the stroke color.
 */
export function compositeHex(paint: Uint8ClampedArray, base: Uint8ClampedArray): string {
  const alpha = paint[3] / 255
  if (alpha <= 0.02) return rgbToHex(base[0], base[1], base[2])
  const blend = (paintChannel: number, baseChannel: number) =>
    paintChannel * alpha + baseChannel * (1 - alpha)
  return rgbToHex(blend(paint[0], base[0]), blend(paint[1], base[1]), blend(paint[2], base[2]))
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
