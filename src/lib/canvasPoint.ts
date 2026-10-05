export type ClientRect = {
  left: number
  top: number
  right: number
  bottom: number
  width: number
  height: number
}

/**
 * Map a pointer position into photo bitmap pixels.
 * The stage is CSS-sized by photo scale and then view-zoomed, so the bitmap
 * size and the on-screen rect differ. Both axes use that rect.
 */
export function canvasToBitmap(
  clientX: number,
  clientY: number,
  rect: ClientRect,
  bitmapWidth: number,
  bitmapHeight: number,
): { x: number; y: number } | null {
  if (rect.width < 1 || rect.height < 1 || bitmapWidth < 1 || bitmapHeight < 1) return null
  if (clientX < rect.left || clientY < rect.top || clientX > rect.right || clientY > rect.bottom) return null
  const x = ((clientX - rect.left) / rect.width) * bitmapWidth
  const y = ((clientY - rect.top) / rect.height) * bitmapHeight
  return {
    x: clamp(x, 0, Math.max(0, bitmapWidth - 0.01)),
    y: clamp(y, 0, Math.max(0, bitmapHeight - 0.01)),
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
