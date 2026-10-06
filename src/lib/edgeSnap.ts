import type { Point } from './paint'

/**
 * Soft stay-inside-lines assist.
 * Barriers are Canny ridges (after hand edits), the miniature silhouette, and
 * the active section mask. The stroke is nudged toward higher clearance.
 * A pointer that moves well past a ridge is left alone, so the assist hugs
 * instead of hard-clipping.
 */

export type SnapGrid = {
  /** Coarse cell size in photo pixels. */
  scale: number
  width: number
  height: number
  /** Distance to the nearest barrier, in photo pixels. */
  clearance: Float32Array
}

export const DEFAULT_SNAP_STRENGTH = 0.62

const FAR = 1e5
const INF = 1e7

export function snapMargin(brushPhotoPx: number): number {
  return clamp(brushPhotoPx * 0.38, 4, 22)
}

export function buildBarrierGrid(
  wall: Uint8Array,
  subject: Uint8Array,
  coarseWidth: number,
  coarseHeight: number,
  scale: number,
  fullWidth: number,
  fullHeight: number,
  sectionMask: Uint8Array | null,
): Uint8Array {
  const barrier = new Uint8Array(coarseWidth * coarseHeight)
  const useMask = sectionMask !== null && sectionMask.length === fullWidth * fullHeight
  for (let cy = 0; cy < coarseHeight; cy += 1) {
    for (let cx = 0; cx < coarseWidth; cx += 1) {
      const index = cy * coarseWidth + cx
      if (subject[index] === 0 || wall[index] !== 0) {
        barrier[index] = 1
        continue
      }
      if (useMask && sectionMask && !cellMostlyInside(sectionMask, fullWidth, fullHeight, cx, cy, scale)) {
        barrier[index] = 1
      }
    }
  }
  return barrier
}

export function gridFromBarriers(barrier: Uint8Array, width: number, height: number, scale: number): SnapGrid {
  return { scale: Math.max(1, scale), width, height, clearance: clearanceFromBarriers(barrier, width, height, scale) }
}

export function clearanceFromBarriers(
  barrier: Uint8Array,
  width: number,
  height: number,
  scale: number,
): Float32Array {
  const dist = new Float32Array(width * height)
  for (let i = 0; i < dist.length; i += 1) dist[i] = barrier[i] !== 0 ? 0 : INF
  const diag = Math.SQRT2
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x
      if (dist[index] === 0) continue
      let best = dist[index]
      if (x > 0) best = Math.min(best, dist[index - 1] + 1)
      if (y > 0) best = Math.min(best, dist[index - width] + 1)
      if (x > 0 && y > 0) best = Math.min(best, dist[index - width - 1] + diag)
      if (x + 1 < width && y > 0) best = Math.min(best, dist[index - width + 1] + diag)
      dist[index] = best
    }
  }
  for (let y = height - 1; y >= 0; y -= 1) {
    for (let x = width - 1; x >= 0; x -= 1) {
      const index = y * width + x
      if (dist[index] === 0) continue
      let best = dist[index]
      if (x + 1 < width) best = Math.min(best, dist[index + 1] + 1)
      if (y + 1 < height) best = Math.min(best, dist[index + width] + 1)
      if (x + 1 < width && y + 1 < height) best = Math.min(best, dist[index + width + 1] + diag)
      if (x > 0 && y + 1 < height) best = Math.min(best, dist[index + width - 1] + diag)
      dist[index] = best
    }
  }
  const cell = Math.max(1, scale)
  for (let i = 0; i < dist.length; i += 1) dist[i] = dist[i] >= INF * 0.5 ? FAR : dist[i] * cell
  return dist
}

/**
 * Nudge `next` inward when it is inside the margin of a barrier.
 * `strength` is 0..1. Zero leaves the point where the pointer put it.
 */
export function biasStrokePoint(
  grid: SnapGrid,
  prev: Point,
  next: Point,
  strength: number,
  margin: number,
): Point {
  if (!(strength > 0) || !(margin > 0)) return { x: next.x, y: next.y }
  const cNext = sampleClearance(grid, next.x, next.y)
  if (cNext >= margin) return { x: next.x, y: next.y }
  const step = Math.max(grid.scale, Math.min(8, margin))
  let grad = inward(grid, next.x, next.y, step)
  if (cNext <= grid.scale * 1.25) {
    const cPrev = sampleClearance(grid, prev.x, prev.y)
    const prevGrad = inward(grid, prev.x, prev.y, step)
    if (cPrev > cNext + 0.5 && prevGrad.mag > 0.35) grad = prevGrad
  }
  if (grad.mag < 0.2) return { x: next.x, y: next.y }
  const closeness = clamp(1 - cNext / margin, 0, 1)
  const shaped = closeness * closeness * (3 - 2 * closeness)
  const pull = margin * shaped * clamp(strength, 0, 1)
  return { x: next.x + grad.x * pull, y: next.y + grad.y * pull }
}

function cellMostlyInside(
  mask: Uint8Array,
  fullWidth: number,
  fullHeight: number,
  cx: number,
  cy: number,
  scale: number,
): boolean {
  const x0 = Math.min(fullWidth - 1, Math.max(0, Math.floor(cx * scale)))
  const y0 = Math.min(fullHeight - 1, Math.max(0, Math.floor(cy * scale)))
  const x1 = Math.min(fullWidth - 1, Math.max(x0, Math.floor((cx + 1) * scale) - 1))
  const y1 = Math.min(fullHeight - 1, Math.max(y0, Math.floor((cy + 1) * scale) - 1))
  const samples: Array<[number, number]> = [
    [x0, y0],
    [x1, y0],
    [x0, y1],
    [x1, y1],
    [Math.floor((x0 + x1) / 2), Math.floor((y0 + y1) / 2)],
  ]
  let inside = 0
  for (const [x, y] of samples) {
    if (mask[y * fullWidth + x] > 16) inside += 1
  }
  return inside * 2 >= samples.length
}

function sampleClearance(grid: SnapGrid, x: number, y: number): number {
  if (grid.width < 1 || grid.height < 1) return FAR
  const gx = clamp(x / grid.scale, 0, grid.width - 1)
  const gy = clamp(y / grid.scale, 0, grid.height - 1)
  const x0 = Math.floor(gx)
  const y0 = Math.floor(gy)
  const x1 = Math.min(grid.width - 1, x0 + 1)
  const y1 = Math.min(grid.height - 1, y0 + 1)
  const tx = gx - x0
  const ty = gy - y0
  const row0 = y0 * grid.width
  const row1 = y1 * grid.width
  const top = grid.clearance[row0 + x0] * (1 - tx) + grid.clearance[row0 + x1] * tx
  const bottom = grid.clearance[row1 + x0] * (1 - tx) + grid.clearance[row1 + x1] * tx
  return top * (1 - ty) + bottom * ty
}

function inward(grid: SnapGrid, x: number, y: number, step: number): { x: number; y: number; mag: number } {
  const left = sampleClearance(grid, x - step, y)
  const right = sampleClearance(grid, x + step, y)
  const up = sampleClearance(grid, x, y - step)
  const down = sampleClearance(grid, x, y + step)
  const gx = (right - left) / (2 * step)
  const gy = (down - up) / (2 * step)
  const mag = Math.hypot(gx, gy)
  if (mag < 1e-4) return { x: 0, y: 0, mag: 0 }
  return { x: gx / mag, y: gy / mag, mag }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}
