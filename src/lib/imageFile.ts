const IMAGE_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif',
  'image/bmp',
])

/** Browser canvas memory cap for the paint buffers. Not a user-facing scale tool. */
export const MAX_PHOTO_PIXELS = 24_000_000
export const MAX_PHOTO_SIDE = 12_000

export function isImageFile(file: File): boolean {
  if (IMAGE_TYPES.has(file.type)) return true
  return /\.(png|jpe?g|webp|gif|bmp)$/i.test(file.name)
}

export function decodeImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Could not decode image'))
    image.src = url
  })
}

export function photoTooLarge(width: number, height: number): boolean {
  return width > MAX_PHOTO_SIDE || height > MAX_PHOTO_SIDE || width * height > MAX_PHOTO_PIXELS
}
