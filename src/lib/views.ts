import type { HistoryState, LoadedPhoto, PhotoState, SectionInfo } from '../types'

/** The four photos of one miniature. Front is the view a single upload uses. */
export const VIEW_SLOTS = [
  { id: 'front', label: 'Front Photo' },
  { id: 'back', label: 'Back Photo' },
  { id: 'side-l', label: 'Side L Photo' },
  { id: 'side-r', label: 'Side R Photo' },
] as const

export type ViewSlotId = (typeof VIEW_SLOTS)[number]['id']

const VIEW_SLOT_IDS = new Set<string>(VIEW_SLOTS.map((slot) => slot.id))

export function isViewSlotId(value: string | null | undefined): value is ViewSlotId {
  return !!value && VIEW_SLOT_IDS.has(value)
}

export function viewSlotById(id: ViewSlotId) {
  return VIEW_SLOTS.find((slot) => slot.id === id) ?? VIEW_SLOTS[0]
}

/** Paint, sections, cutout, and ridge edits that belong to one photo. */
export type ViewRecord = {
  image: LoadedPhoto | null
  history: HistoryState
  sections: SectionInfo[]
  activeSectionId: string | null
  cutoutActive: boolean
  contentScale: number
  ridgesActive: boolean
}

const EMPTY_HISTORY: HistoryState = { canUndo: false, canRedo: false, hasPaint: false }

export function blankView(): ViewRecord {
  return {
    image: null,
    history: EMPTY_HISTORY,
    sections: [],
    activeSectionId: null,
    cutoutActive: false,
    contentScale: 1,
    ridgesActive: false,
  }
}

export function createViews(): Record<ViewSlotId, ViewRecord> {
  return {
    front: blankView(),
    back: blankView(),
    'side-l': blankView(),
    'side-r': blankView(),
  }
}

export function withHistory(view: ViewRecord, next: HistoryState): ViewRecord {
  const current = view.history
  if (
    current.canUndo === next.canUndo &&
    current.canRedo === next.canRedo &&
    current.hasPaint === next.hasPaint
  ) {
    return view
  }
  return { ...view, history: next }
}

export function withPhoto(view: ViewRecord, photo: PhotoState): ViewRecord {
  if (view.contentScale === photo.contentScale && view.cutoutActive === photo.cutoutActive) return view
  return { ...view, contentScale: photo.contentScale, cutoutActive: photo.cutoutActive }
}

export function withRidges(view: ViewRecord, active: boolean): ViewRecord {
  if (view.ridgesActive === active) return view
  return { ...view, ridgesActive: active }
}

export function withSections(view: ViewRecord, sections: SectionInfo[], activeId: string | null): ViewRecord {
  if (view.activeSectionId === activeId && sameSections(view.sections, sections)) return view
  return { ...view, sections, activeSectionId: activeId }
}

function sameSections(current: SectionInfo[], next: SectionInfo[]): boolean {
  if (current.length !== next.length) return false
  for (let index = 0; index < current.length; index += 1) {
    const left = current[index]
    const right = next[index]
    if (
      left.id !== right.id ||
      left.name !== right.name ||
      left.color !== right.color ||
      left.category !== right.category ||
      left.customLabel !== right.customLabel ||
      left.visible !== right.visible ||
      left.locked !== right.locked
    ) {
      return false
    }
  }
  return true
}
