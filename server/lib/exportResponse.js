/**
 * Report/file export response negotiation.
 *
 * New clients send `X-MMS-Response: blob` (and Accept: application/pdf|text/csv)
 * and receive binary attachments — avoids large base64 JSON NetworkErrors.
 *
 * Legacy clients (apiFetch JSON) omit that header and keep receiving
 * `{ filename, contentType, data }` base64 JSON so mixed deploys stay safe.
 */
export function wantsBlobExport(req = {}) {
  const headers = req.headers || {}
  const body = req.body || {}
  const explicit = String(
    headers['x-mms-response']
      || headers['X-MMS-Response']
      || body.response_format
      || '',
  ).trim().toLowerCase()

  if (explicit === 'blob' || explicit === 'binary') return true
  if (explicit === 'json' || explicit === 'base64') return false

  const accept = String(headers.accept || headers.Accept || '')
  if (/application\/pdf|text\/csv|application\/octet-stream/i.test(accept)) return true
  if (/application\/json/i.test(accept)) return false

  // Default legacy JSON so an old frontend keeps working until it is redeployed.
  return false
}

export function sendBase64Export(res, {
  buffer,
  filename,
  contentType,
}) {
  res.setHeader('Cache-Control', 'no-store')
  res.json({
    filename,
    contentType,
    data: Buffer.from(buffer).toString('base64'),
  })
}

export function sendBlobExport(res, {
  buffer,
  filename,
  contentType,
}) {
  res.setHeader('Content-Type', contentType)
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
  res.setHeader('Cache-Control', 'no-store')
  res.send(Buffer.from(buffer))
}
