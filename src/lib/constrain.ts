import type { Point } from './paint'

/** Where a shift-constrained segment starts in the point list. */
export type LineLock = {
  index: number
  anchor: Point
}

/**
 * Eight axes, unit length. Horizontal and vertical are exact so a level
 * drag does not pick up a float slant from cos(π/2).
 */
const AXES: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [Math.SQRT1_2, Math.SQRT1_2],
  [0, 1],
  [-Math.SQRT1_2, Math.SQRT1_2],
  [-1, 0],
  [-Math.SQRT1_2, -Math.SQRT1_2],
  [0, -1],
  [Math.SQRT1_2, -Math.SQRT1_2],
]

/**
 * Nearest horizontal, vertical, or 45° line through the anchor.
 * The end is the pointer projected onto that axis, so it stays in line
 * with the cursor. Keeping the raw drag length instead puts the end
 * further along the axis than the pointer, and the stroke skims past it.
 */
export function constrainLine(anchor: Point, point: Point): Point {
  const dx = point.x - anchor.x
  const dy = point.y - anchor.y
  if (dx * dx + dy * dy < 1e-8) return { x: anchor.x, y: anchor.y }
  let ux = AXES[0][0]
  let uy = AXES[0][1]
  let along = -Infinity
  for (let i = 0; i < AXES.length; i += 1) {
    const dot = dx * AXES[i][0] + dy * AXES[i][1]
    if (dot > along) {
      along = dot
      ux = AXES[i][0]
      uy = AXES[i][1]
    }
  }
  return {
    x: anchor.x + ux * along,
    y: anchor.y + uy * along,
  }
}

function near(a: Point, b: Point): boolean {
  return Math.abs(a.x - b.x) < 0.05 && Math.abs(a.y - b.y) < 0.05
}

/**
 * Freehand appends a point. Shift replaces the gesture with one straight
 * segment from the pointer-down origin to the projected pointer.
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
    const end = constrainLine(anchor, point)
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
