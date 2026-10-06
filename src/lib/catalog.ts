import {
  LINE_NOTES,
  PAINTS,
  RANGE_LABEL,
  type CatalogPaint,
  type PaintRangeId,
} from '../data/paints'

export type { CatalogPaint, PaintCoverage, PaintFinish, PaintRangeId } from '../data/paints'
export { LINE_NOTES, PAINTS, RANGE_LABEL }

const BY_ID = new Map<string, CatalogPaint>(PAINTS.map((paint) => [paint.id, paint]))

export function paintById(id: string): CatalogPaint | null {
  return BY_ID.get(id) ?? null
}

export function similarPaints(paint: CatalogPaint): CatalogPaint[] {
  const found: CatalogPaint[] = []
  for (const id of paint.similar) {
    const other = BY_ID.get(id)
    if (other) found.push(other)
  }
  return found
}

export function lineNote(paint: CatalogPaint): string {
  return LINE_NOTES[`${paint.range}:${paint.line}`] ?? ''
}

export function filterPaints(query: string, range: PaintRangeId | 'all'): CatalogPaint[] {
  const needle = query.trim().toLowerCase()
  return PAINTS.filter((paint) => {
    if (range !== 'all' && paint.range !== range) return false
    if (!needle) return true
    const haystack = [
      paint.name,
      paint.line,
      paint.code,
      paint.note,
      paint.finish,
      paint.coverage,
      RANGE_LABEL[paint.range],
    ]
      .join(' ')
      .toLowerCase()
    return haystack.includes(needle)
  })
}

export function channels(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16)
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255]
}
