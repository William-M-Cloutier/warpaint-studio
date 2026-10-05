/**
 * Offline backdrop removal. Flood-fills from the image edges where the color
 * stays near the corner backdrop, then writes transparency into the alpha channel.
 * No network and no model — it runs on pixel buffers in the browser.
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

type RGB = { r: number; g: number; b: number }

const CLUSTER_DISTANCE = 48

export function clampCutoutStrength(value: number): number {
  if (!Number.isFinite(value)) return 34
  return Math.min(100, Math.max(1, Math.round(value)))
}

/** Weighted color distance squared. Green counts more than red or blue. */
function colorDist2(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number): number {
  const dr = r1 - r2
  const dg = g1 - g2
  const db = b1 - b2
  return dr * dr * 0.5 + dg * dg + db * db * 0.4
}

function weightedDist(a: RGB, b: RGB): number {
  return Math.sqrt(colorDist2(a.r, a.g, a.b, b.r, b.g, b.b))
}

function average(colors: readonly RGB[]): RGB {
  let r = 0
  let g = 0
  let b = 0
  for (const color of colors) {
    r += color.r
    g += color.g
    b += color.b
  }
  const n = colors.length || 1
  return { r: r / n, g: g / n, b: b / n }
}

function dedupeReferences(colors: readonly RGB[]): RGB[] {
  const groups: RGB[][] = []
  for (const color of colors) {
    const group = groups.find((entry) => weightedDist(entry[0], color) <= CLUSTER_DISTANCE)
    if (group) group.push(color)
    else groups.push([color])
  }
  return groups.map((group) => average(group))
}

/**
 * Corner colors that agree with each other are the backdrop.
 * A single corner that disagrees (the miniature touching that corner) is dropped.
 */
function backdropReferences(corners: readonly RGB[]): RGB[] {
  if (corners.length === 0) return [{ r: 255, g: 255, b: 255 }]
  const close = (a: RGB, b: RGB) => weightedDist(a, b) <= CLUSTER_DISTANCE
  const clustered = corners.filter((color, index) =>
    corners.some((other, otherIndex) => otherIndex !== index && close(color, other)),
  )
  const chosen = clustered.length >= 2 ? clustered : corners
  return dedupeReferences(chosen)
}

function patchAverage(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  x0: number,
  y0: number,
  size: number,
): RGB {
  const x1 = Math.min(width, x0 + size)
  const y1 = Math.min(height, y0 + size)
  let r = 0
  let g = 0
  let b = 0
  let n = 0
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const i = (y * width + x) * 4
      if (data[i + 3] < 16) continue
      r += data[i]
      g += data[i + 1]
      b += data[i + 2]
      n += 1
    }
  }
  if (n === 0) return { r: 0, g: 0, b: 0 }
  return { r: r / n, g: g / n, b: b / n }
}

function cornerColors(buffer: RgbaBuffer): RGB[] {
  const { data, width, height } = buffer
  const size = Math.max(2, Math.min(6, Math.floor(Math.min(width, height) / 8)))
  return [
    patchAverage(data, width, height, 0, 0, size),
    patchAverage(data, width, height, width - size, 0, size),
    patchAverage(data, width, height, 0, height - size, size),
    patchAverage(data, width, height, width - size, height - size, size),
  ]
}

/**
 * Remove the backdrop connected to the image edges.
 * Mutates `buffer` alpha and leaves RGB in place. Higher strength removes more.
 */
export function removeBackdrop(buffer: RgbaBuffer, strength: number): CutoutStats {
  const level = clampCutoutStrength(strength)
  const { data, width, height } = buffer
  const count = width * height
  if (count === 0) return { removedRatio: 0 }

  const tol = 5 + level * 0.58
  const tol2 = tol * tol
  const step2 = (tol * 0.92) * (tol * 0.92)
  const loose2 = (tol * 2.55) * (tol * 2.55)
  const seedGate2 = (tol * 1.4) * (tol * 1.4)
  const refs = backdropReferences(cornerColors(buffer))

  const nearRef = (r: number, g: number, b: number, gate: number) => {
    for (const ref of refs) {
      if (colorDist2(r, g, b, ref.r, ref.g, ref.b) <= gate) return true
    }
    return false
  }

  const remove = new Uint8Array(count)
  const qx = new Int32Array(count)
  const qy = new Int32Array(count)
  const qsr = new Uint8ClampedArray(count)
  const qsg = new Uint8ClampedArray(count)
  const qsb = new Uint8ClampedArray(count)
  let qe = 0

  const enqueue = (x: number, y: number, sr: number, sg: number, sb: number) => {
    const index = y * width + x
    if (remove[index]) return
    remove[index] = 1
    qx[qe] = x
    qy[qe] = y
    qsr[qe] = sr
    qsg[qe] = sg
    qsb[qe] = sb
    qe += 1
  }

  const considerBorder = (x: number, y: number) => {
    const j = (y * width + x) * 4
    if (data[j + 3] < 16) {
      remove[y * width + x] = 1
      return
    }
    const r = data[j]
    const g = data[j + 1]
    const b = data[j + 2]
    if (nearRef(r, g, b, seedGate2)) enqueue(x, y, r, g, b)
  }

  for (let x = 0; x < width; x += 1) {
    considerBorder(x, 0)
    if (height > 1) considerBorder(x, height - 1)
  }
  for (let y = 1; y < height - 1; y += 1) {
    considerBorder(0, y)
    if (width > 1) considerBorder(width - 1, y)
  }

  let qs = 0
  while (qs < qe) {
    const x = qx[qs]
    const y = qy[qs]
    const sr = qsr[qs]
    const sg = qsg[qs]
    const sb = qsb[qs]
    qs += 1
    const parent = (y * width + x) * 4
    const pr = data[parent]
    const pg = data[parent + 1]
    const pb = data[parent + 2]

    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) continue
        const nx = x + dx
        const ny = y + dy
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
        const ni = ny * width + nx
        if (remove[ni]) continue
        const j = ni * 4
        if (data[j + 3] < 16) {
          remove[ni] = 1
          continue
        }
        const r = data[j]
        const g = data[j + 1]
        const b = data[j + 2]
        const fromSeed = colorDist2(r, g, b, sr, sg, sb)
        const fromParent = colorDist2(r, g, b, pr, pg, pb)
        if (fromSeed <= tol2 || (fromParent <= step2 && fromSeed <= loose2)) {
          enqueue(nx, ny, sr, sg, sb)
        }
      }
    }
  }

  let opaque = 0
  let removed = 0
  for (let i = 0; i < count; i += 1) {
    const offset = i * 4 + 3
    const previous = data[offset]
    if (previous < 16) continue
    opaque += 1
    if (remove[i]) {
      data[offset] = 0
      removed += 1
    }
  }

  return { removedRatio: opaque === 0 ? 0 : removed / opaque }
}
