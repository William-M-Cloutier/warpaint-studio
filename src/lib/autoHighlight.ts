/**
 * One-click edge highlight.
 * Ridges come from the same Canny walls as the wand. Lighting keeps the lit
 * side of a ridge and fades the recess. Hug, when Stay inside lines is on,
 * narrows that band. The result is coverage for the tint layer, not a second
 * lighting model — present() still shades the pigment.
 */

export type HighlightCoverage = {
  coverage: Uint8Array
  width: number
  height: number
  /** Pixels strong enough to count as a highlight. */
  count: number
}

const LOOSE_RADIUS = 3.25
const TIGHT_RADIUS = 1.15

export function highlightRadius(hug: boolean, hugStrength: number): number {
  if (!hug) return LOOSE_RADIUS
  const t = Math.min(1, Math.max(0, (hugStrength - 0.25) / 0.75))
  return LOOSE_RADIUS + (TIGHT_RADIUS - LOOSE_RADIUS) * t
}

function smoothstep(t: number): number {
  const x = Math.min(1, Math.max(0, t))
  return x * x * (3 - 2 * x)
}

/**
 * Soft coverage along `walls` (255 on a ridge). `off` is 1 off the miniature.
 * A section mask and cutout alpha, when present, scale the coat the same way a
 * clipped stroke does.
 */
export function buildHighlightCoverage(input: {
  rgba: Uint8ClampedArray
  width: number
  height: number
  walls: Uint8Array
  off: Uint8Array
  section: Uint8Array | null
  cutout: Uint8Array | null
  hug: boolean
  hugStrength: number
}): HighlightCoverage {
  const { rgba, width, height, walls, off, section, cutout } = input
  const count = width * height
  const coverage = new Uint8Array(count)
  if (width < 2 || height < 2 || walls.length !== count || off.length !== count) {
    return { coverage, width, height, count: 0 }
  }
  const radius = highlightRadius(input.hug, input.hugStrength)
  const dist = chamfer(walls, off, width, height)
  const { sum, hits } = luminanceSums(rgba, off, width, height)
  const meanRadius = 5
  let painted = 0

  for (let y = 0; y < height; y += 1) {
    const row = y * width
    for (let x = 0; x < width; x += 1) {
      const index = row + x
      if (off[index] !== 0) continue
      const reach = dist[index]
      if (reach > radius) continue
      const sectionGate = section && section.length === count ? section[index] / 255 : 1
      if (sectionGate <= 0) continue
      const cutoutGate = cutout && cutout.length === count ? cutout[index] / 255 : 1
      if (cutoutGate <= 0) continue

      const o = index * 4
      const lum = 0.2126 * rgba[o] + 0.7152 * rgba[o + 1] + 0.0722 * rgba[o + 2]
      const mean = boxMean(sum, hits, width, height, x, y, meanRadius, lum)
      const lift = (lum - mean) / 255
      let light = 0.25 + 0.75 * smoothstep((lift + 0.02) / 0.1)
      if (lift < -0.045) light = 0.08
      if (reach < 0.6) light = Math.max(light, 0.85)
      const falloff = 1 - reach / radius
      const alpha = falloff * falloff * light * sectionGate * cutoutGate
      const value = Math.round(alpha * 255)
      if (value <= 0) continue
      coverage[index] = value
      if (value >= 18) painted += 1
    }
  }

  return { coverage, width, height, count: painted }
}

function chamfer(walls: Uint8Array, off: Uint8Array, width: number, height: number): Float32Array {
  const count = width * height
  const dist = new Float32Array(count)
  dist.fill(1e6)
  for (let i = 0; i < count; i += 1) {
    if (walls[i] !== 0 && off[i] === 0) dist[i] = 0
  }
  const diagonal = 1.41421356
  for (let y = 0; y < height; y += 1) {
    const row = y * width
    for (let x = 0; x < width; x += 1) {
      const index = row + x
      let best = dist[index]
      if (x > 0) best = Math.min(best, dist[index - 1] + 1)
      if (y > 0) {
        best = Math.min(best, dist[index - width] + 1)
        if (x > 0) best = Math.min(best, dist[index - width - 1] + diagonal)
        if (x + 1 < width) best = Math.min(best, dist[index - width + 1] + diagonal)
      }
      dist[index] = best
    }
  }
  for (let y = height - 1; y >= 0; y -= 1) {
    const row = y * width
    for (let x = width - 1; x >= 0; x -= 1) {
      const index = row + x
      let best = dist[index]
      if (x + 1 < width) best = Math.min(best, dist[index + 1] + 1)
      if (y + 1 < height) {
        best = Math.min(best, dist[index + width] + 1)
        if (x > 0) best = Math.min(best, dist[index + width - 1] + diagonal)
        if (x + 1 < width) best = Math.min(best, dist[index + width + 1] + diagonal)
      }
      dist[index] = best
    }
  }
  return dist
}

function luminanceSums(
  rgba: Uint8ClampedArray,
  off: Uint8Array,
  width: number,
  height: number,
): { sum: Float64Array; hits: Float64Array } {
  const stride = width + 1
  const sum = new Float64Array(stride * (height + 1))
  const hits = new Float64Array(stride * (height + 1))
  for (let y = 0; y < height; y += 1) {
    const row = y * width
    const satRow = (y + 1) * stride
    const prev = y * stride
    for (let x = 0; x < width; x += 1) {
      const index = row + x
      const on = off[index] === 0
      const o = index * 4
      const lum = on ? 0.2126 * rgba[o] + 0.7152 * rgba[o + 1] + 0.0722 * rgba[o + 2] : 0
      const at = satRow + x + 1
      sum[at] = lum + sum[satRow + x] + sum[prev + x + 1] - sum[prev + x]
      hits[at] = (on ? 1 : 0) + hits[satRow + x] + hits[prev + x + 1] - hits[prev + x]
    }
  }
  return { sum, hits }
}

function boxMean(
  sum: Float64Array,
  hits: Float64Array,
  width: number,
  height: number,
  x: number,
  y: number,
  radius: number,
  fallback: number,
): number {
  const x0 = Math.max(0, x - radius)
  const y0 = Math.max(0, y - radius)
  const x1 = Math.min(width - 1, x + radius)
  const y1 = Math.min(height - 1, y + radius)
  const stride = width + 1
  const a = y0 * stride + x0
  const b = y0 * stride + (x1 + 1)
  const c = (y1 + 1) * stride + x0
  const d = (y1 + 1) * stride + (x1 + 1)
  const n = hits[d] - hits[b] - hits[c] + hits[a]
  if (n <= 0) return fallback
  return (sum[d] - sum[b] - sum[c] + sum[a]) / n
}
