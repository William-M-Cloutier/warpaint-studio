import type { SectionCategory } from '../types'
import { selectRegion, suggestRegions } from './edgeSelect'

/**
 * Section masks are coverage maps the size of the photo.
 * Paint clips to the active mask. Selection itself lives in edgeSelect.
 */

export type MaskPoint = { x: number; y: number }

export const SECTION_PRESETS: readonly { id: SectionCategory; label: string }[] = [
  { id: 'armour', label: 'Armour plates' },
  { id: 'trim', label: 'Trim' },
  { id: 'undersuit', label: 'Undersuit / joints' },
  { id: 'details', label: 'Details' },
  { id: 'custom', label: 'Custom' },
]

export const SECTION_COLORS = [
  '#e0a15a',
  '#6ea8d4',
  '#e07a8a',
  '#7dba7a',
  '#c9b15a',
  '#b08ad4',
  '#5ec2c2',
  '#d4895a',
] as const

/** Default wand / suggest tolerance. Higher values cross fainter sculpt edges. */
export const DEFAULT_EDGE_TOLERANCE = 48

export function presetLabel(category: SectionCategory, customLabel: string): string {
  if (category === 'custom') return customLabel.trim()
  return SECTION_PRESETS.find((entry) => entry.id === category)?.label ?? ''
}

/** Multiply stamp alpha by the section mask and, when present, the cutout alpha. */
export function combineClipAlpha(
  rgba: Uint8ClampedArray,
  rectW: number,
  originX: number,
  originY: number,
  imageW: number,
  imageH: number,
  mask: Uint8Array,
  cutout: Uint8Array | null,
): void {
  if (rectW < 1) return
  const rectH = Math.floor(rgba.length / 4 / rectW)
  const useCutout = cutout !== null && cutout.length === mask.length
  for (let y = 0; y < rectH; y += 1) {
    const iy = originY + y
    const rowOutside = iy < 0 || iy >= imageH
    for (let x = 0; x < rectW; x += 1) {
      const o = (y * rectW + x) * 4 + 3
      if (rgba[o] === 0) continue
      const ix = originX + x
      if (rowOutside || ix < 0 || ix >= imageW) {
        rgba[o] = 0
        continue
      }
      const index = iy * imageW + ix
      let factor = mask[index] / 255
      if (useCutout && cutout) factor *= cutout[index] / 255
      if (factor >= 0.999) continue
      rgba[o] = factor <= 0 ? 0 : Math.round(rgba[o] * factor)
    }
  }
}

/**
 * Contiguous edge-aware wand. Grows across a plate and stops on a sculpt ridge.
 * Never includes pixels whose alpha is clear (the cutout / backdrop).
 */
export function floodMask(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  seedX: number,
  seedY: number,
  tolerance: number,
): { mask: Uint8Array; count: number } | null {
  return selectRegion(rgba, width, height, seedX, seedY, tolerance)
}

/**
 * Same edge field as the wand. Open areas between sculpt ridges become parts.
 * An empty result means the photo did not separate.
 */
export function proposeSectionMasks(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
): Uint8Array[] {
  return suggestRegions(rgba, width, height, DEFAULT_EDGE_TOLERANCE)
}

/** Even-odd fill of a freehand loop. Pixel centers decide what is inside. */
export function fillPolygon(
  width: number,
  height: number,
  points: readonly MaskPoint[],
): { mask: Uint8Array; count: number } {
  const mask = new Uint8Array(width * height)
  if (width < 1 || height < 1 || points.length < 3) return { mask, count: 0 }
  let minY = Infinity
  let maxY = -Infinity
  for (const point of points) {
    minY = Math.min(minY, point.y)
    maxY = Math.max(maxY, point.y)
  }
  const yStart = Math.max(0, Math.floor(minY))
  const yEnd = Math.min(height - 1, Math.ceil(maxY))
  const hits: number[] = []
  let count = 0
  for (let y = yStart; y <= yEnd; y += 1) {
    const scanY = y + 0.5
    hits.length = 0
    for (let i = 0; i < points.length; i += 1) {
      const a = points[i]
      const b = points[(i + 1) % points.length]
      if (a.y === b.y) continue
      const low = a.y < b.y ? a : b
      const high = a.y < b.y ? b : a
      if (scanY < low.y || scanY >= high.y) continue
      const t = (scanY - low.y) / (high.y - low.y)
      hits.push(low.x + t * (high.x - low.x))
    }
    hits.sort((left, right) => left - right)
    for (let i = 0; i + 1 < hits.length; i += 2) {
      const xStart = Math.max(0, Math.ceil(hits[i]))
      const xEnd = Math.min(width - 1, Math.floor(hits[i + 1]))
      const row = y * width
      for (let x = xStart; x <= xEnd; x += 1) {
        if (mask[row + x] === 255) continue
        mask[row + x] = 255
        count += 1
      }
    }
  }
  return { mask, count }
}

/**
 * Paint a coverage stamp into a mask. Add keeps the stronger value.
 * Subtract fades existing mask pixels by the stamp.
 * Returns whether any pixel changed.
 */
export function blitCoverage(
  mask: Uint8Array,
  imageW: number,
  imageH: number,
  coverage: Uint8Array,
  originX: number,
  originY: number,
  rectW: number,
  rectH: number,
  mode: 'add' | 'subtract',
): boolean {
  let changed = false
  for (let y = 0; y < rectH; y += 1) {
    const iy = originY + y
    if (iy < 0 || iy >= imageH) continue
    for (let x = 0; x < rectW; x += 1) {
      const ix = originX + x
      if (ix < 0 || ix >= imageW) continue
      const cover = coverage[y * rectW + x]
      if (cover === 0) continue
      const index = iy * imageW + ix
      const prev = mask[index]
      const next = mode === 'add' ? Math.max(prev, cover) : Math.round(prev * (1 - cover / 255))
      if (next === prev) continue
      mask[index] = next
      changed = true
    }
  }
  return changed
}
