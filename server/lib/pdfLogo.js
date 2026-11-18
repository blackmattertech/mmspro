import sharp from 'sharp'

const MAX_EDGE = 240
const MAX_BYTES = 80_000

/**
 * Downscale org logos before PDFKit embed.
 * PDFKit stores the full source bitmap even when drawn with `fit`, so a 9k×9k
 * logo makes multi-page reports multi-second and multi-megabyte.
 */
export async function preparePdfLogo(buffer, {
  maxEdge = MAX_EDGE,
  maxBytes = MAX_BYTES,
} = {}) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 24) return null
  try {
    const image = sharp(buffer, { failOn: 'none' })
    const meta = await image.metadata()
    if (!meta.width || !meta.height) return null

    let pipeline = image.rotate()
    if (meta.width > maxEdge || meta.height > maxEdge) {
      pipeline = pipeline.resize({
        width: maxEdge,
        height: maxEdge,
        fit: 'inside',
        withoutEnlargement: true,
      })
    }

    // Prefer compact PNG for logos with transparency; fall back to JPEG if still large.
    let out = await pipeline.png({ compressionLevel: 9, palette: true }).toBuffer()
    if (out.length > maxBytes) {
      out = await sharp(buffer, { failOn: 'none' })
        .rotate()
        .resize({
          width: maxEdge,
          height: maxEdge,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .jpeg({ quality: 72, mozjpeg: true })
        .toBuffer()
    }
    if (!out.length || out.length > maxBytes * 2) return null
    return out
  } catch {
    return null
  }
}
