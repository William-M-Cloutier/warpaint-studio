import { PAINTS, type CatalogPaint, type PaintRangeId } from '../data/paints'

/**
 * Nearest real catalog paints for a base colour.
 * Names are never invented: a role is omitted when nothing in the catalog is close.
 * Paired ranges share chart swatches, so an exact tie prefers the chosen range, then Citadel.
 */

export type PaintSuggestions = {
  base: CatalogPaint | null
  highlight: CatalogPaint | null
  shade: CatalogPaint | null
}

type Lab = [number, number, number]

type Entry = { paint: CatalogPaint; lab: Lab }

const RANGE_ORDER: Record<PaintRangeId, number> = {
  citadel: 0,
  vallejo: 1,
  'army-painter': 2,
  'two-thin-coats': 3,
}

const ENTRIES: readonly Entry[] = PAINTS.map((paint) => ({ paint, lab: hexToOklab(paint.hex) }))

export function suggestPaints(hex: string, preferRange: PaintRangeId | null = null): PaintSuggestions {
  const source = hexToOklab(hex)
  const base = nearestBase(source, preferRange)
  if (!base) return { base: null, highlight: null, shade: null }
  return {
    base: base.paint,
    highlight: nearestHighlight(source, base, preferRange),
    shade: nearestShade(source, base, preferRange),
  }
}

function nearestBase(source: Lab, preferRange: PaintRangeId | null): Entry | null {
  let best: Entry | null = null
  let bestScore = Infinity
  for (const entry of ENTRIES) {
    if (!isBodyPaint(entry.paint)) continue
    const score = delta(source, entry.lab) + rangeNudge(entry.paint, preferRange)
    if (better(score, entry, bestScore, best, preferRange)) {
      best = entry
      bestScore = score
    }
  }
  return best
}

function nearestHighlight(
  source: Lab,
  base: Entry,
  preferRange: PaintRangeId | null,
): CatalogPaint | null {
  const sourceC = chroma(source)
  let best: Entry | null = null
  let bestScore = Infinity
  for (const entry of ENTRIES) {
    if (!isBodyPaint(entry.paint) || entry.paint.id === base.paint.id) continue
    if (entry.lab[0] < source[0] + 0.04) continue
    const paintC = chroma(entry.lab)
    if (sourceC < 0.035) {
      if (paintC > 0.08) continue
    } else if (hueDelta(source, entry.lab) > 36) continue
    let score = delta(source, entry.lab)
    const step = entry.lab[0] - source[0]
    if (step > 0.28) score += (step - 0.28) * 0.7
    if (base.paint.finish === 'metallic') score += entry.paint.finish === 'metallic' ? -0.04 : 0.05
    else if (entry.paint.finish === 'metallic') score += 0.045
    score += rangeNudge(entry.paint, preferRange)
    if (better(score, entry, bestScore, best, preferRange)) {
      best = entry
      bestScore = score
    }
  }
  if (!best || bestScore > 0.42) return null
  return best.paint
}

function nearestShade(source: Lab, base: Entry, preferRange: PaintRangeId | null): CatalogPaint | null {
  if (base.paint.finish === 'metallic') {
    const nuln = ENTRIES.find((entry) => entry.paint.id === 'citadel-nuln-oil')
    return nuln?.paint ?? null
  }
  const sourceC = chroma(source)
  let best: Entry | null = null
  let bestScore = Infinity
  for (const entry of ENTRIES) {
    if (entry.paint.finish !== 'wash') continue
    const washC = chroma(entry.lab)
    let score: number
    if (sourceC < 0.04) score = washC
    else if (washC < 0.02) score = 4
    else score = hueDelta(source, entry.lab) / 90 + washC * 0.35
    score += rangeNudge(entry.paint, preferRange)
    if (better(score, entry, bestScore, best, preferRange)) {
      best = entry
      bestScore = score
    }
  }
  if (!best) return null
  if (sourceC >= 0.04 && bestScore > 0.62) return null
  return best.paint
}

function isBodyPaint(paint: CatalogPaint): boolean {
  if (paint.finish === 'wash' || paint.finish === 'contrast' || paint.finish === 'gloss') return false
  if (paint.line === 'Shade' || paint.line === 'Contrast' || paint.line === 'Technical') return false
  if (paint.line.includes('Wash')) return false
  return paint.coverage === 'opaque' || paint.coverage === 'semi-opaque'
}

function rangeNudge(paint: CatalogPaint, preferRange: PaintRangeId | null): number {
  return preferRange && paint.range === preferRange ? -0.012 : 0
}

function better(
  score: number,
  entry: Entry,
  bestScore: number,
  best: Entry | null,
  preferRange: PaintRangeId | null,
): boolean {
  if (!best || score < bestScore - 1e-6) return true
  if (score > bestScore + 1e-6) return false
  return rank(entry.paint, preferRange) < rank(best.paint, preferRange)
}

function rank(paint: CatalogPaint, preferRange: PaintRangeId | null): number {
  const range = preferRange && paint.range === preferRange ? -1 : RANGE_ORDER[paint.range]
  return range * 1000 + paint.name.charCodeAt(0)
}

function delta(a: Lab, b: Lab): number {
  const dl = a[0] - b[0]
  const da = a[1] - b[1]
  const db = a[2] - b[2]
  return Math.sqrt(dl * dl + da * da + db * db)
}

function chroma(lab: Lab): number {
  return Math.hypot(lab[1], lab[2])
}

function hueDelta(a: Lab, b: Lab): number {
  const ha = Math.atan2(a[2], a[1])
  const hb = Math.atan2(b[2], b[1])
  let d = Math.abs(ha - hb)
  if (d > Math.PI) d = Math.PI * 2 - d
  return (d * 180) / Math.PI
}

function hexToOklab(hex: string): Lab {
  const value = Number.parseInt(hex.replace('#', ''), 16)
  const r = srgbToLinear((value >> 16) & 255)
  const g = srgbToLinear((value >> 8) & 255)
  const b = srgbToLinear(value & 255)
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}

function srgbToLinear(channel: number): number {
  const x = channel / 255
  return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4
}
