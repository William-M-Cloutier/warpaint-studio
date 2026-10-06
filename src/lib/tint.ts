import { rgbToHex } from './color'

/**
 * Luminance of a middle-gray surface. Pigment is unchanged here.
 * Darker photo pixels scale it toward black; brighter ones ease it toward white.
 */
const PIVOT_LUMINANCE = 0.5

/**
 * How far a fully lit photo pixel (luminance 1) moves the pigment toward white.
 * Keeps a highlight lighter than the body of the paint without blowing it out.
 */
const HIGHLIGHT_LIFT = 0.55

function luminance(r: number, g: number, b: number): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t)
}

/**
 * Paint sitting on the photo: same pigment, different brightness where the
 * picture is lit or in shadow. Edges stay because they are luminance changes.
 *
 * `paint` is the More photo → More paint slider. 0 is this original lock.
 * Higher values keep more of the pigment's colour, soften the photo's
 * highlight and shadow, and leave that for the caller to grain.
 */
export function shadePigment(
  brushR: number,
  brushG: number,
  brushB: number,
  photoLuminance: number,
  paint = 0,
): [number, number, number] {
  const shadowFloor = 0.46 * paint
  const highlightLift = HIGHLIGHT_LIFT * (1 - 0.72 * paint)
  if (photoLuminance <= PIVOT_LUMINANCE) {
    const scale = shadowFloor + (1 - shadowFloor) * (photoLuminance / PIVOT_LUMINANCE)
    return [brushR * scale, brushG * scale, brushB * scale]
  }
  const t = (photoLuminance - PIVOT_LUMINANCE) / (1 - PIVOT_LUMINANCE)
  const lift = smoothstep(t) * highlightLift
  return [
    brushR + (255 - brushR) * lift,
    brushG + (255 - brushG) * lift,
    brushB + (255 - brushB) * lift,
  ]
}

/**
 * Composite a tint buffer over a photo.
 * Tint RGB is the pigment. Tint alpha is how strong the coat is.
 * Unpainted pixels stay transparent so the photo element shows through.
 * `out` may be the same buffer as `tint`.
 *
 * `paint` 0 matches the original photo-locked coat. Toward 1 the coat keeps
 * more chroma, follows the photo's light less tightly, and picks up a stable
 * grain. Grain uses photo coordinates so a partial redraw matches a full one.
 * The tint layer itself is unchanged, so eyedropper and undo still see pigment.
 */
export function compositeSurface(
  tint: Uint8ClampedArray,
  photo: Uint8ClampedArray,
  out: Uint8ClampedArray,
  paint = 0,
  originX = 0,
  originY = 0,
  span = 0,
): void {
  const width = span > 0 ? span : 0
  for (let i = 0, p = 0; i < tint.length; i += 4, p += 1) {
    const alpha = tint[i + 3] / 255
    const photoA = photo[i + 3] / 255
    // A cutout pixel stays empty so the tint cannot cover the checkerboard.
    // An opaque photo keeps the previous coat: full strength, photo alpha 255.
    if (alpha <= 0.001 || photoA <= 0.001) {
      out[i] = 0
      out[i + 1] = 0
      out[i + 2] = 0
      out[i + 3] = 0
      continue
    }
    const pr = photo[i]
    const pg = photo[i + 1]
    const pb = photo[i + 2]
    let [tr, tg, tb] = shadePigment(tint[i], tint[i + 1], tint[i + 2], luminance(pr, pg, pb), paint)
    if (paint > 0) {
      const y = 0.2126 * tr + 0.7152 * tg + 0.0722 * tb
      const k = 1 + 0.62 * paint
      const keep = 0.38 * paint
      const inv = 1 - keep
      tr = (y + (tr - y) * k) * inv + tint[i] * keep
      tg = (y + (tg - y) * k) * inv + tint[i + 1] * keep
      tb = (y + (tb - y) * k) * inv + tint[i + 2] * keep
    }
    let red = pr + (tr - pr) * alpha
    let green = pg + (tg - pg) * alpha
    let blue = pb + (tb - pb) * alpha
    if (paint > 0) {
      const x = width > 0 ? originX + (p % width) : originX + p
      const y = width > 0 ? originY + Math.floor(p / width) : originY
      const grit = (grainUnit(x, y) - 0.5) * 11 * paint * alpha
      red += grit
      green += grit
      blue += grit
    }
    out[i] = red
    out[i + 1] = green
    out[i + 2] = blue
    out[i + 3] = photoA >= 0.999 ? 255 : Math.round(255 * photoA)
  }
}

/** Stable 0..1 value for one photo pixel. Same point, same grain, every redraw. */
function grainUnit(x: number, y: number): number {
  let n = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) >>> 0
  n = (n ^ (n >>> 13)) >>> 0
  n = Math.imul(n, 1274126177) >>> 0
  return (n & 1023) / 1023
}

/**
 * Eyedropper. A painted pixel returns the pigment stored in the tint layer,
 * not the bright or dark shade the photo's lighting created. An unpainted
 * pixel returns the photo color.
 */
export function sampleTintHex(tint: Uint8ClampedArray, photo: Uint8ClampedArray): string | null {
  if (photo[3] <= 8) return null
  if (tint[3] > 0) return rgbToHex(tint[0], tint[1], tint[2])
  return rgbToHex(photo[0], photo[1], photo[2])
}
