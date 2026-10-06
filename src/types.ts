export type Tool =
  | 'brush'
  | 'eraser'
  | 'eyedropper'
  | 'pan'
  | 'highlight'
  | 'restore'
  | 'eraseBackdrop'
  | 'wand'
  | 'lasso'
  | 'maskBrush'
  | 'edgeAdd'
  | 'edgeErase'

/** How a wand, lasso, or mask brush writes into a section. */
export type MaskMode = 'new' | 'add' | 'subtract'

export type SectionCategory = 'armour' | 'trim' | 'undersuit' | 'details' | 'custom'

export type SectionInfo = {
  id: string
  name: string
  color: string
  category: SectionCategory
  customLabel: string
  visible: boolean
  locked: boolean
}

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

/** Picture adjustments. View pan/zoom is not part of this. */
export type PhotoState = {
  /** 1 shows the photo at its pixel size before view zoom. */
  contentScale: number
  cutoutActive: boolean
}

/** Viewing backdrop behind a cutout. Checker is the default empty stage. */
export type BackdropChoice = 'checker' | 'black' | 'grey' | 'white' | 'green' | 'custom'

/** Which pigment Auto highlight lays on the ridges. */
export type HighlightPigment = 'lighter' | 'current'

export type StudioPrefs = {
  color: string
  recent: string[]
  brushSize: number
  opacity: number
  /** 0–1 of the 0–100 Look slider. 0 is the original tint. 1 is a light coat (old strength ~15). Opens at 0.6. */
  paintLook: number
  backdrop: BackdropChoice
  backdropColor: string
}
