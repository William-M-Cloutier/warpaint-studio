import type { Point } from './paint'

/**
 * Hand edits on top of the Canny ridge field.
 * Add forces a ridge. Erase suppresses one. A later stroke on the same pixel wins.
 * Wand, Suggest, and edge snap read the resolved masks.
 */

export type RidgeTool = 'add' | 'erase'

export type RidgeStroke = {
  tool: RidgeTool
  /** Width in photo pixels. */
  size: number
  points: Point[]
}

export type RidgeEdits = {
  add: Uint8Array
  erase: Uint8Array
}

type RidgeHist =
  | { kind: 'stroke'; stroke: RidgeStroke }
  | { kind: 'clear'; strokes: RidgeStroke[] }

export class RidgeLayer {
  width = 0
  height = 0
  private strokes: RidgeStroke[] = []
  private past: RidgeHist[] = []
  private future: RidgeHist[] = []
  readonly maps: RidgeEdits = { add: new Uint8Array(0), erase: new Uint8Array(0) }

  get pastCount(): number {
    return this.past.length
  }

  get hasEdits(): boolean {
    return this.strokes.length > 0
  }

  reset(width: number, height: number): void {
    this.width = Math.max(0, width)
    this.height = Math.max(0, height)
    this.strokes = []
    this.past = []
    this.future = []
    const count = this.width * this.height
    this.maps.add = new Uint8Array(count)
    this.maps.erase = new Uint8Array(count)
  }

  commit(stroke: RidgeStroke): boolean {
    if (this.width < 1 || this.height < 1 || stroke.points.length === 0 || stroke.size <= 0) return false
    stampRidge(this.maps, this.width, this.height, stroke)
    this.strokes.push(stroke)
    this.past.push({ kind: 'stroke', stroke })
    this.future = []
    return true
  }

  clear(): boolean {
    if (this.strokes.length === 0) return false
    const kept = this.strokes
    this.strokes = []
    this.blank()
    this.past.push({ kind: 'clear', strokes: kept })
    this.future = []
    return true
  }

  undo(): boolean {
    const edit = this.past.pop()
    if (!edit) return false
    if (edit.kind === 'stroke') this.strokes.pop()
    else this.strokes = edit.strokes
    this.replay()
    this.future.push(edit)
    return true
  }

  redo(): boolean {
    const edit = this.future.pop()
    if (!edit) return false
    if (edit.kind === 'stroke') this.strokes.push(edit.stroke)
    else this.strokes = []
    this.replay()
    this.past.push(edit)
    return true
  }

  abandonRedo(): void {
    this.future = []
  }

  dropOldest(): void {
    this.past.shift()
  }

  private blank(): void {
    this.maps.add.fill(0)
    this.maps.erase.fill(0)
  }

  private replay(): void {
    this.blank()
    for (const stroke of this.strokes) stampRidge(this.maps, this.width, this.height, stroke)
  }
}

/** Round stamp of one ridge stroke. Add and erase clear each other per pixel. */
export function stampRidge(maps: RidgeEdits, width: number, height: number, stroke: RidgeStroke): void {
  if (width < 1 || height < 1 || stroke.points.length === 0 || stroke.size <= 0) return
  const radius = Math.max(0.5, stroke.size / 2)
  const paint = (cx: number, cy: number) => {
    const tipX = Math.floor(cx)
    const tipY = Math.floor(cy)
    if (tipX >= 0 && tipY >= 0 && tipX < width && tipY < height) {
      const tip = tipY * width + tipX
      if (stroke.tool === 'add') {
        maps.add[tip] = 255
        maps.erase[tip] = 0
      } else {
        maps.erase[tip] = 255
        maps.add[tip] = 0
      }
    }
    const y0 = Math.max(0, Math.floor(cy - radius))
    const y1 = Math.min(height - 1, Math.ceil(cy + radius))
    const x0 = Math.max(0, Math.floor(cx - radius))
    const x1 = Math.min(width - 1, Math.ceil(cx + radius))
    const r2 = radius * radius
    for (let y = y0; y <= y1; y += 1) {
      const dy = y + 0.5 - cy
      const row = y * width
      for (let x = x0; x <= x1; x += 1) {
        const dx = x + 0.5 - cx
        if (dx * dx + dy * dy > r2) continue
        const index = row + x
        if (stroke.tool === 'add') {
          maps.add[index] = 255
          maps.erase[index] = 0
        } else {
          maps.erase[index] = 255
          maps.add[index] = 0
        }
      }
    }
  }
  paint(stroke.points[0].x, stroke.points[0].y)
  for (let i = 1; i < stroke.points.length; i += 1) {
    const from = stroke.points[i - 1]
    const to = stroke.points[i]
    const dist = Math.hypot(to.x - from.x, to.y - from.y)
    const steps = Math.max(1, Math.ceil(dist / Math.max(0.75, radius * 0.35)))
    for (let step = 1; step <= steps; step += 1) {
      const t = step / steps
      paint(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t)
    }
  }
}

/** Alpha of a stroke inside its bounds, for a live overlay preview. */
export function ridgeAlpha(
  width: number,
  height: number,
  stroke: RidgeStroke,
): { alpha: Uint8Array; x: number; y: number; w: number; h: number } | null {
  if (width < 1 || height < 1 || stroke.points.length === 0 || stroke.size <= 0) return null
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  const pad = stroke.size / 2 + 1
  for (const point of stroke.points) {
    minX = Math.min(minX, point.x)
    minY = Math.min(minY, point.y)
    maxX = Math.max(maxX, point.x)
    maxY = Math.max(maxY, point.y)
  }
  const x = Math.max(0, Math.floor(minX - pad))
  const y = Math.max(0, Math.floor(minY - pad))
  const right = Math.min(width, Math.ceil(maxX + pad))
  const bottom = Math.min(height, Math.ceil(maxY + pad))
  const w = right - x
  const h = bottom - y
  if (w < 1 || h < 1) return null
  const local: RidgeEdits = { add: new Uint8Array(w * h), erase: new Uint8Array(w * h) }
  const shifted: RidgeStroke = {
    tool: stroke.tool,
    size: stroke.size,
    points: stroke.points.map((point) => ({ x: point.x - x, y: point.y - y })),
  }
  stampRidge(local, w, h, shifted)
  return { alpha: stroke.tool === 'add' ? local.add : local.erase, x, y, w, h }
}
