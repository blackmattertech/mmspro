/**
 * Trigger a browser download from a remote or signed URL.
 * Falls back to opening a new tab if the file cannot be fetched.
 */
export async function downloadFromUrl(url, filename = 'download') {
  if (!url) return
  try {
    const response = await fetch(url)
    if (!response.ok) throw new Error('Could not download file')
    const blob = await response.blob()
    const objectUrl = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = objectUrl
    link.download = filename
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(objectUrl)
  } catch {
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.target = '_blank'
    link.rel = 'noopener noreferrer'
    document.body.appendChild(link)
    link.click()
    link.remove()
  }
}

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
