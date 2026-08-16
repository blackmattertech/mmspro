export const WARRANTY_DOCUMENT_LABELS = [
  { value: 'po', label: 'PO' },
  { value: 'invoice', label: 'Invoice' },
  { value: 'warranty_certificate', label: 'Warranty Certificate' },
  { value: 'delivery_challan', label: 'Delivery Challan' },
  { value: 'other', label: 'Other' },
]

export function warrantyDocumentLabelText(value) {
  const preset = WARRANTY_DOCUMENT_LABELS.find((opt) => opt.value === value)
  if (preset) return preset.label
  return value?.trim() || 'Other'
}

export const WARRANTY_DOCUMENT_ACCEPT = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'application/pdf',
  '.pdf',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
].join(',')

export function isWarrantyImageDocument(contentType) {
  return String(contentType || '').startsWith('image/')
}

export function inferWarrantyDocumentContentType(fileName, contentType) {
  const raw = String(contentType || '').trim().toLowerCase()
  if (raw && raw !== 'application/octet-stream') return raw

  const ext = String(fileName || '').split('.').pop()?.toLowerCase()
  const byExt = {
    pdf: 'application/pdf',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    gif: 'image/gif',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  }
  return byExt[ext] || raw || ''
}

export function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('Could not read the file'))
    reader.readAsDataURL(file)
  })
}
