/**
 * Offline backdrop removal. Seeds only from the image border, and only pixels
 * that still match that backdrop color can be cleared. Grey plastic — including
 * bright highlights and thin spikes — stays, because it is farther from the
 * backdrop than the strength slider allows, or it sits against a darker part of
 * the miniature. White pockets enclosed by the figure (between legs, under an
 * arm) are cleared in a second pass. No network and no model.
 */

export type RgbaBuffer = {
  data: Uint8ClampedArray
  width: number
  height: number
}

export type CutoutStats = {
  /** Share of previously opaque pixels that became transparent. */
  removedRatio: number
}

type RGB = { r: number; g: number; b: number; luma: number }

type Limits = {
  tol: number
  fringeTol: number
  slack: number
  contrast: number
  strong: number
}

const LUMA_WINDOW = 26
const POCKET_MIN = 6

export function clampCutoutStrength(value: number): number {
  if (!Number.isFinite(value)) return 34
  return Math.min(100, Math.max(1, Math.round(value)))
}

function limitsFor(level: number): Limits {
  return {
    // Strength 100 stays near the backdrop (about 16 levels on a grey ramp).
    tol: 6 + level * 0.16,
    // Only a near-white fringe may be peeled off the silhouette.
    fringeTol: 3.5 + level * 0.045,
    slack: 10 + level * 0.2,
    contrast: 28,
    strong: 46,
  }
}

/** Weighted color distance. Green counts more than red or blue. */
function colorDist2(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number): number {
  const dr = r1 - r2
  const dg = g1 - g2
  const db = b1 - b2
  return dr * dr * 0.5 + dg * dg + db * db * 0.4
}

function weightedDist(r: number, g: number, b: number, ref: RGB): number {
  return Math.sqrt(colorDist2(r, g, b, ref.r, ref.g, ref.b))
}

function lumaOf(r: number, g: number, b: number): number {
  return r * 0.299 + g * 0.587 + b * 0.114
}

function averagePatch(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
): RGB | null {
  if (x1 <= x0 || y1 <= y0) return null
  const xLo = Math.max(0, x0)
  const yLo = Math.max(0, y0)
  const xHi = Math.min(width, x1)
  const yHi = Math.min(height, y1)
  let r = 0
  let g = 0
  let b = 0
  let n = 0
  for (let y = yLo; y < yHi; y += 1) {
    for (let x = xLo; x < xHi; x += 1) {
      const i = (y * width + x) * 4
      if (data[i + 3] < 16) continue
      r += data[i]
      g += data[i + 1]
      b += data[i + 2]
      n += 1
    }
  }
  if (n === 0) return null
  return { r: r / n, g: g / n, b: b / n, luma: lumaOf(r / n, g / n, b / n) }
}

/**
 * One sample per border segment. Segments whose lightness is far from the
 * border median are the miniature touching the frame, not the backdrop.
 */
function borderReferences(buffer: RgbaBuffer): RGB[] {
  const { data, width, height } = buffer
  const buckets = 4
  const samples: RGB[] = []
  const add = (x0: number, x1: number, y0: number, y1: number) => {
    const sample = averagePatch(data, width, height, x0, x1, y0, y1)
    if (sample) samples.push(sample)
  }
  for (let bucket = 0; bucket < buckets; bucket += 1) {
    const x0 = Math.floor((bucket * width) / buckets)
    const x1 = Math.floor(((bucket + 1) * width) / buckets)
    add(x0, x1, 0, 1)
    if (height > 1) add(x0, x1, height - 1, height)
    const y0 = Math.floor((bucket * height) / buckets)
    const y1 = Math.floor(((bucket + 1) * height) / buckets)
    add(0, 1, y0, y1)
    if (width > 1) add(width - 1, width, y0, y1)
  }
  if (samples.length === 0) return [{ r: 255, g: 255, b: 255, luma: 255 }]
  const lumas = samples.map((sample) => sample.luma).sort((a, b) => a - b)
  const median = lumas[lumas.length >> 1]
  const kept = samples.filter((sample) => Math.abs(sample.luma - median) <= LUMA_WINDOW)
  return kept.length > 0 ? kept : samples
}

function nearestBackdrop(
  r: number,
  g: number,
  b: number,
  refs: readonly RGB[],
): { dist: number; refLuma: number } {
  let dist = Number.POSITIVE_INFINITY
  let refLuma = 255
  for (const ref of refs) {
    const next = weightedDist(r, g, b, ref)
    if (next < dist) {
      dist = next
      refLuma = ref.luma
    }
  }
  return { dist, refLuma }
}

function matchesBackdrop(dist: number, luma: number, refLuma: number, limits: Limits): boolean {
  return dist <= limits.tol && luma >= refLuma - limits.slack
}

/**
 * A bright pixel glued to much darker plastic is a highlight or a spike, not
 * the backdrop. Near-white fringe (a few levels from the backdrop) still peels
 * so the silhouette does not keep a white outline.
 */
function attachedToFigure(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
  luma: number,
  dist: number,
  limits: Limits,
): boolean {
  if (dist <= limits.fringeTol) return false
  let darker = 0
  let strong = false
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue
      const nx = x + dx
      const ny = y + dy
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
      const j = (ny * width + nx) * 4
      if (data[j + 3] < 16) continue
      const gap = luma - lumaOf(data[j], data[j + 1], data[j + 2])
      if (gap < limits.contrast) continue
      darker += 1
      if (gap >= limits.strong) strong = true
    }
  }
  return strong || darker >= 3
}

function thinAgainstBackdrop(
  luma: Float32Array,
  width: number,
  height: number,
  x: number,
  y: number,
): boolean {
  const here = luma[y * width + x]
  let brighter = 0
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue
      const nx = x + dx
      const ny = y + dy
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
      if (luma[ny * width + nx] >= here + 8) brighter += 1
    }
  }
  return brighter >= 2
}

function removedRatio(data: Uint8ClampedArray, remove: Uint8Array): number {
  let opaque = 0
  let removed = 0
  const count = remove.length
  for (let i = 0; i < count; i += 1) {
    if (data[i * 4 + 3] < 16) continue
    opaque += 1
    if (remove[i]) removed += 1
  }
  return opaque === 0 ? 0 : removed / opaque
}

function writeAlpha(data: Uint8ClampedArray, remove: Uint8Array): void {
  const count = remove.length
  for (let i = 0; i < count; i += 1) {
    if (!remove[i]) continue
    if (data[i * 4 + 3] < 16) continue
    data[i * 4 + 3] = 0
  }
}

/**
 * Remove the backdrop. Mutates `buffer` alpha and leaves RGB in place.
 * Higher strength accepts pixels farther from the backdrop color. It does not
 * walk from white into mid-grey.
 */
export function removeBackdrop(buffer: RgbaBuffer, strength: number): CutoutStats {
  const level = clampCutoutStrength(strength)
  const { data, width, height } = buffer
  const count = width * height
  if (count === 0) return { removedRatio: 0 }

  const limits = limitsFor(level)
  const refs = borderReferences(buffer)
  const eligible = new Uint8Array(count)
  const protect = new Uint8Array(count)
  const dist = new Float32Array(count)
  const luma = new Float32Array(count)

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x
      const offset = index * 4
      if (data[offset + 3] < 16) continue
      const r = data[offset]
      const g = data[offset + 1]
      const b = data[offset + 2]
      const here = lumaOf(r, g, b)
      luma[index] = here
      const nearest = nearestBackdrop(r, g, b, refs)
      dist[index] = nearest.dist
      if (!matchesBackdrop(nearest.dist, here, nearest.refLuma, limits)) continue
      eligible[index] = 1
      if (attachedToFigure(data, width, height, x, y, here, nearest.dist, limits)) {
        protect[index] = 1
      }
    }
  }

  // Extend protection along thin bright details (halo spikes, hammer edges) so
  // the flood cannot eat them from the white side. Flat pockets are not thin:
  // their pixels sit next to similar colors, not the brighter backdrop.
  const grow = new Int32Array(count)
  let growHead = 0
  let growTail = 0
  for (let index = 0; index < count; index += 1) {
    if (!protect[index]) continue
    grow[growTail] = index
    growTail += 1
  }
  const shieldThin = (index: number) => {
    if (!eligible[index] || protect[index] || dist[index] <= limits.fringeTol) return false
    protect[index] = 1
    grow[growTail] = index
    growTail += 1
    return true
  }

  while (growHead < growTail) {
    const current = grow[growHead]
    growHead += 1
    const x = current % width
    const y = (current - x) / width
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) continue
        const nx = x + dx
        const ny = y + dy
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
        const next = ny * width + nx
        if (!eligible[next] || protect[next] || dist[next] <= limits.fringeTol) continue
        if (!thinAgainstBackdrop(luma, width, height, nx, ny)) continue
        shieldThin(next)
      }
    }
  }

  // The middle of a spike is not itself against the backdrop. Keep a pixel
  // when both sides are already part of that highlight. A flat pocket has no
  // protected sides, so it still clears.
  for (let pass = 0; pass < 3; pass += 1) {
    let grew = false
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = y * width + x
        if (!eligible[index] || protect[index] || dist[index] <= limits.fringeTol) continue
        const left = x > 0 && protect[index - 1]
        const right = x + 1 < width && protect[index + 1]
        const up = y > 0 && protect[index - width]
        const down = y + 1 < height && protect[index + width]
        if ((left && right) || (up && down)) {
          protect[index] = 1
          grew = true
        }
      }
    }
    if (!grew) break
  }

  const remove = new Uint8Array(count)
  const queue = new Int32Array(count)
  let head = 0
  let tail = 0
  const enqueue = (index: number) => {
    if (remove[index] || !eligible[index] || protect[index]) return
    remove[index] = 1
    queue[tail] = index
    tail += 1
  }

  for (let x = 0; x < width; x += 1) {
    enqueue(x)
    if (height > 1) enqueue((height - 1) * width + x)
  }
  for (let y = 1; y < height - 1; y += 1) {
    enqueue(y * width)
    if (width > 1) enqueue(y * width + width - 1)
  }

  const neighbors = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ] as const

  while (head < tail) {
    const index = queue[head]
    head += 1
    const x = index % width
    const y = (index - x) / width
    for (const [dx, dy] of neighbors) {
      const nx = x + dx
      const ny = y + dy
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
      enqueue(ny * width + nx)
    }
  }

  // Enclosed and near-enclosed backdrop pockets: white between legs, under an
  // arm, behind a shield. They are not connected to the frame, so the flood
  // never reaches them. Highlights glued to darker plastic are protected and
  // are not part of these components.
  const seen = new Uint8Array(count)
  const members = new Int32Array(count)
  for (let index = 0; index < count; index += 1) {
    if (seen[index] || remove[index] || !eligible[index] || protect[index]) continue
    let memberCount = 0
    let touchesBorder = false
    let scan = 0
    seen[index] = 1
    members[memberCount] = index
    memberCount += 1
    while (scan < memberCount) {
      const current = members[scan]
      scan += 1
      const x = current % width
      const y = (current - x) / width
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) touchesBorder = true
      for (const [dx, dy] of neighbors) {
        const nx = x + dx
        const ny = y + dy
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
        const next = ny * width + nx
        if (seen[next] || remove[next] || !eligible[next] || protect[next]) continue
        seen[next] = 1
        members[memberCount] = next
        memberCount += 1
      }
    }
    if (touchesBorder || memberCount < POCKET_MIN) continue
    for (let k = 0; k < memberCount; k += 1) remove[members[k]] = 1
  }

  // Drop leftover near-white crumbs surrounded by cleared backdrop.
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = y * width + x
      if (remove[index] || !eligible[index] || protect[index]) continue
      if (dist[index] > limits.fringeTol) continue
      let cleared = 0
      for (const [dx, dy] of neighbors) {
        if (remove[(y + dy) * width + (x + dx)]) cleared += 1
      }
      if (cleared >= 3) remove[index] = 1
    }
  }

  // Never punch a pixel the color test rejected.
  for (let index = 0; index < count; index += 1) {
    if (remove[index] && !eligible[index]) remove[index] = 0
  }

  const ratio = removedRatio(data, remove)
  writeAlpha(data, remove)
  return { removedRatio: ratio }
}

/**
 * Apply a coarse cutout to a full-resolution buffer. A pixel is cleared only
 * when the coarse mask cleared its cell and the full pixel itself still matches
 * the backdrop and is not a highlight attached to the figure. Nearest-neighbor
 * downscales can mark grey plastic as removed; this puts those pixels back.
 */
export function projectCutout(full: RgbaBuffer, coarse: RgbaBuffer, strength: number): CutoutStats {
  const level = clampCutoutStrength(strength)
  const limits = limitsFor(level)
  const refs = borderReferences(full)
  const { data, width, height } = full
  const count = width * height
  const remove = new Uint8Array(count)
  const coarseData = coarse.data
  const coarseW = coarse.width
  const coarseH = coarse.height
  if (count === 0 || coarseW < 1 || coarseH < 1) return { removedRatio: 0 }

  for (let y = 0; y < height; y += 1) {
    const cy = Math.min(coarseH - 1, Math.floor((y * coarseH) / height))
    for (let x = 0; x < width; x += 1) {
      const cx = Math.min(coarseW - 1, Math.floor((x * coarseW) / width))
      if (coarseData[(cy * coarseW + cx) * 4 + 3] !== 0) continue
      const index = y * width + x
      const offset = index * 4
      if (data[offset + 3] < 16) continue
      const r = data[offset]
      const g = data[offset + 1]
      const b = data[offset + 2]
      const nearest = nearestBackdrop(r, g, b, refs)
      const luma = lumaOf(r, g, b)
      if (!matchesBackdrop(nearest.dist, luma, nearest.refLuma, limits)) continue
      if (attachedToFigure(data, width, height, x, y, luma, nearest.dist, limits)) continue
      remove[index] = 1
    }
  }

  const luma = new Float32Array(count)
  for (let index = 0; index < count; index += 1) {
    const offset = index * 4
    if (data[offset + 3] < 16) continue
    luma[index] = lumaOf(data[offset], data[offset + 1], data[offset + 2])
  }
  for (let pass = 0; pass < 3; pass += 1) {
    let restored = false
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = y * width + x
        if (!remove[index] || luma[index] === 0) continue
        const nearest = nearestBackdrop(data[index * 4], data[index * 4 + 1], data[index * 4 + 2], refs)
        if (nearest.dist <= limits.fringeTol) continue
        const similarKept = (nx: number, ny: number) => {
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) return false
          const next = ny * width + nx
          if (remove[next] || data[next * 4 + 3] < 16) return false
          return Math.abs(luma[next] - luma[index]) <= 12
        }
        const between =
          (similarKept(x - 1, y) && similarKept(x + 1, y)) ||
          (similarKept(x, y - 1) && similarKept(x, y + 1))
        if (!between && !thinAgainstBackdrop(luma, width, height, x, y)) continue
        remove[index] = 0
        restored = true
      }
    }
    if (!restored) break
  }

  const ratio = removedRatio(data, remove)
  writeAlpha(data, remove)
  return { removedRatio: ratio }
}

const N4 = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
] as const

const N8 = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
] as const

/** Near-white rim, about 13 levels on a grey ramp. Grey plastic is farther than this. */
const FRINGE_TRIM = 18
/** A transparent island closer than this to the backdrop is a white pocket, not a hole. */
const HOLE_FIGURE_DIST = 26

function holePixelLimit(width: number, height: number): number {
  const scaled = Math.round(width * height * 0.004)
  return Math.max(64, Math.min(24000, scaled))
}

function backdropRefsIgnoringAlpha(buffer: RgbaBuffer): RGB[] {
  const { data, width, height } = buffer
  const buckets = 4
  const samples: RGB[] = []
  const add = (x0: number, x1: number, y0: number, y1: number) => {
    if (x1 <= x0 || y1 <= y0) return
    let r = 0
    let g = 0
    let b = 0
    let n = 0
    for (let y = y0; y < y1; y += 1) {
      for (let x = x0; x < x1; x += 1) {
        const i = (y * width + x) * 4
        r += data[i]
        g += data[i + 1]
        b += data[i + 2]
        n += 1
      }
    }
    if (n === 0) return
    samples.push({ r: r / n, g: g / n, b: b / n, luma: lumaOf(r / n, g / n, b / n) })
  }
  for (let bucket = 0; bucket < buckets; bucket += 1) {
    const x0 = Math.floor((bucket * width) / buckets)
    const x1 = Math.floor(((bucket + 1) * width) / buckets)
    add(x0, x1, 0, 1)
    if (height > 1) add(x0, x1, height - 1, height)
    const y0 = Math.floor((bucket * height) / buckets)
    const y1 = Math.floor(((bucket + 1) * height) / buckets)
    add(0, 1, y0, y1)
    if (width > 1) add(width - 1, width, y0, y1)
  }
  if (samples.length === 0) return [{ r: 255, g: 255, b: 255, luma: 255 }]
  const lumas = samples.map((sample) => sample.luma).sort((a, b) => a - b)
  const median = lumas[lumas.length >> 1]
  const kept = samples.filter((sample) => Math.abs(sample.luma - median) <= LUMA_WINDOW)
  return kept.length > 0 ? kept : samples
}

/**
 * Patch a cutout in place. Fills small transparent islands of figure color,
 * strips the near-white rim, and softens the matte by one or two pixels.
 * Transparent regions that touch the outside of the picture stay clear, as do
 * enclosed pockets that still match the backdrop.
 * Pass `source` when the cutout buffer no longer holds the original RGB.
 */
export function repairCutout(buffer: RgbaBuffer, source?: RgbaBuffer): void {
  const { data, width, height } = buffer
  const count = width * height
  if (count === 0) return
  const src = source && source.width === width && source.height === height ? source.data : data
  const refs = backdropRefsIgnoringAlpha(source ?? buffer)
  const distAt = (index: number) => {
    const offset = index * 4
    return nearestBackdrop(src[offset], src[offset + 1], src[offset + 2], refs).dist
  }

  const outside = new Uint8Array(count)
  const queue = new Int32Array(count)
  let head = 0
  let tail = 0
  const seedOutside = (index: number) => {
    if (outside[index] || data[index * 4 + 3] >= 16) return
    outside[index] = 1
    queue[tail] = index
    tail += 1
  }
  for (let x = 0; x < width; x += 1) {
    seedOutside(x)
    if (height > 1) seedOutside((height - 1) * width + x)
  }
  for (let y = 1; y < height - 1; y += 1) {
    seedOutside(y * width)
    if (width > 1) seedOutside(y * width + width - 1)
  }
  while (head < tail) {
    const index = queue[head]
    head += 1
    const x = index % width
    const y = (index - x) / width
    for (const [dx, dy] of N8) {
      const nx = x + dx
      const ny = y + dy
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
      seedOutside(ny * width + nx)
    }
  }

  const limit = holePixelLimit(width, height)
  const seen = new Uint8Array(count)
  const members = new Int32Array(Math.min(count, limit))
  const distances = new Float64Array(Math.min(count, limit))
  for (let index = 0; index < count; index += 1) {
    if (seen[index] || outside[index] || data[index * 4 + 3] >= 16) continue
    let memberCount = 0
    let overflow = false
    head = 0
    tail = 0
    seen[index] = 1
    queue[tail] = index
    tail += 1
    while (head < tail) {
      const current = queue[head]
      head += 1
      if (memberCount < limit) {
        members[memberCount] = current
        distances[memberCount] = distAt(current)
        memberCount += 1
      } else {
        overflow = true
      }
      const x = current % width
      const y = (current - x) / width
      for (const [dx, dy] of N4) {
        const nx = x + dx
        const ny = y + dy
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
        const next = ny * width + nx
        if (seen[next] || outside[next] || data[next * 4 + 3] >= 16) continue
        seen[next] = 1
        queue[tail] = next
        tail += 1
      }
    }
    if (overflow || memberCount < 1) continue
    distances.subarray(0, memberCount).sort()
    const median = distances[memberCount >> 1]
    if (median <= HOLE_FIGURE_DIST) continue
    for (let k = 0; k < memberCount; k += 1) {
      const offset = members[k] * 4
      data[offset] = src[offset]
      data[offset + 1] = src[offset + 1]
      data[offset + 2] = src[offset + 2]
      data[offset + 3] = src[offset + 3] >= 16 ? src[offset + 3] : 255
    }
  }

  const clearFringe = () => {
    const drop = new Uint8Array(count)
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = y * width + x
        if (data[index * 4 + 3] < 16) continue
        let open = false
        for (const [dx, dy] of N4) {
          const nx = x + dx
          const ny = y + dy
          if (nx < 0 || ny < 0 || nx >= width || ny >= height || data[(ny * width + nx) * 4 + 3] < 16) {
            open = true
            break
          }
        }
        if (!open || distAt(index) > FRINGE_TRIM) continue
        drop[index] = 1
      }
    }
    for (let index = 0; index < count; index += 1) {
      if (drop[index]) data[index * 4 + 3] = 0
    }
  }
  clearFringe()
  clearFringe()
  clearFringe()

  const speckSeen = new Uint8Array(count)
  const speckMembers = new Int32Array(48)
  for (let index = 0; index < count; index += 1) {
    if (speckSeen[index] || data[index * 4 + 3] < 16 || distAt(index) > FRINGE_TRIM) continue
    let memberCount = 0
    let touchesOpen = false
    let overflow = false
    head = 0
    tail = 0
    speckSeen[index] = 1
    queue[tail] = index
    tail += 1
    while (head < tail) {
      const current = queue[head]
      head += 1
      if (memberCount < 48) speckMembers[memberCount] = current
      else overflow = true
      memberCount += 1
      const x = current % width
      const y = (current - x) / width
      for (const [dx, dy] of N4) {
        const nx = x + dx
        const ny = y + dy
        if (nx < 0 || ny < 0 || nx >= width || ny >= height || data[(ny * width + nx) * 4 + 3] < 16) {
          touchesOpen = true
          continue
        }
        const next = ny * width + nx
        if (speckSeen[next] || distAt(next) > FRINGE_TRIM) continue
        speckSeen[next] = 1
        queue[tail] = next
        tail += 1
      }
    }
    if (!touchesOpen || overflow) continue
    for (let k = 0; k < memberCount; k += 1) data[speckMembers[k] * 4 + 3] = 0
  }

  const alpha = new Uint8Array(count)
  for (let index = 0; index < count; index += 1) alpha[index] = data[index * 4 + 3]
  const softened = new Uint8Array(alpha)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x
      if (alpha[index] < 16) continue
      for (const [dx, dy] of N4) {
        const nx = x + dx
        const ny = y + dy
        if (nx < 0 || ny < 0 || nx >= width || ny >= height || alpha[ny * width + nx] < 16) {
          softened[index] = Math.min(alpha[index], 186)
          break
        }
      }
    }
  }
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x
      if (softened[index] < 200) continue
      for (const [dx, dy] of N4) {
        const nx = x + dx
        const ny = y + dy
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
        const neighbor = softened[ny * width + nx]
        if (neighbor > 16 && neighbor < 200) {
          data[index * 4 + 3] = Math.min(softened[index], 226)
          break
        }
      }
    }
  }
  for (let index = 0; index < count; index += 1) {
    if (softened[index] >= 16 && softened[index] < 200) data[index * 4 + 3] = softened[index]
  }
}
