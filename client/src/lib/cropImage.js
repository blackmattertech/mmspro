export const CROP_VIEWPORT_SIZE = 280
export const CROP_OUTPUT_SIZE = 512

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = reject
    image.src = src
  })
}

export function getCoverScale(image, viewportSize) {
  return Math.max(
    viewportSize / image.naturalWidth,
    viewportSize / image.naturalHeight,
  )
}

export async function cropImageToFile({
  imageSrc,
  viewportSize,
  scale,
  position,
  outputSize = CROP_OUTPUT_SIZE,
  fileName = 'photo.jpg',
  mimeType = 'image/jpeg',
}) {
  const image = await loadImage(imageSrc)
  const displayWidth = image.naturalWidth * scale
  const displayHeight = image.naturalHeight * scale

  const imgX = (viewportSize - displayWidth) / 2 + position.x
  const imgY = (viewportSize - displayHeight) / 2 + position.y

  let sourceX = -imgX / scale
  let sourceY = -imgY / scale
  let sourceSize = viewportSize / scale

  const maxSize = Math.min(image.naturalWidth, image.naturalHeight)
  sourceSize = Math.min(sourceSize, maxSize)
  sourceX = Math.max(0, Math.min(sourceX, image.naturalWidth - sourceSize))
  sourceY = Math.max(0, Math.min(sourceY, image.naturalHeight - sourceSize))

  const canvas = document.createElement('canvas')
  canvas.width = outputSize
  canvas.height = outputSize
  const ctx = canvas.getContext('2d')
  ctx.drawImage(
    image,
    sourceX,
    sourceY,
    sourceSize,
    sourceSize,
    0,
    0,
    outputSize,
    outputSize,
  )

  const blob = await new Promise((resolve) => {
    canvas.toBlob(resolve, mimeType, 0.92)
  })

  if (!blob) throw new Error('Could not process image')
  return new File([blob], fileName, { type: mimeType })
}
