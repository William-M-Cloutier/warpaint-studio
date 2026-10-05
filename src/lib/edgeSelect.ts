/**
 * Edge-first region selection for grey miniatures.
 *
 * Walls are thin crests: Sobel magnitude with non-maximum suppression, and a
 * narrow-crease term (fine blur minus a wider blur). A soft highlight is a
 * shallow ramp, so both responses stay weak and the wand walks across it.
 * A sculpt seam is a sharp jump or a thin dark line, and it stays a wall.
 * Plain gradient hysteresis on this photo either chops a plate into texture
 * or merges chest, shield, and base — the crease term is what separates them.
 * Growth is hard-gated to the miniature (cutout alpha, and any border-connected
 * backdrop that is still opaque). Suggest uses the same edges.
 */

const ALPHA_CUT = 16
const WORK_SIDE = 760

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
): RegionMask | null {
  const map = buildEdgeMap(rgba, width, height)
  return selectOnMap(map, rgba, seedX, seedY, tolerance)
}

export function suggestRegions(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  tolerance: number,
): Uint8Array[] {
  if (width < 8 || height < 8) return []
  const map = buildEdgeMap(rgba, width, height)
  if (map.subjectCount < 32) return []
  return suggestOnMap(map, rgba, tolerance).map((entry) => entry.mask)
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

  const edge = ridgeField(luma, subject, cw, ch)
  return { fullWidth: width, fullHeight: height, width: cw, height: ch, scale, subject, edge, luma, subjectCount, off }
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
): RegionMask | null {
  let sx = Math.floor(seedX)
  let sy = Math.floor(seedY)
  if (sx < 0 || sy < 0 || sx >= map.fullWidth || sy >= map.fullHeight) return null
  if (map.off[sy * map.fullWidth + sx] !== 0) {
    // Cleared pixels stay empty. Opaque backdrop only snaps when the click is on the fringe.
    if (rgba[(sy * map.fullWidth + sx) * 4 + 3] < ALPHA_CUT) return null
    const snapped = nearestModel(map.off, map.fullWidth, map.fullHeight, sx, sy, 8)
    if (!snapped) return null
    sx = snapped.x
    sy = snapped.y
  }

  const walls = wallsFor(map, tolerance)
  const seed = placeSeed(map, walls, sx, sy)
  if (seed < 0) return null
  const grown = growFrom(map, walls, seed)
  const kept = splitBridges(grown.mask, seed, map.width, map.height)
  fillEnclosed(kept, map.subject, map.width, map.height, Math.max(12, Math.floor(grown.count * 0.45)))
  return upsample(kept, map, rgba)
}

function suggestOnMap(map: EdgeMap, rgba: Uint8ClampedArray, tolerance: number): RegionMask[] {
  const walls = wallsFor(map, tolerance)
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

/**
 * Crest map used as walls. Sobel magnitude is thinned like Canny (non-maximum
 * suppression on a light blur). The narrow-crease term is high only where a
 * thin line differs from its neighborhood, and near zero on a linear ramp.
 * Each is scaled by its own peak so a strong seam lands near 40.
 */
function ridgeField(luma: Float32Array, subject: Uint8Array, width: number, height: number): Float32Array {
  const maxSide = Math.max(width, height)
  const fine = boxBlur(luma, subject, width, height, 1)
  const broad = boxBlur(luma, subject, width, height, Math.max(3, Math.round(maxSide / 100)))
  const dog = new Float32Array(width * height)
  for (let i = 0; i < dog.length; i += 1) {
    if (subject[i] === 0) continue
    dog[i] = Math.abs(fine[i] - broad[i])
  }
  const dogRidge = thinRidge(boxBlur(dog, subject, width, height, 1), subject, width, height)
  const stepRidge = gradientRidge(luma, subject, width, height)
  const dogPeak = Math.max(quantile(dogRidge, subject, 0.995), 1)
  const stepPeak = Math.max(quantile(stepRidge, subject, 0.995), 1)
  const edge = new Float32Array(width * height)
  for (let i = 0; i < edge.length; i += 1) {
    if (subject[i] === 0) continue
    edge[i] = Math.max(dogRidge[i] / dogPeak, stepRidge[i] / stepPeak) * 40
  }
  return edge
}

/** Crest of the luminance gradient. A linear shade ramp is flat, so it drops out. */
function gradientRidge(luma: Float32Array, subject: Uint8Array, width: number, height: number): Float32Array {
  const smooth = boxBlur(luma, subject, width, height, 2)
  const mag = new Float32Array(width * height)
  const gx = new Float32Array(width * height)
  const gy = new Float32Array(width * height)
  const at = (x: number, y: number, fallback: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return fallback
    const index = y * width + x
    return subject[index] === 0 ? fallback : smooth[index]
  }
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x
      if (subject[index] === 0) continue
      const center = smooth[index]
      const gxx =
        -at(x - 1, y - 1, center) +
        at(x + 1, y - 1, center) -
        2 * at(x - 1, y, center) +
        2 * at(x + 1, y, center) -
        at(x - 1, y + 1, center) +
        at(x + 1, y + 1, center)
      const gyy =
        -at(x - 1, y - 1, center) -
        2 * at(x, y - 1, center) -
        at(x + 1, y - 1, center) +
        at(x - 1, y + 1, center) +
        2 * at(x, y + 1, center) +
        at(x + 1, y + 1, center)
      gx[index] = gxx
      gy[index] = gyy
      mag[index] = Math.hypot(gxx, gyy)
    }
  }
  const out = new Float32Array(width * height)
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = y * width + x
      if (subject[index] === 0 || mag[index] <= 0) continue
      let nx = 0
      let ny = 0
      if (Math.abs(gx[index]) >= Math.abs(gy[index])) nx = gx[index] >= 0 ? 1 : -1
      else ny = gy[index] >= 0 ? 1 : -1
      const ahead = mag[index + ny * width + nx]
      const behind = mag[index - ny * width - nx]
      if (mag[index] > ahead + 0.8 && mag[index] > behind + 0.8) out[index] = mag[index]
    }
  }
  return out
}

/** Keep the crest of a ridge so the wall sits on the seam instead of a wide halo. */
function thinRidge(edge: Float32Array, subject: Uint8Array, width: number, height: number): Float32Array {
  const out = new Float32Array(edge.length)
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = y * width + x
      if (subject[index] === 0 || edge[index] <= 0) continue
      const gx = edge[index + 1] - edge[index - 1]
      const gy = edge[index + width] - edge[index - width]
      let nx = 0
      let ny = 0
      if (Math.abs(gx) >= Math.abs(gy)) nx = gx >= 0 ? 1 : -1
      else ny = gy >= 0 ? 1 : -1
      const ahead = edge[index + ny * width + nx]
      const behind = edge[index - ny * width - nx]
      if (edge[index] > ahead && edge[index] > behind) out[index] = edge[index]
    }
  }
  return out
}

function wallsFor(map: EdgeMap, tolerance: number): Uint8Array {
  const t = clamp01(tolerance / 120)
  // Edge values are scaled so a strong seam is ~40. Higher tolerance
  // keeps only the stronger creases, so a faint plate line can be crossed.
  const cut = 6 + t * 16
  const walls = new Uint8Array(map.edge.length)
  for (let i = 0; i < walls.length; i += 1) {
    if (map.subject[i] !== 0 && map.edge[i] >= cut) walls[i] = 1
  }
  const radius = Math.max(1, Math.round(Math.max(map.width, map.height) / 420))
  dilateWalls(walls, map.subject, map.width, map.height, t < 0.8 ? radius : 1)
  return walls
}

function boxBlur(
  src: Float32Array,
  subject: Uint8Array,
  width: number,
  height: number,
  radius: number,
): Float32Array {
  if (radius < 1) return src.slice()
  const temp = new Float32Array(width * height)
  blurAxis(src, subject, width, height, radius, temp, true)
  const dst = new Float32Array(width * height)
  blurAxis(temp, subject, width, height, radius, dst, false)
  return dst
}

function blurAxis(
  src: Float32Array,
  subject: Uint8Array,
  width: number,
  height: number,
  radius: number,
  dst: Float32Array,
  horizontal: boolean,
): void {
  const length = horizontal ? width : height
  const lines = horizontal ? height : width
  for (let line = 0; line < lines; line += 1) {
    const indexAt = (cursor: number) => (horizontal ? line * width + cursor : cursor * width + line)
    let sum = 0
    let count = 0
    const add = (cursor: number, sign: number) => {
      if (cursor < 0 || cursor >= length) return
      const index = indexAt(cursor)
      if (subject[index] === 0) return
      sum += src[index] * sign
      count += sign
    }
    for (let cursor = -radius; cursor <= radius; cursor += 1) add(cursor, 1)
    for (let cursor = 0; cursor < length; cursor += 1) {
      const index = indexAt(cursor)
      if (subject[index] === 0) dst[index] = 0
      else dst[index] = count > 0 ? sum / count : src[index]
      add(cursor - radius, -1)
      add(cursor + radius + 1, 1)
    }
  }
}

function quantile(values: Float32Array, subject: Uint8Array, q: number): number {
  const sample: number[] = []
  const stride = Math.max(1, Math.floor(subject.length / 80000))
  for (let i = 0; i < subject.length; i += stride) {
    if (subject[i] !== 0) sample.push(values[i])
  }
  if (sample.length === 0) return 0
  sample.sort((a, b) => a - b)
  const index = clamp(Math.round(q * (sample.length - 1)), 0, sample.length - 1)
  return sample[index]
}

function dilateWalls(walls: Uint8Array, subject: Uint8Array, width: number, height: number, radius: number): void {
  const copy = walls.slice()
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (copy[y * width + x] === 0) continue
      for (let dy = -radius; dy <= radius; dy += 1) {
        const ny = y + dy
        if (ny < 0 || ny >= height) continue
        for (let dx = -radius; dx <= radius; dx += 1) {
          const nx = x + dx
          if (nx < 0 || nx >= width) continue
          const index = ny * width + nx
          if (subject[index] !== 0) walls[index] = 1
        }
      }
    }
  }
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
  // A click on a halo spike or a seam is a ridge. Step into the nearest real plate.
  if (walls[best] !== 0) {
    const escaped = nearestPlate(subject, walls, width, height, best)
    if (escaped >= 0) best = escaped
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
  const { width, height, subject, subjectCount } = map
  const mask = new Uint8Array(width * height)
  const cap = Math.max(48, Math.floor(subjectCount * 0.42))
  const queue = new Int32Array(width * height)
  let head = 0
  let tail = 0
  let count = 0
  const push = (index: number) => {
    if (mask[index] !== 0 || subject[index] === 0 || walls[index] !== 0) return
    if (count >= cap) return
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
  if (count === 0) {
    mask[seed] = 1
    count = 1
    queue[tail] = seed
    tail += 1
  }
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
  const limit = Math.max(28, Math.round(Math.min(width, height) / 7))
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

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(1, value))
}
