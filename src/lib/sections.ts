import type { SectionCategory } from '../types'

/**
 * Section masks are binary-or-soft alpha maps the size of the photo.
 * Paint clips to the active mask. These helpers stay free of the canvas
 * so the selection rules can be tested on their own.
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

const COARSE_MAX_SIDE = 280

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

export type FloodOptions = {
  /**
   * Match material instead of raw RGB. Smooth light-to-shadow on the same
   * plastic stays selected; a crease or a real color change still stops the fill.
   */
  ignoreLighting?: boolean
}

/**
 * Contiguous magic wand. 4-connected so a one-pixel line of a different
 * color stops the fill instead of leaking through a corner.
 * With ignore-lighting (the default), similarity is chromaticity plus a
 * contrast budget: gradual shade is free, and a sharp jump spends the budget
 * until the fill stops.
 */
export function floodMask(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  seedX: number,
  seedY: number,
  tolerance: number,
  options?: FloodOptions,
): { mask: Uint8Array; count: number } | null {
  const x0 = Math.floor(seedX)
  const y0 = Math.floor(seedY)
  if (width < 1 || height < 1 || x0 < 0 || y0 < 0 || x0 >= width || y0 >= height) return null
  const seed = (y0 * width + x0) * 4
  if (rgba[seed + 3] < 8) return null
  if (options?.ignoreLighting === false) return floodByColor(rgba, width, height, x0, y0, tolerance)
  return floodAcrossShade(rgba, width, height, x0, y0, tolerance)
}

/** Classic RGB distance. Useful when a highlight itself is the region. */
function floodByColor(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  x0: number,
  y0: number,
  tolerance: number,
): { mask: Uint8Array; count: number } {
  const seed = (y0 * width + x0) * 4
  const sr = rgba[seed]
  const sg = rgba[seed + 1]
  const sb = rgba[seed + 2]
  const tol2 = Math.max(0, tolerance) ** 2
  const mask = new Uint8Array(width * height)
  const stack: number[] = [x0, y0]
  let count = 0

  const matches = (x: number, y: number): boolean => {
    const i = (y * width + x) * 4
    if (rgba[i + 3] < 8) return false
    const dr = rgba[i] - sr
    const dg = rgba[i + 1] - sg
    const db = rgba[i + 2] - sb
    return dr * dr + dg * dg + db * db <= tol2
  }

  while (stack.length > 0) {
    const y = stack.pop() as number
    let x = stack.pop() as number
    while (x >= 0 && mask[y * width + x] === 0 && matches(x, y)) x -= 1
    x += 1
    let spanUp = false
    let spanDown = false
    while (x < width && mask[y * width + x] === 0 && matches(x, y)) {
      mask[y * width + x] = 255
      count += 1
      if (y > 0) {
        const open = mask[(y - 1) * width + x] === 0 && matches(x, y - 1)
        if (open) {
          if (!spanUp) {
            stack.push(x, y - 1)
            spanUp = true
          }
        } else spanUp = false
      }
      if (y + 1 < height) {
        const open = mask[(y + 1) * width + x] === 0 && matches(x, y + 1)
        if (open) {
          if (!spanDown) {
            stack.push(x, y + 1)
            spanDown = true
          }
        } else spanDown = false
      }
      x += 1
    }
  }
  return { mask, count }
}

/**
 * Spread through pixels of similar hue. A luminance step at or under `slack`
 * is treated as shading and costs nothing. A larger step spends the tolerance
 * budget, and a crease above `hard` is a wall.
 */
function floodAcrossShade(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  x0: number,
  y0: number,
  tolerance: number,
): { mask: Uint8Array; count: number } {
  const tol = Math.max(0, Math.min(160, tolerance))
  const seedIndex = y0 * width + x0
  const seed = seedIndex * 4
  const seedSum = rgba[seed] + rgba[seed + 1] + rgba[seed + 2] + 1
  const scr = rgba[seed] / seedSum
  const scg = rgba[seed + 1] / seedSum
  const scb = rgba[seed + 2] / seedSum
  const chromaLimit2 = (0.02 + tol * 0.001) ** 2
  const budget = Math.round(tol * 0.85)
  const slack = 8
  const hard = 14 + tol * 0.15
  const countN = width * height
  const lum = new Uint8Array(countN)
  for (let i = 0; i < countN; i += 1) {
    const o = i * 4
    lum[i] = Math.round(0.2126 * rgba[o] + 0.7152 * rgba[o + 1] + 0.0722 * rgba[o + 2])
  }
  const best = new Uint16Array(countN)
  best.fill(65535)
  best[seedIndex] = 0
  const buckets: number[][] = []
  for (let i = 0; i <= budget; i += 1) buckets.push([])
  buckets[0].push(seedIndex)
  const mask = new Uint8Array(countN)
  let count = 0

  const visit = (index: number, here: number, cost: number): void => {
    const o = index * 4
    if (rgba[o + 3] < 8) return
    const jump = Math.abs(lum[index] - here)
    if (jump > hard) return
    const step = jump <= slack ? 0 : jump - slack
    const next = cost + step
    if (next > budget || next >= best[index]) return
    const sum = rgba[o] + rgba[o + 1] + rgba[o + 2] + 1
    const dr = rgba[o] / sum - scr
    const dg = rgba[o + 1] / sum - scg
    const db = rgba[o + 2] / sum - scb
    if (dr * dr + dg * dg + db * db > chromaLimit2) return
    best[index] = next
    buckets[next].push(index)
  }

  for (let cost = 0; cost <= budget; cost += 1) {
    const bucket = buckets[cost]
    for (let k = 0; k < bucket.length; k += 1) {
      const index = bucket[k]
      if (best[index] !== cost) continue
      mask[index] = 255
      count += 1
      const x = index % width
      const y = (index - x) / width
      const here = lum[index]
      if (x > 0) visit(index - 1, here, cost)
      if (x + 1 < width) visit(index + 1, here, cost)
      if (y > 0) visit(index - width, here, cost)
      if (y + 1 < height) visit(index + width, here, cost)
    }
  }
  return { mask, count }
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

export type ProposeOptions = {
  /** Split on creases and color, not on smooth light-to-shadow bands. */
  ignoreLighting?: boolean
}

/**
 * Split the photo into a handful of regions a person can edit.
 * This is a coarse edge pass, not a model. Dark lines and real color breaks
 * become walls. Smooth shading does not, unless ignore-lighting is off.
 * Blobs that hug the border are treated as backdrop.
 * An empty result means the photo did not separate cleanly.
 */
export function proposeSectionMasks(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  options?: ProposeOptions,
): Uint8Array[] {
  if (width < 8 || height < 8) return []
  const ignoreLighting = options?.ignoreLighting !== false
  const scale = Math.min(1, COARSE_MAX_SIDE / Math.max(width, height))
  const cw = Math.max(1, Math.round(width * scale))
  const ch = Math.max(1, Math.round(height * scale))
  const avgLum = new Float32Array(cw * ch)
  const minLum = new Float32Array(cw * ch)
  const chromaR = new Float32Array(cw * ch)
  const chromaG = new Float32Array(cw * ch)
  const chromaB = new Float32Array(cw * ch)
  const subject = new Uint8Array(cw * ch)
  let subjectCount = 0

  for (let cy = 0; cy < ch; cy += 1) {
    const y0 = Math.floor((cy * height) / ch)
    const y1 = Math.max(y0 + 1, Math.floor(((cy + 1) * height) / ch))
    for (let cx = 0; cx < cw; cx += 1) {
      const x0 = Math.floor((cx * width) / cw)
      const x1 = Math.max(x0 + 1, Math.floor(((cx + 1) * width) / cw))
      let lumSum = 0
      let alphaSum = 0
      let redSum = 0
      let greenSum = 0
      let blueSum = 0
      let lowest = 255
      let samples = 0
      const yStop = Math.min(height, y1)
      const xStop = Math.min(width, x1)
      for (let y = y0; y < yStop; y += 1) {
        for (let x = x0; x < xStop; x += 1) {
          const i = (y * width + x) * 4
          const lum = 0.2126 * rgba[i] + 0.7152 * rgba[i + 1] + 0.0722 * rgba[i + 2]
          lumSum += lum
          redSum += rgba[i]
          greenSum += rgba[i + 1]
          blueSum += rgba[i + 2]
          alphaSum += rgba[i + 3]
          if (lum < lowest) lowest = lum
          samples += 1
        }
      }
      const index = cy * cw + cx
      const mean = samples > 0 ? lumSum / samples : 0
      avgLum[index] = mean
      minLum[index] = samples > 0 ? lowest : 0
      const chromaSum = redSum + greenSum + blueSum + 1
      chromaR[index] = redSum / chromaSum
      chromaG[index] = greenSum / chromaSum
      chromaB[index] = blueSum / chromaSum
      if (samples > 0 && alphaSum / samples > 24) {
        subject[index] = 1
        subjectCount += 1
      }
    }
  }
  if (subjectCount < 24) return []

  const wall = ignoreLighting
    ? markMaterialWalls(avgLum, minLum, chromaR, chromaG, chromaB, subject, cw, ch)
    : markLuminanceWalls(avgLum, minLum, subject, cw, ch)
  dilate(wall, cw, ch)

  const labels = new Int32Array(cw * ch)
  const sizes: number[] = [0]
  const borderHits: number[] = [0]
  let nextLabel = 0
  const stack: number[] = []
  for (let start = 0; start < labels.length; start += 1) {
    if (subject[start] === 0 || wall[start] !== 0 || labels[start] !== 0) continue
    nextLabel += 1
    labels[start] = nextLabel
    stack.push(start)
    let size = 0
    let border = 0
    while (stack.length > 0) {
      const index = stack.pop() as number
      size += 1
      const x = index % cw
      const y = (index - x) / cw
      // Walls can hide the exact edge pixel, so count the rim as the backdrop too.
      if (x <= 2 || y <= 2 || x >= cw - 3 || y >= ch - 3) border += 1
      if (x > 0) visit(index - 1)
      if (x + 1 < cw) visit(index + 1)
      if (y > 0) visit(index - cw)
      if (y + 1 < ch) visit(index + cw)
    }
    sizes.push(size)
    borderHits.push(border)
  }

  function visit(index: number): void {
    if (subject[index] === 0 || wall[index] !== 0 || labels[index] !== 0) return
    labels[index] = nextLabel
    stack.push(index)
  }

  const perimeter = cw * 2 + Math.max(0, ch - 2) * 2
  const minSize = Math.max(16, Math.floor(subjectCount * 0.02))
  const candidates: number[] = []
  for (let id = 1; id <= nextLabel; id += 1) {
    if (sizes[id] < minSize) continue
    if (borderHits[id] > Math.max(8, perimeter * 0.28)) continue
    candidates.push(id)
  }
  candidates.sort((a, b) => sizes[b] - sizes[a])
  const chosen = candidates.slice(0, 5)
  if (chosen.length < 2) return []
  return chosen.map((id) => upsample(labels, id, cw, ch, width, height))
}

/** Walls follow creases and hue changes. A smooth brightness ramp is not a wall. */
function markMaterialWalls(
  avgLum: Float32Array,
  minLum: Float32Array,
  chromaR: Float32Array,
  chromaG: Float32Array,
  chromaB: Float32Array,
  subject: Uint8Array,
  width: number,
  height: number,
): Uint8Array {
  const wall = new Uint8Array(width * height)
  const jumpCut = 20
  const chromaCut2 = 0.11 ** 2
  for (let i = 0; i < wall.length; i += 1) {
    if (subject[i] !== 0 && avgLum[i] - minLum[i] >= 22) wall[i] = 1
  }
  const consider = (a: number, b: number): void => {
    const jump = Math.abs(avgLum[a] - avgLum[b])
    const dr = chromaR[a] - chromaR[b]
    const dg = chromaG[a] - chromaG[b]
    const db = chromaB[a] - chromaB[b]
    if (jump < jumpCut && dr * dr + dg * dg + db * db < chromaCut2) return
    if (subject[a] !== 0) wall[a] = 1
    if (subject[b] !== 0) wall[b] = 1
  }
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x
      if (x + 1 < width) consider(index, index + 1)
      if (y + 1 < height) consider(index, index + width)
    }
  }
  return wall
}

/** Original shade-sensitive split, kept for when ignore-lighting is off. */
function markLuminanceWalls(
  avgLum: Float32Array,
  minLum: Float32Array,
  subject: Uint8Array,
  width: number,
  height: number,
): Uint8Array {
  const grad = new Float32Array(width * height)
  let gradSum = 0
  let gradN = 0
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = y * width + x
      if (subject[i] === 0) continue
      const gx =
        -avgLum[i - width - 1] +
        avgLum[i - width + 1] -
        2 * avgLum[i - 1] +
        2 * avgLum[i + 1] -
        avgLum[i + width - 1] +
        avgLum[i + width + 1]
      const gy =
        -avgLum[i - width - 1] -
        2 * avgLum[i - width] -
        avgLum[i - width + 1] +
        avgLum[i + width - 1] +
        2 * avgLum[i + width] +
        avgLum[i + width + 1]
      const magnitude = Math.hypot(gx, gy)
      grad[i] = magnitude
      gradSum += magnitude
      gradN += 1
    }
  }
  const meanGrad = gradN > 0 ? gradSum / gradN : 0
  const gradCut = Math.max(32, meanGrad * 2.5)
  const wall = new Uint8Array(width * height)
  for (let i = 0; i < wall.length; i += 1) {
    if (subject[i] === 0) continue
    if (avgLum[i] - minLum[i] >= 22 || grad[i] >= gradCut) wall[i] = 1
  }
  return wall
}

function dilate(wall: Uint8Array, width: number, height: number): void {
  const copy = wall.slice()
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (copy[y * width + x] === 0) continue
      for (let dy = -1; dy <= 1; dy += 1) {
        const ny = y + dy
        if (ny < 0 || ny >= height) continue
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = x + dx
          if (nx < 0 || nx >= width) continue
          wall[ny * width + nx] = 1
        }
      }
    }
  }
}

function upsample(
  labels: Int32Array,
  id: number,
  cw: number,
  ch: number,
  width: number,
  height: number,
): Uint8Array {
  const mask = new Uint8Array(width * height)
  for (let y = 0; y < height; y += 1) {
    const cy = Math.min(ch - 1, Math.floor((y * ch) / height))
    const row = y * width
    for (let x = 0; x < width; x += 1) {
      const cx = Math.min(cw - 1, Math.floor((x * cw) / width))
      if (labels[cy * cw + cx] === id) mask[row + x] = 255
    }
  }
  return mask
}
