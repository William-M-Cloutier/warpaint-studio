import { combineClipAlpha } from './sections'

export type Point = {
  x: number
  y: number
}

export type StrokeTool = 'brush' | 'eraser'

/**
 * Mask captured when a stroke starts. Later section edits replace the mask
 * array instead of writing into this one, so undo replays the original clip.
 */
export type StrokeClip = {
  mask: Uint8Array
  /** Photo alpha at stroke time, or null when no cutout is active. */
  cutout: Uint8Array | null
  width: number
  height: number
}

export type Stroke = {
  tool: StrokeTool
  color: string
  /** Width in photo pixels, captured when the stroke starts so zoom changes do not rewrite it. */
  size: number
  opacity: number
  points: Point[]
  /** Set when an active section limited this stroke. */
  clip?: StrokeClip
}

/** One coat of the current pigment inside a section mask. Shading happens at present time. */
export type SectionFill = {
  color: string
  opacity: number
  clip: StrokeClip
}

export type HistoryAction =
  | { kind: 'stroke'; stroke: Stroke }
  | { kind: 'fill'; fill: SectionFill }
  | { kind: 'clear' }

export type ReplayItem = { kind: 'stroke'; stroke: Stroke } | { kind: 'fill'; fill: SectionFill }

export type Bounds = {
  x: number
  y: number
  w: number
  h: number
}

export const MAX_HISTORY = 200

export function projectActions(actions: readonly HistoryAction[]): {
  includeBase: boolean
  items: ReplayItem[]
} {
  let includeBase = true
  const items: ReplayItem[] = []
  for (const action of actions) {
    if (action.kind === 'clear') {
      includeBase = false
      items.length = 0
    } else if (action.kind === 'stroke') items.push({ kind: 'stroke', stroke: action.stroke })
    else items.push({ kind: 'fill', fill: action.fill })
  }
  return { includeBase, items }
}

export function historyHasPaint(actions: readonly HistoryAction[], baseHasPixels: boolean): boolean {
  const projected = projectActions(actions)
  return projected.items.length > 0 || (projected.includeBase && baseHasPixels)
}

/** Coat strength for one pixel. Zero outside the section mask, and outside the cutout. */
export function sectionFillAlpha(mask: number, cutout: number | null, opacity: number): number {
  if (!(opacity > 0) || mask <= 0) return 0
  let factor = (mask / 255) * opacity
  if (cutout !== null) factor *= cutout / 255
  if (!(factor > 0)) return 0
  return Math.min(255, Math.round(255 * factor))
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
  if (stroke.clip) {
    paintClippedStroke(ctx, stroke)
    return
  }
  paintUnclippedStroke(ctx, stroke)
}

function paintUnclippedStroke(ctx: CanvasRenderingContext2D, stroke: Stroke): void {
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

/**
 * Paint the stroke into a stamp, then keep only the pixels inside the section
 * mask (and the cutout, when that stamp was captured). The stamp is drawn
 * back with source-over or destination-out so existing paint outside the
 * section is left alone.
 */
function paintClippedStroke(ctx: CanvasRenderingContext2D, stroke: Stroke): void {
  const clip = stroke.clip
  if (!clip || stroke.points.length === 0 || stroke.size <= 0 || stroke.opacity <= 0) return
  const bounds = strokeBounds(stroke)
  if (!bounds) return
  const region = clampBounds(bounds, clip.width, clip.height)
  if (region.w < 1 || region.h < 1) return
  const stamp = stampContext(region.w, region.h)
  if (!stamp) return
  stamp.setTransform(1, 0, 0, 1, 0, 0)
  stamp.clearRect(0, 0, region.w, region.h)
  stamp.save()
  stamp.translate(-region.x, -region.y)
  paintUnclippedStroke(stamp, stroke.tool === 'eraser' ? { ...stroke, tool: 'brush' } : stroke)
  stamp.restore()
  const image = stamp.getImageData(0, 0, region.w, region.h)
  combineClipAlpha(image.data, region.w, region.x, region.y, clip.width, clip.height, clip.mask, clip.cutout)
  stamp.putImageData(image, 0, 0)
  ctx.save()
  ctx.globalCompositeOperation = stroke.tool === 'eraser' ? 'destination-out' : 'source-over'
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(stamp.canvas, 0, 0, region.w, region.h, region.x, region.y, region.w, region.h)
  ctx.restore()
}

/** Write the pigment into the tint layer inside the section. Photo luminance shades it on present. */
export function paintSectionFill(ctx: CanvasRenderingContext2D, fill: SectionFill): void {
  const { clip, color, opacity } = fill
  if (clip.width < 1 || clip.height < 1 || !(opacity > 0)) return
  const stamp = stampContext(clip.width, clip.height)
  if (!stamp) return
  stamp.setTransform(1, 0, 0, 1, 0, 0)
  stamp.globalAlpha = 1
  stamp.globalCompositeOperation = 'source-over'
  stamp.clearRect(0, 0, clip.width, clip.height)
  stamp.fillStyle = color
  stamp.fillRect(0, 0, clip.width, clip.height)
  const image = stamp.getImageData(0, 0, clip.width, clip.height)
  const data = image.data
  const cutout = clip.cutout && clip.cutout.length === clip.mask.length ? clip.cutout : null
  for (let i = 0; i < clip.mask.length; i += 1) {
    data[i * 4 + 3] = sectionFillAlpha(clip.mask[i], cutout ? cutout[i] : null, opacity)
  }
  stamp.putImageData(image, 0, 0)
  ctx.save()
  ctx.globalCompositeOperation = 'source-over'
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(stamp.canvas, 0, 0, clip.width, clip.height, 0, 0, clip.width, clip.height)
  ctx.restore()
}

let stampCanvas: HTMLCanvasElement | null = null
let stampCtx: CanvasRenderingContext2D | null = null

function stampContext(width: number, height: number): CanvasRenderingContext2D | null {
  if (typeof document === 'undefined') return null
  if (!stampCanvas) {
    stampCanvas = document.createElement('canvas')
    stampCtx = stampCanvas.getContext('2d', { willReadFrequently: true })
  }
  if (!stampCtx || !stampCanvas) return null
  if (stampCanvas.width < width || stampCanvas.height < height) {
    stampCanvas.width = width
    stampCanvas.height = height
  }
  return stampCtx
}
