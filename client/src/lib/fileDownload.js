/**
 * Trigger a browser download from a base64-encoded file payload.
 * @param {{ filename?: string, contentType?: string, data: string }} file
 */
export function downloadBase64File(file) {
  if (!file?.data) return
  const bytes = Uint8Array.from(atob(file.data), (c) => c.charCodeAt(0))
  const blob = new Blob([bytes], {
    type: file.contentType || 'application/octet-stream',
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = file.filename || 'download'
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

/**
 * @param {File} file
 * @returns {Promise<string>} base64 payload without data-URL prefix
 */
export function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = String(reader.result || '')
      resolve(dataUrl.split(',').pop() || '')
    }
    reader.onerror = () => reject(new Error('Could not read the file'))
    reader.readAsDataURL(file)
  })
}
