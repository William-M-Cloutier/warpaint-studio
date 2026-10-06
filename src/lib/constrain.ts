import type { Point } from './paint'

/** Where a shift straight segment starts in the point list. */
export type LineLock = {
  index: number
  anchor: Point
}

function near(a: Point, b: Point): boolean {
  return Math.abs(a.x - b.x) < 0.05 && Math.abs(a.y - b.y) < 0.05
}

/**
 * Freehand appends a point. Shift replaces the gesture with one straight
 * segment from the pointer-down origin to the live pointer, in any direction.
 * Releasing Shift continues freehand from that tip. The tip is repeated
 * once so the smooth stroke does not bend the straight segment.
 */
export function extendStroke(
  points: Point[],
  line: LineLock | null,
  point: Point,
  shiftKey: boolean,
): { line: LineLock | null; changed: boolean } {
  if (points.length === 0) return { line, changed: false }
  if (shiftKey) {
    const anchor = points[0]
    const end = { x: point.x, y: point.y }
    const lock: LineLock = { index: 0, anchor: { x: anchor.x, y: anchor.y } }
    if (near(anchor, end)) {
      const changed = points.length !== 1
      if (changed) points.length = 1
      return { line: lock, changed }
    }
    const changed = points.length !== 2 || !near(points[1], end)
    if (!changed) return { line: lock, changed: false }
    points.length = 1
    points.push(end)
    return { line: lock, changed: true }
  }
  if (line && points.length >= 2) {
    const tip = points[points.length - 1]
    points.push({ x: tip.x, y: tip.y }, point)
    return { line: null, changed: true }
  }
  const last = points[points.length - 1]
  const dx = point.x - last.x
  const dy = point.y - last.y
  if (dx * dx + dy * dy < 0.36) return { line: null, changed: false }
  points.push(point)
  return { line: null, changed: true }
}
