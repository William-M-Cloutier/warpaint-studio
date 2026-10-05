export type Point = {
  x: number
  y: number
}

export type StrokeTool = 'brush' | 'eraser'

export type Stroke = {
  tool: StrokeTool
  color: string
  /** Width in photo pixels, captured when the stroke starts so zoom changes do not rewrite it. */
  size: number
  opacity: number
  points: Point[]
}

export type HistoryAction = { kind: 'stroke'; stroke: Stroke } | { kind: 'clear' }

export type Bounds = {
  x: number
  y: number
  w: number
  h: number
}

export const MAX_HISTORY = 200

export function projectActions(actions: readonly HistoryAction[]): {
  includeBase: boolean
  strokes: Stroke[]
} {
  let includeBase = true
  const strokes: Stroke[] = []
  for (const action of actions) {
    if (action.kind === 'clear') {
      includeBase = false
      strokes.length = 0
    } else {
      strokes.push(action.stroke)
    }
  }
  return { includeBase, strokes }
}

export function historyHasPaint(actions: readonly HistoryAction[], baseHasPixels: boolean): boolean {
  const projected = projectActions(actions)
  return projected.strokes.length > 0 || (projected.includeBase && baseHasPixels)
}

export function strokeBounds(stroke: Stroke): Bounds | null {
  if (stroke.points.length === 0) return null
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const point of stroke.points) {
    minX = Math.min(minX, point.x)
    minY = Math.min(minY, point.y)
    maxX = Math.max(maxX, point.x)
    maxY = Math.max(maxY, point.y)
  }
  const pad = stroke.size / 2 + 16
  return {
    x: Math.floor(minX - pad),
    y: Math.floor(minY - pad),
    w: Math.ceil(maxX - minX + pad * 2),
    h: Math.ceil(maxY - minY + pad * 2),
  }
}

export function clampBounds(bounds: Bounds, width: number, height: number): Bounds {
  const x = Math.max(0, bounds.x)
  const y = Math.max(0, bounds.y)
  const right = Math.min(width, bounds.x + bounds.w)
  const bottom = Math.min(height, bounds.y + bounds.h)
  return {
    x,
    y,
    w: Math.max(0, right - x),
    h: Math.max(0, bottom - y),
  }
}

export function unionBounds(a: Bounds, b: Bounds): Bounds {
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  const right = Math.max(a.x + a.w, b.x + b.w)
  const bottom = Math.max(a.y + a.h, b.y + b.h)
  return { x, y, w: right - x, h: bottom - y }
}

function traceSmooth(ctx: CanvasRenderingContext2D, points: readonly Point[]): void {
  ctx.beginPath()
  ctx.moveTo(points[0].x, points[0].y)
  if (points.length === 2) {
    ctx.lineTo(points[1].x, points[1].y)
    return
  }
  for (let index = 1; index < points.length - 1; index += 1) {
    const midX = (points[index].x + points[index + 1].x) / 2
    const midY = (points[index].y + points[index + 1].y) / 2
    ctx.quadraticCurveTo(points[index].x, points[index].y, midX, midY)
  }
  const last = points[points.length - 1]
  ctx.lineTo(last.x, last.y)
}

/** Draw one finished stroke. A full path (not overlapping dabs) keeps opacity even. */
export function paintStroke(ctx: CanvasRenderingContext2D, stroke: Stroke): void {
  if (stroke.points.length === 0 || stroke.size <= 0 || stroke.opacity <= 0) return
  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.lineWidth = stroke.size
  ctx.globalAlpha = stroke.opacity
  if (stroke.tool === 'eraser') {
    ctx.globalCompositeOperation = 'destination-out'
    ctx.strokeStyle = '#000000'
    ctx.fillStyle = '#000000'
  } else {
    ctx.globalCompositeOperation = 'source-over'
    ctx.strokeStyle = stroke.color
    ctx.fillStyle = stroke.color
  }
  if (stroke.points.length === 1) {
    const point = stroke.points[0]
    ctx.beginPath()
    ctx.arc(point.x, point.y, stroke.size / 2, 0, Math.PI * 2)
    ctx.fill()
  } else {
    traceSmooth(ctx, stroke.points)
    ctx.stroke()
  }
  ctx.restore()
}
