export type Tool = 'brush' | 'eraser' | 'eyedropper' | 'pan'

export type ThemeName = 'dark' | 'light'

export type LoadedPhoto = {
  url: string
  name: string
  width: number
  height: number
  element: HTMLImageElement
}

export type SchemeColor = {
  id: string
  hex: string
  label: string
}

export type ColorScheme = {
  id: string
  name: string
  colors: SchemeColor[]
  updatedAt: number
}

export type HistoryState = {
  canUndo: boolean
  canRedo: boolean
  hasPaint: boolean
}

export type StudioPrefs = {
  color: string
  recent: string[]
  brushSize: number
  opacity: number
}
