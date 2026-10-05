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
   * Grow across smooth shade, and stop when every path has to cross a sculpt
   * edge. This is the default. Turn it off to match raw color instead.
   */
  edgeAware?: boolean
}

const SUBJECT_ALPHA = 16

/**
 * Contiguous magic wand. Transparent and cut-out pixels are never selected.
 * Edge-aware mode (the default) grows by minimum-barrier distance on a
 * smoothed luminance gradient: light and shadow on one plate stay together,
 * and a seam, shield outline, or other strong edge stops the fill.
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
  if (rgba[seed + 3] < SUBJECT_ALPHA) return null
  if (options?.edgeAware === false) return floodByColor(rgba, width, height, x0, y0, tolerance)
  return floodByEdges(rgba, width, height, x0, y0, tolerance)
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
    if (rgba[i + 3] < SUBJECT_ALPHA) return false
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

const EDGE_WORK_SIDE = 420
/** Finer than 100 so a one-level photo quantize cannot merge a plate seam into the next region. */
const EDGE_LEVELS = 400
const UNREACHED = 65535

type EdgeWork = {
  cw: number
  ch: number
  edge: Uint16Array
  subject: Uint8Array
  subjectCount: number
}

/**
 * Coarse luminance gradient of the miniature only. Edge values run up to
 * EDGE_LEVELS, where that top value is a strong seam relative to this photo. Transparent and cut-out
 * pixels are not subject, and their color is not mixed into the gradient, so
 * a checkerboard or a cleared backdrop cannot steer the fill.
 */
function buildEdgeWork(rgba: Uint8ClampedArray, width: number, height: number): EdgeWork | null {
  if (width < 2 || height < 2) return null
  const scale = Math.min(1, EDGE_WORK_SIDE / Math.max(width, height))
  const cw = Math.max(1, Math.round(width * scale))
  const ch = Math.max(1, Math.round(height * scale))
  const count = cw * ch
  const lum = new Float32Array(count)
  const subject = new Uint8Array(count)
  let subjectCount = 0
  for (let cy = 0; cy < ch; cy += 1) {
    const y0 = Math.floor((cy * height) / ch)
    const y1 = Math.min(height, Math.max(y0 + 1, Math.floor(((cy + 1) * height) / ch)))
    for (let cx = 0; cx < cw; cx += 1) {
      const x0 = Math.floor((cx * width) / cw)
      const x1 = Math.min(width, Math.max(x0 + 1, Math.floor(((cx + 1) * width) / cw)))
      let lumSum = 0
      let alphaSum = 0
      let samples = 0
      let opaque = 0
      for (let y = y0; y < y1; y += 1) {
        for (let x = x0; x < x1; x += 1) {
          const i = (y * width + x) * 4
          const alpha = rgba[i + 3]
          alphaSum += alpha
          samples += 1
          if (alpha < SUBJECT_ALPHA) continue
          lumSum += 0.2126 * rgba[i] + 0.7152 * rgba[i + 1] + 0.0722 * rgba[i + 2]
          opaque += 1
        }
      }
      const index = cy * cw + cx
      if (samples > 0 && opaque > 0 && alphaSum / samples >= SUBJECT_ALPHA) {
        subject[index] = 1
        subjectCount += 1
        lum[index] = lumSum / opaque
      }
    }
  }
  if (subjectCount < 8) return null
  const radius = Math.max(1, Math.round(Math.min(cw, ch) * 0.006))
  const smooth = blurSubject(lum, subject, cw, ch, radius)
  const mag = sobelSubject(smooth, subject, cw, ch)
  const ranked: number[] = []
  for (let i = 0; i < count; i += 1) {
    if (subject[i] !== 0) ranked.push(mag[i])
  }
  ranked.sort((a, b) => a - b)
  const pivot = ranked[Math.min(ranked.length - 1, Math.floor(ranked.length * 0.98))] || 1
  const edge = new Uint16Array(count)
  for (let i = 0; i < count; i += 1) {
    if (subject[i] === 0) continue
    edge[i] = Math.max(0, Math.min(EDGE_LEVELS, Math.round((mag[i] / pivot) * EDGE_LEVELS)))
  }
  return { cw, ch, edge, subject, subjectCount }
}

function floodByEdges(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  x0: number,
  y0: number,
  tolerance: number,
): { mask: Uint8Array; count: number } | null {
  const work = buildEdgeWork(rgba, width, height)
  if (!work) return null
  const { cw, ch, edge, subject, subjectCount } = work
  let sx = Math.min(cw - 1, Math.floor((x0 * cw) / width))
  let sy = Math.min(ch - 1, Math.floor((y0 * ch) / height))
  if (subject[sy * cw + sx] === 0) {
    let found = false
    for (let dy = -2; dy <= 2 && !found; dy += 1) {
      for (let dx = -2; dx <= 2; dx += 1) {
        const nx = sx + dx
        const ny = sy + dy
        if (nx < 0 || ny < 0 || nx >= cw || ny >= ch) continue
        if (subject[ny * cw + nx] === 0) continue
        sx = nx
        sy = ny
        found = true
        break
      }
    }
    if (!found) return null
  }
  let chosen = growFromSeed(edge, subject, subjectCount, cw, ch, sx, sy, tolerance)
  let chosenArea = 0
  for (let i = 0; i < chosen.length; i += 1) if (chosen[i] !== 0) chosenArea += 1
  // A click on a seam can sit one cell outside a plate, where the barrier is flat and
  // the fill runs until the size cap. A nearby cell inside the plate stays small.
  const snapAbove = Math.floor(subjectCount * 0.35)
  if (chosenArea > snapAbove) {
    const minKeep = Math.max(40, Math.floor(subjectCount * 0.015))
    for (let dy = -2; dy <= 2; dy += 1) {
      for (let dx = -2; dx <= 2; dx += 1) {
        if (dx === 0 && dy === 0) continue
        const nx = sx + dx
        const ny = sy + dy
        if (nx < 0 || ny < 0 || nx >= cw || ny >= ch) continue
        if (subject[ny * cw + nx] === 0) continue
        const grown = growFromSeed(edge, subject, subjectCount, cw, ch, nx, ny, tolerance)
        let area = 0
        for (let i = 0; i < grown.length; i += 1) if (grown[i] !== 0) area += 1
        if (area < minKeep || area >= chosenArea) continue
        chosen = grown
        chosenArea = area
      }
    }
    chosen[sy * cw + sx] = 1
  }
  return upsampleCoarse(chosen, rgba, width, height, cw, ch)
}

type Barrier = { cost: Uint16Array; order: Uint32Array }

/**
 * Minimax path cost: the strongest smoothed edge a path from the seed must
 * cross. Discovery order is recorded so a size cap can keep the cells closest
 * to the click when one cost bucket would otherwise swallow the figure.
 */
function barrier(edge: Uint16Array, subject: Uint8Array, width: number, height: number, sx: number, sy: number): Barrier {
  const count = width * height
  const cost = new Uint16Array(count)
  cost.fill(UNREACHED)
  const order = new Uint32Array(count)
  const seed = sy * width + sx
  cost[seed] = 0
  order[seed] = 1
  let stamp = 1
  const buckets: number[][] = []
  for (let i = 0; i <= EDGE_LEVELS; i += 1) buckets.push([])
  buckets[0].push(seed)
  for (let level = 0; level <= EDGE_LEVELS; level += 1) {
    const bucket = buckets[level]
    for (let k = 0; k < bucket.length; k += 1) {
      const index = bucket[k]
      if (cost[index] !== level) continue
      const x = index % width
      const y = (index - x) / width
      if (x > 0) relax(index - 1, level)
      if (x + 1 < width) relax(index + 1, level)
      if (y > 0) relax(index - width, level)
      if (y + 1 < height) relax(index + width, level)
    }
  }
  return { cost, order }

  function relax(index: number, level: number): void {
    if (subject[index] === 0) return
    const next = edge[index] > level ? edge[index] : level
    if (next >= cost[index]) return
    cost[index] = next
    stamp += 1
    order[index] = stamp
    buckets[next].push(index)
  }
}

/**
 * Take cells in barrier order. A jump of half the area or more, once the
 * region is already plate-sized, is a seam and stops the fill. A click that
 * lands on a ridge is allowed to leave that ridge. Growth also stops around
 * two fifths of the miniature so one grey material cannot become the whole figure.
 */
function growFromSeed(
  edge: Uint16Array,
  subject: Uint8Array,
  subjectCount: number,
  width: number,
  height: number,
  sx: number,
  sy: number,
  tolerance: number,
): Uint8Array {
  const { cost, order } = barrier(edge, subject, width, height, sx, sy)
  const selected = new Uint8Array(cost.length)
  const buckets: number[][] = []
  for (let i = 0; i <= EDGE_LEVELS; i += 1) buckets.push([])
  for (let i = 0; i < cost.length; i += 1) {
    if (subject[i] === 0 || cost[i] === UNREACHED) continue
    buckets[cost[i]].push(i)
  }
  const counts = new Int32Array(EDGE_LEVELS + 1)
  for (let t = 0; t <= EDGE_LEVELS; t += 1) {
    const bucket = buckets[t]
    let n = 0
    for (let k = 0; k < bucket.length; k += 1) if (cost[bucket[k]] === t) n += 1
    counts[t] = n
  }
  const prefix = new Int32Array(EDGE_LEVELS + 1)
  let run = 0
  for (let t = 0; t <= EDGE_LEVELS; t += 1) {
    run += counts[t]
    prefix[t] = run
  }
  const minArea = Math.max(40, Math.floor(subjectCount * 0.015))
  const cap = Math.max(minArea, Math.floor(subjectCount * 0.4))
  if (prefix[EDGE_LEVELS] < 1) return selected

  let opened = -1
  for (let t = 0; t <= EDGE_LEVELS; t += 1) {
    if (prefix[t] >= minArea) {
      opened = t
      break
    }
  }
  if (opened < 0) {
    fillThrough(selected, buckets, cost, EDGE_LEVELS)
    return selected
  }

  let bestRatio = 0
  let knee = opened
  for (let t = opened + 1; t <= EDGE_LEVELS; t += 1) {
    const before = prefix[t - 1]
    const ratio = (prefix[t] - before) / before
    if (ratio > bestRatio) {
      bestRatio = ratio
      knee = t - 1
    }
  }
  if (bestRatio < 0.5) {
    const modest = Math.max(minArea, Math.floor(subjectCount * 0.12))
    knee = opened
    for (let t = opened; t <= EDGE_LEVELS; t += 1) {
      if (prefix[t] <= modest) knee = t
      else break
    }
  }

  const scaled = Math.max(0, Math.min(EDGE_LEVELS, Math.round((knee * Math.max(0, tolerance)) / 48)))
  let limit = tolerance >= 48 ? Math.max(scaled, opened) : scaled
  if (prefix[limit] > cap) {
    let t = limit
    while (t > 0 && prefix[t] > cap) t -= 1
    const next = Math.min(EDGE_LEVELS, t + 1)
    if (prefix[t] >= minArea || prefix[next] <= cap) {
      limit = t
    } else {
      fillThrough(selected, buckets, cost, t)
      fillPartial(selected, buckets[next], cost, order, next, cap - prefix[t])
      return selected
    }
  }
  fillThrough(selected, buckets, cost, limit)
  return selected
}

function fillThrough(selected: Uint8Array, buckets: number[][], cost: Uint16Array, limit: number): void {
  for (let t = 0; t <= limit; t += 1) {
    const bucket = buckets[t]
    for (let k = 0; k < bucket.length; k += 1) {
      const index = bucket[k]
      if (cost[index] === t) selected[index] = 1
    }
  }
}

/** Keep the cells discovered first, which are the ones nearest the click. */
function fillPartial(
  selected: Uint8Array,
  bucket: number[],
  cost: Uint16Array,
  order: Uint32Array,
  level: number,
  room: number,
): void {
  if (room < 1) return
  const fresh: number[] = []
  for (let k = 0; k < bucket.length; k += 1) {
    const index = bucket[k]
    if (cost[index] === level) fresh.push(index)
  }
  fresh.sort((a, b) => order[a] - order[b])
  const take = Math.min(room, fresh.length)
  for (let k = 0; k < take; k += 1) selected[fresh[k]] = 1
}

function upsampleCoarse(
  selected: Uint8Array,
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  cw: number,
  ch: number,
): { mask: Uint8Array; count: number } {
  const mask = new Uint8Array(width * height)
  let count = 0
  for (let y = 0; y < height; y += 1) {
    const cy = Math.min(ch - 1, Math.floor((y * ch) / height))
    const row = y * width
    for (let x = 0; x < width; x += 1) {
      if (rgba[(row + x) * 4 + 3] < SUBJECT_ALPHA) continue
      const cx = Math.min(cw - 1, Math.floor((x * cw) / width))
      if (selected[cy * cw + cx] === 0) continue
      mask[row + x] = 255
      count += 1
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
  /** Split on smoothed sculpt edges. Smooth shade is not a boundary. */
  edgeAware?: boolean
}

/**
 * Where to start a suggest flood. An opaque photo frame means the calm border
 * is backdrop, so seeds come from pockets enclosed by a seam. A cut-out figure
 * does not touch that frame, so a grid of calm cells is enough.
 */
function proposeSeeds(
  edge: Uint16Array,
  subject: Uint8Array,
  cw: number,
  ch: number,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
): { sx: number; sy: number }[] {
  let borderN = 0
  let borderSubject = 0
  const touch = (index: number): void => {
    borderN += 1
    if (subject[index] !== 0) borderSubject += 1
  }
  for (let x = 0; x < cw; x += 1) {
    touch(x)
    touch((ch - 1) * cw + x)
  }
  for (let y = 1; y < ch - 1; y += 1) {
    touch(y * cw)
    touch(y * cw + cw - 1)
  }
  const opaqueFrame = borderN > 0 && borderSubject > borderN * 0.4
  if (!opaqueFrame) {
    const seeds: { sx: number; sy: number }[] = []
    const cols = 5
    const rows = 4
    const spanX = maxX - minX + 1
    const spanY = maxY - minY + 1
    for (let gy = 0; gy < rows; gy += 1) {
      const y0 = minY + Math.floor((spanY * gy) / rows)
      const y1 = Math.max(y0 + 1, minY + Math.floor((spanY * (gy + 1)) / rows))
      for (let gx = 0; gx < cols; gx += 1) {
        const x0 = minX + Math.floor((spanX * gx) / cols)
        const x1 = Math.max(x0 + 1, minX + Math.floor((spanX * (gx + 1)) / cols))
        const cx = Math.min(cw - 1, Math.floor((x0 + x1) / 2))
        const cy = Math.min(ch - 1, Math.floor((y0 + y1) / 2))
        let best = -1
        let bestScore = Infinity
        for (let y = y0; y < y1; y += 1) {
          for (let x = x0; x < x1; x += 1) {
            const index = y * cw + x
            if (subject[index] === 0 || edge[index] > EDGE_LEVELS * 0.7) continue
            const score = Math.abs(x - cx) + Math.abs(y - cy)
            if (score >= bestScore) continue
            best = index
            bestScore = score
          }
        }
        if (best < 0) continue
        seeds.push({ sx: best % cw, sy: Math.floor(best / cw) })
      }
    }
    return seeds
  }

  const wall = new Uint8Array(subject.length)
  for (let i = 0; i < wall.length; i += 1) {
    if (subject[i] !== 0 && edge[i] >= EDGE_LEVELS * 0.16) wall[i] = 1
  }
  dilate(wall, cw, ch)
  const labels = new Int32Array(subject.length)
  const sizes: number[] = [0]
  const borderHits: number[] = [0]
  const calmAt: number[] = [0]
  const calmEdge: number[] = [101]
  let nextLabel = 0
  const stack: number[] = []
  for (let start = 0; start < labels.length; start += 1) {
    if (subject[start] === 0 || wall[start] !== 0 || labels[start] !== 0) continue
    nextLabel += 1
    labels[start] = nextLabel
    stack.push(start)
    sizes.push(0)
    borderHits.push(0)
    calmAt.push(start)
    calmEdge.push(edge[start])
    while (stack.length > 0) {
      const index = stack.pop() as number
      sizes[nextLabel] += 1
      if (edge[index] < calmEdge[nextLabel]) {
        calmEdge[nextLabel] = edge[index]
        calmAt[nextLabel] = index
      }
      const x = index % cw
      const y = (index - x) / cw
      if (x <= 1 || y <= 1 || x >= cw - 2 || y >= ch - 2) borderHits[nextLabel] += 1
      if (x > 0) visit(index - 1)
      if (x + 1 < cw) visit(index + 1)
      if (y > 0) visit(index - cw)
      if (y + 1 < ch) visit(index + cw)
    }
  }
  function visit(index: number): void {
    if (subject[index] === 0 || wall[index] !== 0 || labels[index] !== 0) return
    labels[index] = nextLabel
    stack.push(index)
  }
  const seeds: { sx: number; sy: number }[] = []
  for (let id = 1; id <= nextLabel; id += 1) {
    if (sizes[id] < 24 || borderHits[id] > 0) continue
    const index = calmAt[id]
    seeds.push({ sx: index % cw, sy: Math.floor(index / cw) })
  }
  return seeds
}

/**
 * Several edge-bounded parts. Each seed grows by the same barrier fill as the
 * wand. Backdrop-touching and duplicate floods are dropped.
 */
function proposeByBarriers(rgba: Uint8ClampedArray, width: number, height: number): Uint8Array[] {
  const work = buildEdgeWork(rgba, width, height)
  if (!work) return []
  const { cw, ch, edge, subject, subjectCount } = work
  let minX = cw
  let minY = ch
  let maxX = 0
  let maxY = 0
  for (let i = 0; i < subject.length; i += 1) {
    if (subject[i] === 0) continue
    const x = i % cw
    const y = (i - x) / cw
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
  }
  if (maxX < minX || maxY < minY) return []
  const seeds = proposeSeeds(edge, subject, cw, ch, minX, minY, maxX, maxY)

  const minSize = Math.max(16, Math.floor(subjectCount * 0.02))
  const maxSize = Math.floor(subjectCount * 0.32)
  const pending: { coarse: Uint8Array; area: number }[] = []
  for (const seed of seeds) {
    const coarse = growFromSeed(edge, subject, subjectCount, cw, ch, seed.sx, seed.sy, 48)
    let area = 0
    let border = 0
    for (let i = 0; i < coarse.length; i += 1) {
      if (coarse[i] === 0) continue
      area += 1
      const x = i % cw
      const y = (i - x) / cw
      if (x <= 2 || y <= 2 || x >= cw - 3 || y >= ch - 3) border += 1
    }
    if (area < minSize || area > maxSize) continue
    const perimeter = cw * 2 + Math.max(0, ch - 2) * 2
    if (border > Math.max(8, perimeter * 0.28)) continue
    pending.push({ coarse, area })
  }
  pending.sort((a, b) => b.area - a.area)
  const kept: Uint8Array[] = []
  const areas: number[] = []
  for (const candidate of pending) {
    let duplicate = false
    for (let k = 0; k < kept.length; k += 1) {
      let inter = 0
      const other = kept[k]
      for (let i = 0; i < candidate.coarse.length; i += 1) {
        if (candidate.coarse[i] !== 0 && other[i] !== 0) inter += 1
      }
      const denom = Math.min(candidate.area, areas[k])
      if (denom > 0 && inter / denom > 0.5) {
        duplicate = true
        break
      }
    }
    if (duplicate) continue
    kept.push(candidate.coarse)
    areas.push(candidate.area)
  }
  if (kept.length < 2) return []
  const order = kept.map((_, index) => index).sort((a, b) => areas[b] - areas[a])
  return order.slice(0, 5).map((index) => upsampleCoarse(kept[index], rgba, width, height, cw, ch).mask)
}

export function proposeSectionMasks(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  options?: ProposeOptions,
): Uint8Array[] {
  if (width < 8 || height < 8) return []
  const edgeAware = options?.edgeAware !== false
  if (edgeAware) return proposeByBarriers(rgba, width, height)
  const scale = Math.min(1, COARSE_MAX_SIDE / Math.max(width, height))
  const cw = Math.max(1, Math.round(width * scale))
  const ch = Math.max(1, Math.round(height * scale))
  const avgLum = new Float32Array(cw * ch)
  const minLum = new Float32Array(cw * ch)
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
      let lowest = 255
      let samples = 0
      const yStop = Math.min(height, y1)
      const xStop = Math.min(width, x1)
      for (let y = y0; y < yStop; y += 1) {
        for (let x = x0; x < xStop; x += 1) {
          const i = (y * width + x) * 4
          const lum = 0.2126 * rgba[i] + 0.7152 * rgba[i + 1] + 0.0722 * rgba[i + 2]
          lumSum += lum
          alphaSum += rgba[i + 3]
          if (lum < lowest) lowest = lum
          samples += 1
        }
      }
      const index = cy * cw + cx
      const mean = samples > 0 ? lumSum / samples : 0
      avgLum[index] = mean
      minLum[index] = samples > 0 ? lowest : 0
      if (samples > 0 && alphaSum / samples >= SUBJECT_ALPHA) {
        subject[index] = 1
        subjectCount += 1
      }
    }
  }
  if (subjectCount < 24) return []

  const wall = edgeAware
    ? markMaterialWalls(avgLum, minLum, subject, cw, ch)
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
  const maxSize = Math.floor(subjectCount * 0.45)
  const candidates: number[] = []
  for (let id = 1; id <= nextLabel; id += 1) {
    if (sizes[id] < minSize) continue
    if (edgeAware && sizes[id] > maxSize) continue
    if (borderHits[id] > Math.max(8, perimeter * 0.28)) continue
    candidates.push(id)
  }
  candidates.sort((a, b) => sizes[b] - sizes[a])
  const chosen = candidates.slice(0, 5)
  if (chosen.length < 2) return []
  return chosen.map((id) => upsample(labels, id, cw, ch, width, height))
}

/** Average only miniature cells, so the cleared backdrop does not darken the rim. */
function blurSubject(
  src: Float32Array,
  subject: Uint8Array,
  width: number,
  height: number,
  radius: number,
): Float32Array {
  if (radius < 1) return src
  const tmp = new Float32Array(src.length)
  const out = new Float32Array(src.length)
  for (let y = 0; y < height; y += 1) {
    const row = y * width
    for (let x = 0; x < width; x += 1) {
      const index = row + x
      if (subject[index] === 0) continue
      let sum = 0
      let n = 0
      const x0 = Math.max(0, x - radius)
      const x1 = Math.min(width - 1, x + radius)
      for (let xx = x0; xx <= x1; xx += 1) {
        const sample = row + xx
        if (subject[sample] === 0) continue
        sum += src[sample]
        n += 1
      }
      tmp[index] = n > 0 ? sum / n : src[index]
    }
  }
  for (let x = 0; x < width; x += 1) {
    for (let y = 0; y < height; y += 1) {
      const index = y * width + x
      if (subject[index] === 0) continue
      let sum = 0
      let n = 0
      const y0 = Math.max(0, y - radius)
      const y1 = Math.min(height - 1, y + radius)
      for (let yy = y0; yy <= y1; yy += 1) {
        const sample = yy * width + x
        if (subject[sample] === 0) continue
        sum += tmp[sample]
        n += 1
      }
      out[index] = n > 0 ? sum / n : tmp[index]
    }
  }
  return out
}

/** Gradient inside the miniature. Off-figure neighbors copy the center, so the cutout rim is not a ridge. */
function sobelSubject(src: Float32Array, subject: Uint8Array, width: number, height: number): Float32Array {
  const mag = new Float32Array(width * height)
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = y * width + x
      if (subject[i] === 0) continue
      const c = src[i]
      const tl = subject[i - width - 1] ? src[i - width - 1] : c
      const tc = subject[i - width] ? src[i - width] : c
      const tr = subject[i - width + 1] ? src[i - width + 1] : c
      const ml = subject[i - 1] ? src[i - 1] : c
      const mr = subject[i + 1] ? src[i + 1] : c
      const bl = subject[i + width - 1] ? src[i + width - 1] : c
      const bc = subject[i + width] ? src[i + width] : c
      const br = subject[i + width + 1] ? src[i + width + 1] : c
      const gx = -tl + tr - 2 * ml + 2 * mr - bl + br
      const gy = -tl - 2 * tc - tr + bl + 2 * bc + br
      mag[i] = Math.hypot(gx, gy)
    }
  }
  return mag
}

function blurFloat(src: Float32Array, width: number, height: number, radius: number): Float32Array {
  if (radius < 1) return src
  const count = width * height
  const tmp = new Float32Array(count)
  const out = new Float32Array(count)
  const span = radius * 2 + 1
  for (let y = 0; y < height; y += 1) {
    const row = y * width
    let sum = 0
    for (let x = -radius; x <= radius; x += 1) sum += src[row + Math.min(width - 1, Math.max(0, x))]
    for (let x = 0; x < width; x += 1) {
      tmp[row + x] = sum / span
      sum -= src[row + Math.min(width - 1, Math.max(0, x - radius))]
      sum += src[row + Math.min(width - 1, Math.max(0, x + radius + 1))]
    }
  }
  for (let x = 0; x < width; x += 1) {
    let sum = 0
    for (let y = -radius; y <= radius; y += 1) sum += tmp[Math.min(height - 1, Math.max(0, y)) * width + x]
    for (let y = 0; y < height; y += 1) {
      out[y * width + x] = sum / span
      sum -= tmp[Math.min(height - 1, Math.max(0, y - radius)) * width + x]
      sum += tmp[Math.min(height - 1, Math.max(0, y + radius + 1)) * width + x]
    }
  }
  return out
}

function sobelMag(src: Float32Array, width: number, height: number): Float32Array {
  const mag = new Float32Array(width * height)
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = y * width + x
      const gx =
        -src[i - width - 1] +
        src[i - width + 1] -
        2 * src[i - 1] +
        2 * src[i + 1] -
        src[i + width - 1] +
        src[i + width + 1]
      const gy =
        -src[i - width - 1] -
        2 * src[i - width] -
        src[i - width + 1] +
        src[i + width - 1] +
        2 * src[i + width] +
        src[i + width + 1]
      mag[i] = Math.hypot(gx, gy)
    }
  }
  return mag
}

/**
 * Walls are strong smoothed gradients and thin dark lines.
 * A gentle light-to-shadow ramp stays open.
 */
function markMaterialWalls(
  avgLum: Float32Array,
  minLum: Float32Array,
  subject: Uint8Array,
  width: number,
  height: number,
): Uint8Array {
  const radius = Math.max(1, Math.round(Math.min(width, height) * 0.008))
  const mag = sobelMag(blurFloat(avgLum, width, height, radius), width, height)
  const ranked: number[] = []
  for (let i = 0; i < mag.length; i += 1) {
    if (subject[i] !== 0) ranked.push(mag[i])
  }
  ranked.sort((a, b) => a - b)
  const pivot = ranked[Math.min(ranked.length - 1, Math.floor(ranked.length * 0.98))] || 1
  const wall = new Uint8Array(width * height)
  for (let i = 0; i < wall.length; i += 1) {
    if (subject[i] === 0) continue
    const norm = (mag[i] / pivot) * 100
    if (norm >= 18 || avgLum[i] - minLum[i] >= 26) wall[i] = 1
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
