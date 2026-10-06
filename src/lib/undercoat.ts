/** Strength when Undercoat is turned on. 0 is a clean coat; 1 is a full shadow from the pigment underneath. */
export const UNDERCOAT_DEFAULT = 0.6

/**
 * New pigment shadowed by paint already on that pixel.
 * An empty pixel, or strength 0, leaves the new colour alone.
 * Black pulls the coat darker. White leaves it. A coloured undercoat tints by multiply.
 */
export function undercoatChannel(next: number, under: number, underAlpha: number, strength: number): number {
  if (!(strength > 0) || underAlpha < 8) return next
  const cover = Math.min(1, strength) * (underAlpha / 255)
  const shadowed = next * (1 - cover * (1 - under / 255))
  return Math.max(0, Math.min(255, Math.round(shadowed)))
}

/** Rewrite a coat stamp in place. `dest` is the tint already on the canvas, same pixel order. */
export function shadeStampWithUndercoat(stamp: Uint8ClampedArray, dest: Uint8ClampedArray, strength: number): void {
  if (!(strength > 0)) return
  const count = Math.min(stamp.length, dest.length)
  for (let i = 0; i < count; i += 4) {
    if (stamp[i + 3] === 0 || dest[i + 3] < 8) continue
    stamp[i] = undercoatChannel(stamp[i], dest[i], dest[i + 3], strength)
    stamp[i + 1] = undercoatChannel(stamp[i + 1], dest[i + 1], dest[i + 3], strength)
    stamp[i + 2] = undercoatChannel(stamp[i + 2], dest[i + 2], dest[i + 3], strength)
  }
}
