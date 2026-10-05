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
 */
export function shadePigment(
  brushR: number,
  brushG: number,
  brushB: number,
  photoLuminance: number,
): [number, number, number] {
  if (photoLuminance <= PIVOT_LUMINANCE) {
    const scale = photoLuminance / PIVOT_LUMINANCE
    return [brushR * scale, brushG * scale, brushB * scale]
  }
  const t = (photoLuminance - PIVOT_LUMINANCE) / (1 - PIVOT_LUMINANCE)
  const lift = smoothstep(t) * HIGHLIGHT_LIFT
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
 */
export function compositeSurface(
  tint: Uint8ClampedArray,
  photo: Uint8ClampedArray,
  out: Uint8ClampedArray,
): void {
  for (let i = 0; i < tint.length; i += 4) {
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
    const [tr, tg, tb] = shadePigment(tint[i], tint[i + 1], tint[i + 2], luminance(pr, pg, pb))
    out[i] = pr + (tr - pr) * alpha
    out[i + 1] = pg + (tg - pg) * alpha
    out[i + 2] = pb + (tb - pb) * alpha
    out[i + 3] = photoA >= 0.999 ? 255 : Math.round(255 * photoA)
  }
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
