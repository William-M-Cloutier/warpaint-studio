/** Photo scale resizes the picture. View zoom pans and magnifies the canvas around it. */
export const MIN_PHOTO_SCALE = 0.05
export const MAX_PHOTO_SCALE = 8

const LOG_MIN = Math.log(MIN_PHOTO_SCALE)
const LOG_MAX = Math.log(MAX_PHOTO_SCALE)

export function clampPhotoScale(scale: number): number {
  if (!Number.isFinite(scale)) return 1
  return Math.min(MAX_PHOTO_SCALE, Math.max(MIN_PHOTO_SCALE, scale))
}

/** Uniform scale that fits the photo in the viewport without stretching either side. */
export function fitPhotoScale(
  viewportWidth: number,
  viewportHeight: number,
  imageWidth: number,
  imageHeight: number,
  pad = 48,
): number {
  if (imageWidth < 1 || imageHeight < 1) return 1
  const innerW = Math.max(32, viewportWidth - pad)
  const innerH = Math.max(32, viewportHeight - pad)
  return clampPhotoScale(Math.min(innerW / imageWidth, innerH / imageHeight))
}

/** Slider position 0–1000 mapped logarithmically across the photo-scale range. */
export function photoScaleToSlider(scale: number): number {
  const clamped = clampPhotoScale(scale)
  const t = (Math.log(clamped) - LOG_MIN) / (LOG_MAX - LOG_MIN)
  return Math.round(t * 1000)
}

export function sliderToPhotoScale(position: number): number {
  const t = Math.min(1000, Math.max(0, position)) / 1000
  return clampPhotoScale(Math.exp(LOG_MIN + t * (LOG_MAX - LOG_MIN)))
}
