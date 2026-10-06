/**
 * Edge-first region selection for grey miniatures.
 *
 * Walls come from OpenCV Canny: Gaussian blur, Sobel, non-maximum suppression,
 * hysteresis. A soft highlight is a shallow ramp, so it stays under the
 * thresholds and the wand walks across it. A sculpt seam is a sharp jump and
 * stays a thin edge. Growth never crosses those edges, and it is hard-gated
 * to the miniature (cutout alpha, and any border-connected backdrop that is
 * still opaque). Suggest, the edge overlay, and edge snap use the same walls.
 * Hand edits force a ridge on or off after Canny, and every consumer sees that.
 */

import cvModule from '@techstark/opencv-js'
import type { RidgeEdits } from './edgeEdits'

const ALPHA_CUT = 16
const WORK_SIDE = 1600

type CvMat = {
  data: Uint8Array
  delete: () => void
}

type CvApi = {
  CV_8UC1: number
  CV_16S: number
  BORDER_REPLICATE: number
  MORPH_RECT: number
  Mat: new () => CvMat
  Size: new (width: number, height: number) => object
  Sobel: (
    src: CvMat,
    dst: CvMat,
    ddepth: number,
    dx: number,
    dy: number,
    ksize: number,
    scale: number,
    delta: number,
    borderType: number,
  ) => void
  matFromArray: (rows: number, cols: number, type: number, array: Uint8Array) => CvMat
  GaussianBlur: (
    src: CvMat,
    dst: CvMat,
    ksize: object,
    sigmaX: number,
    sigmaY: number,
    borderType: number,
  ) => void
  Canny: (
    image: CvMat,
    edges: CvMat,
    threshold1: number,
    threshold2: number,
    apertureSize: number,
    L2gradient: boolean,
  ) => void
  dilate: (src: CvMat, dst: CvMat, kernel: CvMat) => void
  getStructuringElement: (shape: number, ksize: object) => CvMat
  onRuntimeInitialized?: () => void
}

async function loadOpenCv(): Promise<CvApi> {
  const imported = cvModule as unknown as CvApi | Promise<CvApi>
  const cv = imported instanceof Promise ? await imported : imported
  if (typeof cv.Canny !== 'function') {
    await new Promise<void>((resolve) => {
      cv.onRuntimeInitialized = () => resolve()
    })
  }
  return cv
}

const cv = await loadOpenCv()

export type EdgeMap = {
  fullWidth: number
  fullHeight: number
  width: number
  height: number
  scale: number
  subject: Uint8Array
  edge: Float32Array
  luma: Float32Array
  subjectCount: number
  /** Full-resolution. 1 = off the miniature (clear alpha or border-connected backdrop). */
  off: Uint8Array
}

export type RegionMask = { mask: Uint8Array; count: number }

export function selectRegion(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  seedX: number,
  seedY: number,
  tolerance: number,
  edits?: RidgeEdits | null,
): RegionMask | null {
  const map = buildEdgeMap(rgba, width, height)
  return selectOnMap(map, rgba, seedX, seedY, tolerance, edits)
}

export function suggestRegions(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  tolerance: number,
  edits?: RidgeEdits | null,
): Uint8Array[] {
  if (width < 8 || height < 8) return []
  const map = buildEdgeMap(rgba, width, height)
  if (map.subjectCount < 32) return []
  return suggestOnMap(map, rgba, tolerance, edits).map((entry) => entry.mask)
}

export function buildEdgeMap(rgba: Uint8ClampedArray, width: number, height: number): EdgeMap {
  const off = backdropGate(rgba, width, height)
  const scale = chooseScale(width, height)
  const cw = Math.max(1, Math.round(width / scale))
  const ch = Math.max(1, Math.round(height / scale))
  const count = cw * ch
  const luma = new Float32Array(count)
  const subject = new Uint8Array(count)
  let subjectCount = 0

  for (let cy = 0; cy < ch; cy += 1) {
    const y0 = Math.min(height, Math.floor(cy * scale))
    const y1 = Math.min(height, Math.floor((cy + 1) * scale))
    for (let cx = 0; cx < cw; cx += 1) {
      const x0 = Math.min(width, Math.floor(cx * scale))
      const x1 = Math.min(width, Math.floor((cx + 1) * scale))
      let lumSum = 0
      let opaque = 0
      let samples = 0
      const yStop = Math.max(y0 + 1, y1)
      const xStop = Math.max(x0 + 1, x1)
      for (let y = y0; y < yStop && y < height; y += 1) {
        const row = y * width
        for (let x = x0; x < xStop && x < width; x += 1) {
          const pixel = row + x
          const o = pixel * 4
          samples += 1
          if (off[pixel] !== 0) continue
          lumSum += 0.2126 * rgba[o] + 0.7152 * rgba[o + 1] + 0.0722 * rgba[o + 2]
          opaque += 1
        }
      }
      const index = cy * cw + cx
      if (opaque > 0 && (samples === 0 || opaque * 5 >= samples)) {
        subject[index] = 1
        luma[index] = lumSum / opaque
        subjectCount += 1
      }
    }
  }

  const edge = new Float32Array(count)
  return { fullWidth: width, fullHeight: height, width: cw, height: ch, scale, subject, edge, luma, subjectCount, off }
}

/** Full-resolution Canny walls at this tolerance. Same edges the wand starts from. */
export type EdgeGuide = {
  fullWidth: number
  fullHeight: number
  width: number
  height: number
  scale: number
  /** 1 on a ridge the wand would stop on, including hand edits. */
  wall: Uint8Array
  /** 1 on the miniature. */
  subject: Uint8Array
}

/** Coarse Canny walls at this tolerance, after hand-added and hand-erased ridges. */
export function edgeGuide(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  tolerance: number,
  edits?: RidgeEdits | null,
): EdgeGuide {
  if (width < 2 || height < 2) {
    const count = Math.max(0, width * height)
    return {
      fullWidth: width,
      fullHeight: height,
      width: Math.max(0, width),
      height: Math.max(0, height),
      scale: 1,
      wall: new Uint8Array(count),
      subject: new Uint8Array(count),
    }
  }
  const map = buildEdgeMap(rgba, width, height)
  const wall = wallsFor(map, tolerance, edits)
  return {
    fullWidth: width,
    fullHeight: height,
    width: map.width,
    height: map.height,
    scale: map.scale,
    wall,
    subject: map.subject,
  }
}

export function selectionEdges(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  tolerance: number,
  edits?: RidgeEdits | null,
): Uint8Array {
  if (width < 2 || height < 2) return new Uint8Array(Math.max(0, width * height))
  const map = buildEdgeMap(rgba, width, height)
  // Yellow overlay is automatic Canny after erases. A painted ridge is not run
  // through Canny again — the stroke pixels themselves are the wall.
  const walls = wallsFor(map, tolerance, edits, false)
  const full = new Uint8Array(width * height)
  const { scale } = map
  for (let y = 0; y < height; y += 1) {
    const cy = Math.min(map.height - 1, Math.floor(y / scale))
    for (let x = 0; x < width; x += 1) {
      const pixel = y * width + x
      if (map.off[pixel] !== 0) continue
      const cx = Math.min(map.width - 1, Math.floor(x / scale))
      if (walls[cy * map.width + cx] !== 0) full[pixel] = 255
    }
  }
  return full
}

/**
 * True when darker plastic lies on opposite sides within a short reach.
 * A specular ridge passes. The white field and the one-sided fringe do not.
 */
function enclosedByPlastic(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  index: number,
  luma: number,
): boolean {
  const x = index % width
  const y = (index - x) / width
  const reach = 6
  const darker = (nx: number, ny: number): boolean => {
    if (nx < 0 || ny < 0 || nx >= width || ny >= height) return false
    const o = (ny * width + nx) * 4
    if (rgba[o + 3] < ALPHA_CUT) return false
    const next = 0.2126 * rgba[o] + 0.7152 * rgba[o + 1] + 0.0722 * rgba[o + 2]
    return luma - next >= 42
  }
  let left = false
  let right = false
  let up = false
  let down = false
  for (let step = 1; step <= reach; step += 1) {
    if (!left && darker(x - step, y)) left = true
    if (!right && darker(x + step, y)) right = true
    if (!up && darker(x, y - step)) up = true
    if (!down && darker(x, y + step)) down = true
  }
  return (left && right) || (up && down)
}

/**
 * Off-model pixels: cleared alpha, and the border-connected backdrop.
 * A soft highlight on a plate is not backdrop — it is darker than the field
 * or it is walled in by the miniature — so the wand cannot walk off the
 * model where a pad fades toward white.
 */
function backdropGate(rgba: Uint8ClampedArray, width: number, height: number): Uint8Array {
  const count = width * height
  const off = new Uint8Array(count)
  for (let i = 0; i < count; i += 1) {
    if (rgba[i * 4 + 3] < ALPHA_CUT) off[i] = 1
  }

  type Ref = { r: number; g: number; b: number }
  const seenRef = new Uint8Array(1 << 15)
  const refs: Ref[] = []
  const consider = (x: number, y: number) => {
    const o = (y * width + x) * 4
    if (rgba[o + 3] < ALPHA_CUT) return
    const r = rgba[o]
    const g = rgba[o + 1]
    const b = rgba[o + 2]
    if (Math.max(r, g, b) - Math.min(r, g, b) > 22) return
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b
    if (luma < 200) return
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3)
    if (seenRef[key] !== 0) return
    seenRef[key] = 1
    refs.push({ r, g, b })
  }
  const stepX = Math.max(1, Math.floor(width / 64))
  const stepY = Math.max(1, Math.floor(height / 64))
  for (let x = 0; x < width; x += stepX) {
    consider(x, 0)
    if (height > 1) consider(x, height - 1)
  }
  for (let y = 0; y < height; y += stepY) {
    consider(0, y)
    if (width > 1) consider(width - 1, y)
  }
  if (refs.length === 0) return off

  const matches = (index: number): boolean => {
    const o = index * 4
    const r = rgba[o]
    const g = rgba[o + 1]
    const b = rgba[o + 2]
    if (Math.max(r, g, b) - Math.min(r, g, b) > 22) return false
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b
    if (luma < 206) return false
    let near = false
    for (let i = 0; i < refs.length; i += 1) {
      const ref = refs[i]
      const dr = r - ref.r
      const dg = g - ref.g
      const db = b - ref.b
      if (dr * dr * 0.5 + dg * dg + db * db * 0.4 <= 55 * 55) {
        near = true
        break
      }
    }
    if (!near) return false
    // A highlight or raised edge sits between darker plastic. The white field
    // does not: it is bright on every side. Keep the enclosed pixels on the
    // miniature so a section can cover them and the wand can add them.
    if (enclosedByPlastic(rgba, width, height, index, luma)) return false
    // Near-white fringe is backdrop even where it touches the miniature.
    // A milder bright pixel glued to darker plastic is a highlight, not the field.
    if (luma >= 236) return true
    const x = index % width
    const y = (index - x) / width
    let darker = 0
    for (let dy = -1; dy <= 1; dy += 1) {
      const ny = y + dy
      if (ny < 0 || ny >= height) continue
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) continue
        const nx = x + dx
        if (nx < 0 || nx >= width) continue
        const j = (ny * width + nx) * 4
        if (rgba[j + 3] < ALPHA_CUT) continue
        const gap = luma - (0.2126 * rgba[j] + 0.7152 * rgba[j + 1] + 0.0722 * rgba[j + 2])
        if (gap >= 42) darker += 1
      }
    }
    return darker < 2
  }

  const queue = new Int32Array(count)
  let head = 0
  let tail = 0
  const push = (index: number) => {
    if (off[index] !== 0 || !matches(index)) return
    off[index] = 1
    queue[tail] = index
    tail += 1
  }
  for (let x = 0; x < width; x += 1) {
    push(x)
    if (height > 1) push((height - 1) * width + x)
  }
  for (let y = 1; y < height - 1; y += 1) {
    push(y * width)
    if (width > 1) push(y * width + width - 1)
  }
  while (head < tail) {
    const index = queue[head]
    head += 1
    const x = index % width
    if (x > 0) push(index - 1)
    if (x + 1 < width) push(index + 1)
    if (index >= width) push(index - width)
    if (index + width < count) push(index + width)
  }
  return off
}

function selectOnMap(
  map: EdgeMap,
  rgba: Uint8ClampedArray,
  seedX: number,
  seedY: number,
  tolerance: number,
  edits?: RidgeEdits | null,
): RegionMask | null {
  let sx = Math.floor(seedX)
  let sy = Math.floor(seedY)
  const clickX = sx
  const clickY = sy
  if (sx < 0 || sy < 0 || sx >= map.fullWidth || sy >= map.fullHeight) return null
  if (map.off[sy * map.fullWidth + sx] !== 0) {
    // Cleared pixels stay empty. Opaque backdrop only snaps when the click is on the fringe.
    if (rgba[(sy * map.fullWidth + sx) * 4 + 3] < ALPHA_CUT) return null
    const snapped = nearestModel(map.off, map.fullWidth, map.fullHeight, sx, sy, 8)
    if (!snapped) return null
    sx = snapped.x
    sy = snapped.y
  }

  const blurred = blurSubject(map)
  const force = coarsenRidges(map, edits)
  try {
    let { low, high } = cannyPair(tolerance)
    const smallPhoto = map.subjectCount < 8000
    const minCount = smallPhoto ? 8 : Math.max(64, Math.floor(map.subjectCount * 0.004))
    const maxCount = smallPhoto ? map.subjectCount : Math.max(minCount + 1, Math.floor(map.subjectCount * 0.55))
    let tooBig: RegionMask | null = null
    let tooSmall: RegionMask | null = null
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const walls = cannyWalls(blurred, map, low, high, force)
      const seed = placeSeed(map, walls, sx, sy)
      if (seed < 0) {
        low = Math.min(200, low * 1.4)
        high = Math.min(240, high * 1.4)
        continue
      }
      const grown = growFrom(map, walls, seed)
      if (grown.count < 1) {
        low = Math.min(200, low * 1.4)
        high = Math.min(240, high * 1.4)
        continue
      }
      const kept = splitBridges(grown.mask, seed, map.width, map.height)
      fillEnclosed(kept, map.subject, map.width, map.height, Math.max(12, Math.floor(grown.count * 0.85)))
      // The open flood stops on the ridge, which leaves a dead rim inside the
      // plate. Those wall pixels belong to this part.
      claimRim(kept, walls, map.width, map.height, 3)
      const full = upsample(kept, map, rgba)
      const before = full.count
      // A click on the seam must select the seam, not only the plate beside it.
      claimClickGap(full, map, rgba, clickX, clickY)
      const clickIndex = clickY * map.fullWidth + clickX
      const covered =
        coversClick(full, map, sx, sy) ||
        (clickIndex >= 0 && clickIndex < full.mask.length && full.mask[clickIndex] !== 0)
      if (!covered) {
        low = Math.min(200, low * 1.35)
        high = Math.min(240, high * 1.35)
        continue
      }
      if (before >= minCount && before <= maxCount) {
        if (tooBig && full.count * 6 < tooBig.count) break
        if (tooSmall && full.count > tooSmall.count * 80 && full.count > map.subjectCount * 0.3) break
        return full
      }
      if (full.count > maxCount) {
        if (!tooBig || full.count < tooBig.count) tooBig = full
        low = Math.max(2, low * 0.72)
        high = Math.max(low + 1, high * 0.72)
      } else {
        if (!tooSmall || full.count > tooSmall.count) tooSmall = full
        low = Math.min(200, low * 1.45)
        high = Math.min(240, high * 1.45)
      }
    }
    // A flood is not a plate. A click on a seam already returned the neighboring plate above.
    const partialFloor = Math.max(8, Math.floor(minCount * 0.5))
    if (tooSmall && tooSmall.count >= partialFloor && coversClick(tooSmall, map, sx, sy)) return tooSmall
    return localFallback(map, rgba, sx, sy)
  } finally {
    blurred.delete()
  }
}

/** A seam click sits on the wall, one or two pixels outside the plate it belongs to. */
function coversClick(region: RegionMask, map: EdgeMap, sx: number, sy: number): boolean {
  const width = map.fullWidth
  const height = map.fullHeight
  const origin = sy * width + sx
  if (region.mask[origin] !== 0) return true
  const prev = new Int32Array(width * height)
  prev.fill(-2)
  const queue = new Int32Array(width * height)
  let head = 0
  let tail = 0
  queue[tail] = origin
  tail += 1
  prev[origin] = -1
  let found = -1
  while (head < tail) {
    const index = queue[head]
    head += 1
    const x = index % width
    const y = (index - x) / width
    if (Math.max(Math.abs(x - sx), Math.abs(y - sy)) > 4) continue
    if (index !== origin && region.mask[index] !== 0) {
      found = index
      break
    }
    const step = (nx: number, ny: number) => {
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) return
      const next = ny * width + nx
      if (prev[next] !== -2 || map.off[next] !== 0) return
      prev[next] = index
      queue[tail] = next
      tail += 1
    }
    step(x - 1, y)
    step(x + 1, y)
    step(x, y - 1)
    step(x, y + 1)
  }
  if (found < 0) return false
  let cursor = prev[found]
  while (cursor >= 0) {
    if (region.mask[cursor] === 0) {
      region.mask[cursor] = 255
      region.count += 1
    }
    cursor = prev[cursor]
  }
  return true
}

/** Pull the dilated ridge back onto the plate. Depth stays short so a seam cannot reach the next part. */
function claimRim(mask: Uint8Array, walls: Uint8Array, width: number, height: number, depth: number): void {
  const seen = new Uint8Array(mask.length)
  const steps = new Int16Array(mask.length)
  const queue = new Int32Array(mask.length)
  let head = 0
  let tail = 0
  for (let i = 0; i < mask.length; i += 1) {
    if (mask[i] === 0) continue
    seen[i] = 1
    queue[tail] = i
    tail += 1
  }
  while (head < tail) {
    const index = queue[head]
    head += 1
    if (steps[index] >= depth) continue
    const x = index % width
    const y = (index - x) / width
    const nextStep = steps[index] + 1
    const visit = (nx: number, ny: number) => {
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) return
      const next = ny * width + nx
      if (seen[next] !== 0 || walls[next] === 0) return
      seen[next] = 1
      steps[next] = nextStep
      mask[next] = 1
      queue[tail] = next
      tail += 1
    }
    if (x > 0) visit(x - 1, y)
    if (x + 1 < width) visit(x + 1, y)
    if (y > 0) visit(x, y - 1)
    if (y + 1 < height) visit(x, y + 1)
  }
}

/**
 * A click on a ridge used to resolve to the neighboring plate. The plate was
 * already in the section, so Add reported "already in the section" and left
 * the ridge out. Take the connected ridge pixels around the click instead.
 */
function claimClickGap(
  region: RegionMask,
  map: EdgeMap,
  rgba: Uint8ClampedArray,
  clickX: number,
  clickY: number,
): void {
  const width = map.fullWidth
  const height = map.fullHeight
  if (clickX < 0 || clickY < 0 || clickX >= width || clickY >= height) return
  const origin = clickY * width + clickX
  if (rgba[origin * 4 + 3] < ALPHA_CUT || region.mask[origin] !== 0) return
  const radius = 96
  const isGap = (index: number, x: number, y: number): boolean => {
    if (region.mask[index] !== 0) return false
    if (rgba[index * 4 + 3] < ALPHA_CUT) return false
    if (Math.max(Math.abs(x - clickX), Math.abs(y - clickY)) > radius) return false
    const cx = Math.min(map.width - 1, Math.floor(x / map.scale))
    const cy = Math.min(map.height - 1, Math.floor(y / map.scale))
    if (map.edge[cy * map.width + cx] !== 0) return true
    if (map.off[index] === 0) return false
    const luma = 0.2126 * rgba[index * 4] + 0.7152 * rgba[index * 4 + 1] + 0.0722 * rgba[index * 4 + 2]
    return enclosedByPlastic(rgba, width, height, index, luma)
  }
  if (!isGap(origin, clickX, clickY)) return
  const seen = new Uint8Array(width * height)
  const queue = new Int32Array(width * height)
  let head = 0
  let tail = 0
  seen[origin] = 1
  queue[tail] = origin
  tail += 1
  while (head < tail) {
    const index = queue[head]
    head += 1
    if (region.mask[index] === 0) {
      region.mask[index] = 255
      region.count += 1
    }
    const x = index % width
    const y = (index - x) / width
    const step = (nx: number, ny: number) => {
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) return
      const next = ny * width + nx
      if (seen[next] !== 0 || !isGap(next, nx, ny)) return
      seen[next] = 1
      queue[tail] = next
      tail += 1
    }
    step(x - 1, y)
    step(x + 1, y)
    step(x, y - 1)
    step(x, y + 1)
  }
}

function suggestOnMap(
  map: EdgeMap,
  rgba: Uint8ClampedArray,
  tolerance: number,
  edits?: RidgeEdits | null,
): RegionMask[] {
  const walls = wallsFor(map, tolerance, edits)
  const labels = labelOpen(map, walls)
  mergeFragments(labels, map)
  const masks = masksFromLabels(labels, map)
  if (masks.length < 2) return []
  return masks
    .map((coarse) => upsample(coarse, map, rgba))
    .filter((entry) => entry.count >= Math.max(24, Math.floor(opaqueCount(rgba) * 0.004)))
}

function opaqueCount(rgba: Uint8ClampedArray): number {
  let count = 0
  for (let i = 3; i < rgba.length; i += 4) if (rgba[i] >= ALPHA_CUT) count += 1
  return count
}

function chooseScale(width: number, height: number): number {
  const maxSide = Math.max(width, height)
  if (maxSide <= WORK_SIDE) return 1
  return Math.max(2, Math.round(maxSide / WORK_SIDE))
}

function cannyPair(tolerance: number): { low: number; high: number } {
  const high = clamp(20 + (tolerance / 48) * 30, 12, 140)
  const low = Math.max(5, high * 0.4)
  return { low, high }
}

function wallsFor(
  map: EdgeMap,
  tolerance: number,
  edits?: RidgeEdits | null,
  includeAdds = true,
): Uint8Array {
  const blurred = blurSubject(map)
  try {
    const { low, high } = cannyPair(tolerance)
    let force = coarsenRidges(map, edits)
    if (force && !includeAdds) {
      const erased = new Uint8Array(force.length)
      for (let i = 0; i < force.length; i += 1) if (force[i] === 2) erased[i] = 2
      force = erased
    }
    return cannyWalls(blurred, map, low, high, force)
  } finally {
    blurred.delete()
  }
}

/**
 * Coarse force map. 1 = user ridge, 2 = user suppression, 0 = leave Canny alone.
 * Add wins inside a cell that contains both.
 */
function coarsenRidges(map: EdgeMap, edits?: RidgeEdits | null): Uint8Array | null {
  if (!edits) return null
  const count = map.fullWidth * map.fullHeight
  if (edits.add.length !== count || edits.erase.length !== count) return null
  let touched = false
  for (let i = 0; i < count; i += 1) {
    if (edits.add[i] !== 0 || edits.erase[i] !== 0) {
      touched = true
      break
    }
  }
  if (!touched) return null
  const force = new Uint8Array(map.width * map.height)
  const { scale, width, height, fullWidth, fullHeight } = map
  for (let y = 0; y < fullHeight; y += 1) {
    const cy = Math.min(height - 1, Math.floor(y / scale))
    const row = y * fullWidth
    const coarseRow = cy * width
    for (let x = 0; x < fullWidth; x += 1) {
      const pixel = row + x
      const index = coarseRow + Math.min(width - 1, Math.floor(x / scale))
      if (edits.add[pixel] !== 0) force[index] = 1
      else if (force[index] === 0 && edits.erase[pixel] !== 0) force[index] = 2
    }
  }
  return dilateForce(force, width, height)
}

/**
 * An erased ridge covers the cell beside it, so Canny's own dilation cannot
 * revive a one-pixel seam. An added ridge is left on the cells the stroke
 * actually covers — widening it would outline the paint instead of using it.
 */
function dilateForce(force: Uint8Array, width: number, height: number): Uint8Array {
  const next = force.slice()
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (force[y * width + x] !== 2) continue
      for (let dy = -1; dy <= 1; dy += 1) {
        const ny = y + dy
        if (ny < 0 || ny >= height) continue
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = x + dx
          if (nx < 0 || nx >= width) continue
          const index = ny * width + nx
          if (next[index] !== 1) next[index] = 2
        }
      }
    }
  }
  return next
}

/**
 * OpenCV Canny on the miniature. Off-model pixels continue the local slope,
 * so a shade ramp does not kink into a flat fill and become a fake edge.
 */
function blurSubject(map: EdgeMap): CvMat {
  const { width, height, luma, subject } = map
  const gray = new Uint8Array(width * height)
  const source = new Int32Array(width * height)
  source.fill(-1)
  for (let i = 0; i < gray.length; i += 1) {
    if (subject[i] === 0) continue
    gray[i] = clamp(Math.round(luma[i]), 1, 255)
    source[i] = i
  }
  const queue = new Int32Array(gray.length)
  let tail = 0
  for (let i = 0; i < subject.length; i += 1) if (subject[i] !== 0) queue[tail++] = i
  let head = 0
  while (head < tail) {
    const index = queue[head++]
    const x = index % width
    const y = (index - x) / width
    const push = (nx: number, ny: number) => {
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) return
      const next = ny * width + nx
      if (source[next] !== -1) return
      source[next] = source[index]
      queue[tail++] = next
    }
    if (x > 0) push(x - 1, y)
    if (x + 1 < width) push(x + 1, y)
    if (y > 0) push(x, y - 1)
    if (y + 1 < height) push(x, y + 1)
  }
  for (let i = 0; i < gray.length; i += 1) {
    if (subject[i] !== 0 || source[i] < 0) continue
    const sx = source[i] % width
    const sy = (source[i] - sx) / width
    const x = i % width
    const y = (i - x) / width
    const rx = sx + (sx - x)
    const ry = sy + (sy - y)
    let value = gray[source[i]]
    if (rx >= 0 && ry >= 0 && rx < width && ry < height && subject[ry * width + rx] !== 0) {
      value = 2 * gray[source[i]] - gray[ry * width + rx]
    }
    gray[i] = clamp(Math.round(value), 1, 255)
  }
  const src = cv.matFromArray(height, width, cv.CV_8UC1, gray)
  const blurred = new cv.Mat()
  cv.GaussianBlur(src, blurred, new cv.Size(5, 5), 1.1, 1.1, cv.BORDER_REPLICATE)
  src.delete()
  return blurred
}

function cannyWalls(
  blurred: CvMat,
  map: EdgeMap,
  low: number,
  high: number,
  force?: Uint8Array | null,
): Uint8Array {
  const edges = new cv.Mat()
  const dx = new cv.Mat()
  const dy = new cv.Mat()
  const dilated = new cv.Mat()
  const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3))
  try {
    cv.Sobel(blurred, dx, cv.CV_16S, 1, 0, 3, 1, 0, cv.BORDER_REPLICATE)
    cv.Sobel(blurred, dy, cv.CV_16S, 0, 1, 3, 1, 0, cv.BORDER_REPLICATE)
    cv.Canny(blurred, edges, low, Math.max(high, low + 1), 3, true)
    const rim = inwardRim(map.subject, map.width, map.height, 5)
    const kept = new Uint8Array(map.width * map.height)
    const raw = edges.data
    for (let i = 0; i < kept.length; i += 1) {
      if (map.subject[i] === 0 || raw[i] === 0) continue
      if (rimEcho(dx, dy, rim, i, high)) continue
      kept[i] = 255
    }
    const keptMat = cv.matFromArray(map.height, map.width, cv.CV_8UC1, kept)
    cv.dilate(keptMat, dilated, kernel)
    keptMat.delete()
    const src = dilated.data
    const walls = new Uint8Array(map.width * map.height)
    for (let i = 0; i < walls.length; i += 1) {
      const on = map.subject[i] !== 0 && src[i] !== 0 && !rimEcho(dx, dy, rim, i, high)
      walls[i] = on ? 1 : 0
      map.edge[i] = on ? 255 : 0
    }
    if (force && force.length === walls.length) {
      for (let i = 0; i < walls.length; i += 1) {
        if (force[i] === 2) walls[i] = 0
        else if (force[i] === 1 && map.subject[i] !== 0) walls[i] = 1
        map.edge[i] = walls[i] ? 255 : 0
      }
    }
    return walls
  } finally {
    edges.delete()
    dx.delete()
    dy.delete()
    dilated.delete()
    kernel.delete()
  }
}

type InwardRim = { dist: Uint8Array; dirX: Int8Array; dirY: Int8Array }

function inwardRim(subject: Uint8Array, width: number, height: number, radius: number): InwardRim {
  const count = width * height
  const dist = new Uint8Array(count)
  const dirX = new Int8Array(count)
  const dirY = new Int8Array(count)
  const queue = new Int32Array(count)
  let tail = 0
  for (let i = 0; i < count; i += 1) {
    if (subject[i] !== 0) continue
    dist[i] = 1
    queue[tail] = i
    tail += 1
  }
  let head = 0
  while (head < tail) {
    const index = queue[head]
    head += 1
    if (dist[index] > radius) continue
    const x = index % width
    const step = (nx: number, ny: number, sx: number, sy: number) => {
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) return
      const next = ny * width + nx
      if (dist[next] !== 0) return
      dist[next] = dist[index] + 1
      dirX[next] = sx
      dirY[next] = sy
      queue[tail] = next
      tail += 1
    }
    step(x - 1, (index - x) / width, -1, 0)
    step(x + 1, (index - x) / width, 1, 0)
    step(x, (index - x) / width - 1, 0, -1)
    step(x, (index - x) / width + 1, 0, 1)
  }
  return { dist, dirX, dirY }
}

function sobelSample(mat: CvMat, index: number): number {
  const offset = index * 2
  const value = mat.data[offset] | (mat.data[offset + 1] << 8)
  return value > 32767 ? value - 65536 : value
}

/** A shade ramp kinks where the flat outside fill meets it, a few pixels inside the outline. */
function rimEcho(dx: CvMat, dy: CvMat, rim: InwardRim, index: number, high: number): boolean {
  const distance = rim.dist[index]
  if (distance < 2 || distance > 6) return false
  const gx = sobelSample(dx, index)
  const gy = sobelSample(dy, index)
  const mag = Math.hypot(gx, gy)
  if (mag >= high || mag < 1) return false
  const along = Math.abs(gx * rim.dirX[index] + gy * rim.dirY[index]) / mag
  return along > 0.75
}

function localFallback(
  map: EdgeMap,
  rgba: Uint8ClampedArray,
  fullX: number,
  fullY: number,
): RegionMask | null {
  const { width, height, scale, subject } = map
  const cx = clamp(Math.floor(fullX / scale), 0, width - 1)
  const cy = clamp(Math.floor(fullY / scale), 0, height - 1)
  const origin = cy * width + cx
  if (subject[origin] === 0) return null
  const walls = new Uint8Array(width * height)
  const radius = 18
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (subject[y * width + x] === 0) continue
      if (Math.abs(x - cx) > radius || Math.abs(y - cy) > radius) walls[y * width + x] = 1
    }
  }
  const mask = new Uint8Array(width * height)
  const queue = new Int32Array(width * height)
  let head = 0
  let tail = 0
  mask[origin] = 1
  queue[tail++] = origin
  let count = 1
  while (head < tail) {
    const index = queue[head++]
    const x = index % width
    const step = (next: number) => {
      if (mask[next] !== 0 || subject[next] === 0 || walls[next] !== 0) return
      mask[next] = 1
      count += 1
      queue[tail++] = next
    }
    if (x > 0) step(index - 1)
    if (x + 1 < width) step(index + 1)
    if (index >= width) step(index - width)
    if (index + width < mask.length) step(index + width)
  }
  if (count < 1) return null
  return upsample(mask, map, rgba)
}

/** Snap the click onto the local plate, then take in the flat neighborhood. */
function placeSeed(map: EdgeMap, walls: Uint8Array, fullX: number, fullY: number): number {
  const { width, height, scale, subject, edge, luma } = map
  let cx = clamp(Math.floor(fullX / scale), 0, width - 1)
  let cy = clamp(Math.floor(fullY / scale), 0, height - 1)
  if (subject[cy * width + cx] === 0) {
    const found = nearestSubject(subject, width, height, cx, cy, 4)
    if (found < 0) return -1
    cx = found % width
    cy = (found - cx) / width
  }
  const origin = cy * width + cx
  const clickLum = luma[origin]
  const radius = Math.max(4, Math.round(Math.max(width, height) / 78))
  let best = origin
  let bestScore = Number.POSITIVE_INFINITY
  const y0 = Math.max(0, cy - radius)
  const y1 = Math.min(height - 1, cy + radius)
  const x0 = Math.max(0, cx - radius)
  const x1 = Math.min(width - 1, cx + radius)
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const index = y * width + x
      if (subject[index] === 0) continue
      if (Math.abs(luma[index] - clickLum) > 36) continue
      const dx = x - cx
      const dy = y - cy
      const score = edge[index] * 800 + dx * dx + dy * dy + (walls[index] ? 400 : 0)
      if (score < bestScore) {
        bestScore = score
        best = index
      }
    }
  }
  // A click on a seam is a ridge. Step into the nearest open plate.
  if (walls[best] !== 0) {
    const escaped = nearestPlate(subject, walls, width, height, best)
    if (escaped < 0) return -1
    best = escaped
  }

  const mask = new Uint8Array(width * height)
  const queue = new Int32Array(width * height)
  let head = 0
  let tail = 0
  mask[best] = 1
  queue[tail] = best
  tail += 1
  const reach = radius + 2
  const bx = best % width
  const by = (best - bx) / width
  const flat = edge[best] + 0.15
  while (head < tail) {
    const index = queue[head]
    head += 1
    const x = index % width
    const y = (index - x) / width
    const step = (nx: number, ny: number, nIndex: number) => {
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) return
      if (mask[nIndex] !== 0 || subject[nIndex] === 0 || walls[nIndex] !== 0) return
      if (Math.abs(nx - bx) > reach || Math.abs(ny - by) > reach) return
      if (edge[nIndex] > flat && edge[nIndex] > edge[best] * 1.8 + 0.2) return
      mask[nIndex] = 1
      queue[tail] = nIndex
      tail += 1
    }
    step(x - 1, y, index - 1)
    step(x + 1, y, index + 1)
    step(x, y - 1, index - width)
    step(x, y + 1, index + width)
  }
  // Grow from the whole flat seed, but remember a pixel inside it.
  // Callers only need one index that sits in the seed component.
  mapSeedScratch.set(map, mask)
  return best
}

const mapSeedScratch = new WeakMap<EdgeMap, Uint8Array>()

function growFrom(map: EdgeMap, walls: Uint8Array, seed: number): { mask: Uint8Array; count: number } {
  const { width, height, subject } = map
  const mask = new Uint8Array(width * height)
  const queue = new Int32Array(width * height)
  let head = 0
  let tail = 0
  let count = 0
  const push = (index: number) => {
    if (mask[index] !== 0 || subject[index] === 0 || walls[index] !== 0) return
    mask[index] = 1
    count += 1
    queue[tail] = index
    tail += 1
  }
  const preset = mapSeedScratch.get(map)
  mapSeedScratch.delete(map)
  if (preset) {
    for (let i = 0; i < preset.length; i += 1) if (preset[i] !== 0) push(i)
  }
  if (count === 0 && subject[seed] !== 0 && walls[seed] === 0) push(seed)
  if (count === 0) return { mask, count: 0 }
  while (head < tail) {
    const index = queue[head]
    head += 1
    const x = index % width
    if (x > 0) push(index - 1)
    if (x + 1 < width) push(index + 1)
    if (index >= width) push(index - width)
    if (index + width < mask.length) push(index + width)
  }
  return { mask, count }
}

/**
 * Thick parts joined by a narrow neck split at the neck. A part that is thin
 * all over (a weapon shaft) stays intact because erosion cannot find a second core.
 */
function splitBridges(mask: Uint8Array, seed: number, width: number, height: number): Uint8Array {
  const dist = chamfer(mask, width, height)
  const seedPx = dist[seed] / 3
  if (seedPx < 3.2) return mask
  const maxR = Math.max(2, Math.round(Math.min(width, height) / 55))
  const radiusPx = Math.min(maxR, Math.max(2, Math.floor(seedPx * 0.42)))
  const radius = radiusPx * 3
  const markers = new Int32Array(width * height)
  let labels = 0
  const stack: number[] = []
  for (let start = 0; start < mask.length; start += 1) {
    if (mask[start] === 0 || dist[start] < radius || markers[start] !== 0) continue
    labels += 1
    markers[start] = labels
    stack.push(start)
    while (stack.length > 0) {
      const index = stack.pop() as number
      const x = index % width
      if (x > 0) take(index - 1)
      if (x + 1 < width) take(index + 1)
      if (index >= width) take(index - width)
      if (index + width < mask.length) take(index + width)
    }
  }
  if (labels <= 1) return mask

  function take(index: number): void {
    if (mask[index] === 0 || dist[index] < radius || markers[index] !== 0) return
    markers[index] = labels
    stack.push(index)
  }

  const owner = geodesicLabels(mask, markers, width, height)
  let keep = owner[seed]
  if (keep === 0) {
    const nearest = nearestLabeled(owner, mask, width, height, seed)
    if (nearest < 0) return mask
    keep = owner[nearest]
  }
  const next = new Uint8Array(width * height)
  for (let i = 0; i < next.length; i += 1) if (owner[i] === keep) next[i] = 1
  if (next[seed] === 0) next[seed] = 1
  return next
}

function fillEnclosed(mask: Uint8Array, subject: Uint8Array, width: number, height: number, maxHole: number): void {
  const seen = new Uint8Array(width * height)
  const queue = new Int32Array(width * height)
  let head = 0
  let tail = 0
  const pushOutside = (index: number) => {
    if (seen[index] !== 0 || mask[index] !== 0) return
    seen[index] = 1
    queue[tail] = index
    tail += 1
  }
  for (let x = 0; x < width; x += 1) {
    pushOutside(x)
    if (height > 1) pushOutside((height - 1) * width + x)
  }
  for (let y = 1; y < height - 1; y += 1) {
    pushOutside(y * width)
    pushOutside(y * width + width - 1)
  }
  while (head < tail) {
    const index = queue[head]
    head += 1
    const x = index % width
    if (x > 0) pushOutside(index - 1)
    if (x + 1 < width) pushOutside(index + 1)
    if (index >= width) pushOutside(index - width)
    if (index + width < mask.length) pushOutside(index + width)
  }

  const holeLabel = new Int32Array(width * height)
  let next = 0
  const sizes: number[] = []
  const stack: number[] = []
  for (let start = 0; start < mask.length; start += 1) {
    if (seen[start] !== 0 || mask[start] !== 0 || subject[start] === 0 || holeLabel[start] !== 0) continue
    next += 1
    holeLabel[start] = next
    stack.push(start)
    let size = 0
    while (stack.length > 0) {
      const index = stack.pop() as number
      size += 1
      const x = index % width
      if (x > 0) takeHole(index - 1)
      if (x + 1 < width) takeHole(index + 1)
      if (index >= width) takeHole(index - width)
      if (index + width < mask.length) takeHole(index + width)
    }
    sizes.push(size)
  }

  function takeHole(index: number): void {
    if (seen[index] !== 0 || mask[index] !== 0 || subject[index] === 0 || holeLabel[index] !== 0) return
    holeLabel[index] = next
    stack.push(index)
  }

  for (let i = 0; i < mask.length; i += 1) {
    const label = holeLabel[i]
    if (label !== 0 && sizes[label - 1] <= maxHole) mask[i] = 1
  }
}

/** Each open area inside the ridges is one part. Wall pixels join the nearest part and do not bridge two areas. */
function labelOpen(map: EdgeMap, walls: Uint8Array): Int32Array {
  const { width, subject } = map
  const labels = new Int32Array(subject.length)
  const stack: number[] = []
  let next = 0
  for (let start = 0; start < labels.length; start += 1) {
    if (subject[start] === 0 || walls[start] !== 0 || labels[start] !== 0) continue
    next += 1
    labels[start] = next
    stack.push(start)
    while (stack.length > 0) {
      const index = stack.pop() as number
      const x = index % width
      const visit = (nextIndex: number) => {
        if (labels[nextIndex] !== 0 || subject[nextIndex] === 0 || walls[nextIndex] !== 0) return
        labels[nextIndex] = next
        stack.push(nextIndex)
      }
      if (x > 0) visit(index - 1)
      if (x + 1 < width) visit(index + 1)
      if (index >= width) visit(index - width)
      if (index + width < labels.length) visit(index + width)
    }
  }

  const queue = new Int32Array(subject.length)
  let head = 0
  let tail = 0
  for (let i = 0; i < labels.length; i += 1) {
    if (labels[i] === 0) continue
    queue[tail] = i
    tail += 1
  }
  while (head < tail) {
    const index = queue[head]
    head += 1
    const label = labels[index]
    const x = index % width
    const visit = (nextIndex: number) => {
      if (labels[nextIndex] !== 0 || walls[nextIndex] === 0) return
      labels[nextIndex] = label
      queue[tail] = nextIndex
      tail += 1
    }
    if (x > 0) visit(index - 1)
    if (x + 1 < width) visit(index + 1)
    if (index >= width) visit(index - width)
    if (index + width < labels.length) visit(index + width)
  }
  return labels
}

function mergeFragments(labels: Int32Array, map: EdgeMap): void {
  const { width, height, subjectCount } = map
  let maxLabel = 0
  for (let i = 0; i < labels.length; i += 1) if (labels[i] > maxLabel) maxLabel = labels[i]
  if (maxLabel < 2) return
  const parent = new Int32Array(maxLabel + 1)
  for (let i = 0; i <= maxLabel; i += 1) parent[i] = i
  const find = (id: number): number => {
    let cursor = id
    while (parent[cursor] !== cursor) cursor = parent[cursor]
    let back = id
    while (parent[back] !== cursor) {
      const next = parent[back]
      parent[back] = cursor
      back = next
    }
    return cursor
  }
  const sizes = new Int32Array(maxLabel + 1)
  for (let i = 0; i < labels.length; i += 1) {
    const id = labels[i]
    if (id !== 0) sizes[id] += 1
  }
  const minKeep = Math.max(48, Math.floor(subjectCount * 0.008))

  for (let pass = 0; pass < 6; pass += 1) {
    const touch = new Map<string, { a: number; b: number; n: number }>()
    const note = (left: number, right: number) => {
      if (right === 0 || left === right) return
      const a = find(Math.min(left, right))
      const b = find(Math.max(left, right))
      if (a === b) return
      const key = a < b ? `${a}:${b}` : `${b}:${a}`
      const pair = touch.get(key)
      if (pair) pair.n += 1
      else touch.set(key, { a, b, n: 1 })
    }
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const id = labels[y * width + x]
        if (id === 0) continue
        if (x + 1 < width) note(id, labels[y * width + x + 1])
        if (y + 1 < height) note(id, labels[(y + 1) * width + x])
      }
    }
    const best = new Map<number, { other: number; n: number }>()
    for (const pair of touch.values()) {
      const consider = (id: number, other: number) => {
        if (sizes[id] <= 0 || sizes[id] >= minKeep) return
        const prev = best.get(id)
        if (!prev || pair.n > prev.n) best.set(id, { other, n: pair.n })
      }
      consider(pair.a, pair.b)
      consider(pair.b, pair.a)
    }
    if (best.size === 0) break
    const order = [...best.keys()].sort((a, b) => sizes[a] - sizes[b])
    for (const id of order) {
      const root = find(id)
      if (sizes[root] >= minKeep) continue
      const pick = best.get(id)
      if (!pick) continue
      const other = find(pick.other)
      if (other === root) continue
      parent[root] = other
      sizes[other] += sizes[root]
      sizes[root] = 0
    }
  }

  for (let i = 0; i < labels.length; i += 1) {
    const id = labels[i]
    if (id !== 0) labels[i] = find(id)
  }
}

function masksFromLabels(labels: Int32Array, map: EdgeMap): Uint8Array[] {
  const areas = new Map<number, number>()
  for (let i = 0; i < labels.length; i += 1) {
    const id = labels[i]
    if (id !== 0) areas.set(id, (areas.get(id) ?? 0) + 1)
  }
  const minSize = Math.max(18, Math.floor(map.subjectCount * 0.008))
  const ids = [...areas.entries()]
    .filter((entry) => entry[1] >= minSize)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map((entry) => entry[0])
  return ids.map((id) => {
    const mask = new Uint8Array(labels.length)
    for (let i = 0; i < labels.length; i += 1) if (labels[i] === id) mask[i] = 1
    return mask
  })
}

function upsample(coarse: Uint8Array, map: EdgeMap, rgba: Uint8ClampedArray): RegionMask {
  const { fullWidth, fullHeight, width, height, scale } = map
  const mask = new Uint8Array(fullWidth * fullHeight)
  let count = 0
  for (let y = 0; y < fullHeight; y += 1) {
    const cy = Math.min(height - 1, Math.floor(y / scale))
    const row = y * fullWidth
    const coarseRow = cy * width
    for (let x = 0; x < fullWidth; x += 1) {
      const pixel = row + x
      if (map.off[pixel] !== 0 || rgba[pixel * 4 + 3] < ALPHA_CUT) continue
      const cx = Math.min(width - 1, Math.floor(x / scale))
      if (coarse[coarseRow + cx] === 0) continue
      mask[row + x] = 255
      count += 1
    }
  }
  return { mask, count }
}

function chamfer(mask: Uint8Array, width: number, height: number): Uint16Array {
  const dist = new Uint16Array(width * height)
  const inf = 65535
  for (let i = 0; i < dist.length; i += 1) dist[i] = mask[i] !== 0 ? inf : 0
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x
      if (dist[index] === 0) continue
      let best = dist[index]
      if (x > 0) best = Math.min(best, dist[index - 1] + 3)
      if (y > 0) best = Math.min(best, dist[index - width] + 3)
      if (x > 0 && y > 0) best = Math.min(best, dist[index - width - 1] + 4)
      if (x + 1 < width && y > 0) best = Math.min(best, dist[index - width + 1] + 4)
      dist[index] = best
    }
  }
  for (let y = height - 1; y >= 0; y -= 1) {
    for (let x = width - 1; x >= 0; x -= 1) {
      const index = y * width + x
      if (dist[index] === 0) continue
      let best = dist[index]
      if (x + 1 < width) best = Math.min(best, dist[index + 1] + 3)
      if (y + 1 < height) best = Math.min(best, dist[index + width] + 3)
      if (x + 1 < width && y + 1 < height) best = Math.min(best, dist[index + width + 1] + 4)
      if (x > 0 && y + 1 < height) best = Math.min(best, dist[index + width - 1] + 4)
      dist[index] = best
    }
  }
  return dist
}

function geodesicLabels(mask: Uint8Array, markers: Int32Array, width: number, height: number): Int32Array {
  const labels = new Int32Array(width * height)
  const queue = new Int32Array(width * height)
  let head = 0
  let tail = 0
  for (let i = 0; i < markers.length; i += 1) {
    if (markers[i] === 0) continue
    labels[i] = markers[i]
    queue[tail] = i
    tail += 1
  }
  while (head < tail) {
    const index = queue[head]
    head += 1
    const label = labels[index]
    const x = index % width
    const visit = (next: number) => {
      if (labels[next] !== 0 || mask[next] === 0) return
      labels[next] = label
      queue[tail] = next
      tail += 1
    }
    if (x > 0) visit(index - 1)
    if (x + 1 < width) visit(index + 1)
    if (index >= width) visit(index - width)
    if (index + width < labels.length) visit(index + width)
  }
  return labels
}

function nearestLabeled(labels: Int32Array, mask: Uint8Array, width: number, height: number, seed: number): number {
  const seen = new Uint8Array(width * height)
  const queue = new Int32Array(width * height)
  let head = 0
  let tail = 0
  seen[seed] = 1
  queue[tail] = seed
  tail += 1
  while (head < tail) {
    const index = queue[head]
    head += 1
    if (labels[index] !== 0) return index
    const x = index % width
    const visit = (next: number) => {
      if (seen[next] !== 0 || mask[next] === 0) return
      seen[next] = 1
      queue[tail] = next
      tail += 1
    }
    if (x > 0) visit(index - 1)
    if (x + 1 < width) visit(index + 1)
    if (index >= width) visit(index - width)
    if (index + width < labels.length) visit(index + width)
  }
  return -1
}

/** Walk off a ridge to the closest open plate, skipping pinholes between spikes. */
function nearestPlate(
  subject: Uint8Array,
  walls: Uint8Array,
  width: number,
  height: number,
  origin: number,
): number {
  const seen = new Uint8Array(subject.length)
  const queue = new Int32Array(subject.length)
  let head = 0
  let tail = 0
  seen[origin] = 1
  queue[tail] = origin
  tail += 1
  const limit = 28
  const ox = origin % width
  const oy = (origin - ox) / width
  while (head < tail) {
    const index = queue[head]
    head += 1
    const x = index % width
    const y = (index - x) / width
    if (Math.abs(x - ox) > limit || Math.abs(y - oy) > limit) continue
    if (index !== origin && walls[index] === 0 && openRun(subject, walls, width, height, index) >= 36) return index
    const step = (next: number) => {
      if (seen[next] !== 0 || subject[next] === 0) return
      seen[next] = 1
      queue[tail] = next
      tail += 1
    }
    if (x > 0) step(index - 1)
    if (x + 1 < width) step(index + 1)
    if (index >= width) step(index - width)
    if (index + width < subject.length) step(index + width)
  }
  return -1
}

function openRun(
  subject: Uint8Array,
  walls: Uint8Array,
  width: number,
  height: number,
  start: number,
): number {
  const seen = new Uint8Array(subject.length)
  const stack = [start]
  seen[start] = 1
  let count = 0
  while (stack.length > 0 && count < 36) {
    const index = stack.pop() as number
    if (subject[index] === 0 || walls[index] !== 0) continue
    count += 1
    const x = index % width
    const push = (next: number) => {
      if (seen[next] !== 0) return
      seen[next] = 1
      stack.push(next)
    }
    if (x > 0) push(index - 1)
    if (x + 1 < width) push(index + 1)
    if (index >= width) push(index - width)
    if (index + width < height * width) push(index + width)
  }
  return count
}

function nearestModel(
  off: Uint8Array,
  width: number,
  height: number,
  cx: number,
  cy: number,
  radius: number,
): { x: number; y: number } | null {
  let bestX = -1
  let bestY = -1
  let bestD = Infinity
  const y0 = Math.max(0, cy - radius)
  const y1 = Math.min(height - 1, cy + radius)
  const x0 = Math.max(0, cx - radius)
  const x1 = Math.min(width - 1, cx + radius)
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      if (off[y * width + x] !== 0) continue
      const d = (x - cx) * (x - cx) + (y - cy) * (y - cy)
      if (d < bestD) {
        bestD = d
        bestX = x
        bestY = y
      }
    }
  }
  if (bestX < 0) return null
  return { x: bestX, y: bestY }
}

function nearestSubject(subject: Uint8Array, width: number, height: number, cx: number, cy: number, radius: number): number {
  let best = -1
  let bestD = Infinity
  const y0 = Math.max(0, cy - radius)
  const y1 = Math.min(height - 1, cy + radius)
  const x0 = Math.max(0, cx - radius)
  const x1 = Math.min(width - 1, cx + radius)
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const index = y * width + x
      if (subject[index] === 0) continue
      const d = (x - cx) * (x - cx) + (y - cy) * (y - cy)
      if (d < bestD) {
        bestD = d
        best = index
      }
    }
  }
  return best
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}
