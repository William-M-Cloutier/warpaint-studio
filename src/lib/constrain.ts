import type { Point } from './paint'

/** Where a shift-constrained segment starts in the point list. */
export type LineLock = {
  index: number
  anchor: Point
}

/** Snap the segment to the nearest 45° so Shift draws a straight line. */
export function constrainLine(anchor: Point, point: Point): Point {
  const dx = point.x - anchor.x
  const dy = point.y - anchor.y
  const dist = Math.hypot(dx, dy)
  if (dist < 1e-4) return { x: anchor.x, y: anchor.y }
  const step = Math.PI / 4
  const snapped = Math.round(Math.atan2(dy, dx) / step) * step
  return {
    x: anchor.x + Math.cos(snapped) * dist,
    y: anchor.y + Math.sin(snapped) * dist,
  }
}

/**
 * Freehand appends a point. Shift replaces everything after the anchor with
 * one straight end, so the stroke does not keep the curve drawn before the key.
 */
export function extendStroke(
  points: Point[],
  line: LineLock | null,
  point: Point,
  shiftKey: boolean,
): { line: LineLock | null; changed: boolean } {
  if (points.length === 0) return { line, changed: false }
  if (shiftKey) {
    const lock = line ?? {
      index: points.length - 1,
      anchor: { x: points[points.length - 1].x, y: points[points.length - 1].y },
    }
    const end = constrainLine(lock.anchor, point)
    const endIndex = lock.index + 1
    if (points.length > endIndex + 1) points.length = endIndex + 1
    if (points.length === endIndex) {
      points.push(end)
      return { line: lock, changed: true }
    }
    const prev = points[endIndex]
    if (Math.abs(prev.x - end.x) < 0.05 && Math.abs(prev.y - end.y) < 0.05) return { line: lock, changed: false }
    points[endIndex] = end
    return { line: lock, changed: true }
  }
  const last = points[points.length - 1]
  const dx = point.x - last.x
  const dy = point.y - last.y
  if (dx * dx + dy * dy < 0.36) return { line: null, changed: false }
  points.push(point)
  return { line: null, changed: true }
}
