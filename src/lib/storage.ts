import { DEFAULT_COLOR, STARTER_COLORS, normalizeHex } from './color'
import type { BackdropChoice, ColorScheme, SchemeColor, StudioPrefs, ThemeName } from '../types'

export const THEME_KEY = 'warpaint-studio:theme'
export const SCHEMES_KEY = 'warpaint-studio:schemes:v1'
export const PREFS_KEY = 'warpaint-studio:prefs:v1'

function readRaw(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeRaw(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // The session still works if storage is blocked or full.
  }
}

export function loadTheme(): ThemeName {
  return readRaw(THEME_KEY) === 'light' ? 'light' : 'dark'
}

export function saveTheme(theme: ThemeName): void {
  writeRaw(THEME_KEY, theme)
}

function sanitizeColor(value: unknown): SchemeColor | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Partial<SchemeColor>
  const hex = typeof record.hex === 'string' ? normalizeHex(record.hex) : null
  if (!hex) return null
  return {
    id: typeof record.id === 'string' && record.id ? record.id : hex,
    hex,
    label: typeof record.label === 'string' ? record.label.slice(0, 40) : '',
  }
}

function sanitizeScheme(value: unknown): ColorScheme | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Partial<ColorScheme>
  if (typeof record.id !== 'string' || typeof record.name !== 'string' || !Array.isArray(record.colors)) {
    return null
  }
  const colors = record.colors.map(sanitizeColor).filter((color): color is SchemeColor => color !== null)
  if (!colors.length || !record.name.trim()) return null
  return {
    id: record.id,
    name: record.name.trim().slice(0, 60),
    colors,
    updatedAt: typeof record.updatedAt === 'number' ? record.updatedAt : Date.now(),
  }
}

export function loadSchemes(): ColorScheme[] {
  const raw = readRaw(SCHEMES_KEY)
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .map(sanitizeScheme)
      .filter((scheme): scheme is ColorScheme => scheme !== null)
      .sort((a, b) => b.updatedAt - a.updatedAt)
  } catch {
    return []
  }
}

export function saveSchemes(schemes: ColorScheme[]): void {
  writeRaw(SCHEMES_KEY, JSON.stringify(schemes))
}

const BACKDROPS = new Set<BackdropChoice>(['checker', 'black', 'grey', 'white', 'green', 'custom'])

export function defaultPrefs(): StudioPrefs {
  return {
    color: DEFAULT_COLOR,
    recent: [...STARTER_COLORS],
    brushSize: 28,
    opacity: 1,
    paintLook: 0,
    backdrop: 'checker',
    backdropColor: '#3a3a3a',
  }
}

export function loadPrefs(): StudioPrefs {
  const fallback = defaultPrefs()
  const raw = readRaw(PREFS_KEY)
  if (!raw) return fallback
  try {
    const parsed = JSON.parse(raw) as Partial<StudioPrefs>
    const color = typeof parsed.color === 'string' ? normalizeHex(parsed.color) : null
    const recent = Array.isArray(parsed.recent)
      ? parsed.recent
          .map((entry) => (typeof entry === 'string' ? normalizeHex(entry) : null))
          .filter((entry): entry is string => entry !== null)
          .slice(0, 12)
      : fallback.recent
    const brushSize =
      typeof parsed.brushSize === 'number' && parsed.brushSize >= 1 && parsed.brushSize <= 160
        ? parsed.brushSize
        : fallback.brushSize
    const opacity =
      typeof parsed.opacity === 'number' && parsed.opacity >= 0.05 && parsed.opacity <= 1
        ? parsed.opacity
        : fallback.opacity
    const paintLook =
      typeof parsed.paintLook === 'number' && parsed.paintLook >= 0 && parsed.paintLook <= 1
        ? parsed.paintLook
        : fallback.paintLook
    const backdrop =
      typeof parsed.backdrop === 'string' && BACKDROPS.has(parsed.backdrop as BackdropChoice)
        ? (parsed.backdrop as BackdropChoice)
        : fallback.backdrop
    const backdropColor =
      typeof parsed.backdropColor === 'string' ? normalizeHex(parsed.backdropColor) : null
    return {
      color: color ?? fallback.color,
      recent: recent.length ? recent : fallback.recent,
      brushSize,
      opacity,
      paintLook,
      backdrop,
      backdropColor: backdropColor ?? fallback.backdropColor,
    }
  } catch {
    return fallback
  }
}

export function savePrefs(prefs: StudioPrefs): void {
  writeRaw(PREFS_KEY, JSON.stringify(prefs))
}
