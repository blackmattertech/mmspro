import test from 'node:test'
import assert from 'node:assert/strict'
import sharp from 'sharp'
import { preparePdfLogo } from './pdfLogo.js'

test('preparePdfLogo downscales huge logos for PDF embedding', async () => {
  const huge = await sharp({
    create: {
      width: 2000,
      height: 2000,
      channels: 3,
      background: { r: 200, g: 30, b: 30 },
    },
  }).png().toBuffer()

  const prepared = await preparePdfLogo(huge)
  assert.ok(Buffer.isBuffer(prepared))
  assert.ok(prepared.length < huge.length)

  const meta = await sharp(prepared).metadata()
  assert.ok(meta.width <= 240)
  assert.ok(meta.height <= 240)
})

test('preparePdfLogo returns null for invalid buffers', async () => {
  assert.equal(await preparePdfLogo(Buffer.from('not-an-image')), null)
  assert.equal(await preparePdfLogo(null), null)
})
