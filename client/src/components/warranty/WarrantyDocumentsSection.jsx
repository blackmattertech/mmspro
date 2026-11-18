import SpellcheckInput from '../shared/SpellcheckInput'
import {
  WARRANTY_DOCUMENT_ACCEPT,
  inferWarrantyDocumentContentType,
  isWarrantyImageDocument,
  readFileAsDataUrl,
} from '../../config/warrantyDocuments'
import { downloadFromUrl } from '../../lib/fileDownload'
import { IMAGE_ACCEPT } from '../../lib/imageFiles'
import AttachmentsEvidence, {
  normalizeAttachmentItem,
} from '../shared/AttachmentsEvidence'

function makePendingId() {
  return `pending-${crypto.randomUUID()}`
}

const WARRANTY_IMAGE_HINT = 'JPG, PNG, WebP, GIF, SVG · Max 25 MB each'
const WARRANTY_DOCUMENT_HINT = 'PDF, DOC, DOCX, XLS, XLSX, and images · Max 25 MB each'

export default function WarrantyDocumentsSection({
  documents = [],
  removedDocumentIds = [],
  onChange,
  disabled = false,
  title = 'Attachments & Evidence',
  description = 'Upload product photos and supporting warranty documents.',
  compact = false,
  showHeader = true,
}) {
  const updateDocuments = (nextDocuments, nextRemoved = removedDocumentIds) => {
    onChange({ documents: nextDocuments, removedDocumentIds: nextRemoved })
  }

  const items = documents.map((doc, index) => {
    const typed = {
      ...doc,
      name: doc.file_name,
      type: doc.content_type,
      size: doc.file_size,
      previewUrl: doc.preview_url || (
        isWarrantyImageDocument(doc.content_type) ? doc.signed_url : null
      ),
      signed_url: doc.signed_url,
      url: doc.signed_url,
    }
    const normalized = normalizeAttachmentItem(typed, index)
    if (!normalized) return null
    return {
      ...normalized,
      index,
      raw: doc,
    }
  }).filter(Boolean)

  const addFiles = async (files) => {
    if (!files.length || disabled) return
    const next = [...documents]
    for (const file of files) {
      const data = await readFileAsDataUrl(file)
      next.push({
        id: makePendingId(),
        label: '',
        file_name: file.name,
        content_type: inferWarrantyDocumentContentType(file.name, file.type),
        file_size: file.size,
        data,
        preview_url: isWarrantyImageDocument(file.type) ? data : null,
        isPending: true,
      })
    }
    updateDocuments(next)
  }

  const setDocumentLabel = (index, label) => {
    const next = documents.map((doc, i) => (
      i === index ? { ...doc, label } : doc
    ))
    updateDocuments(next)
  }

  const removeItem = (item) => {
    const index = item.index
    const doc = documents[index]
    const next = documents.filter((_, i) => i !== index)
    const nextRemoved = doc?.id && !doc.isPending
      ? [...removedDocumentIds, doc.id]
      : removedDocumentIds
    updateDocuments(next, nextRemoved)
  }

  return (
    <AttachmentsEvidence
      className={`warranty-docs${compact ? ' warranty-docs--compact' : ''}`}
      title={title}
      description={description}
      badge="Optional"
      showHeader={showHeader}
      compact={compact}
      items={items}
      disabled={disabled}
      imageAccept={IMAGE_ACCEPT}
      documentAccept={WARRANTY_DOCUMENT_ACCEPT}
      imageHint={WARRANTY_IMAGE_HINT}
      documentHint={WARRANTY_DOCUMENT_HINT}
      onPickFiles={addFiles}
      onRemove={removeItem}
      onDownload={async (item) => {
        const src = item.openUrl || item.previewSrc || item.raw?.signed_url
        if (!src) return
        if (String(src).startsWith('data:')) {
          const link = document.createElement('a')
          link.href = src
          link.download = item.name
          document.body.appendChild(link)
          link.click()
          link.remove()
          return
        }
        await downloadFromUrl(src, item.name)
      }}
      renderDocumentExtra={(item) => (
        <SpellcheckInput
          type="text"
          className="company-form__input warranty-docs__label"
          value={item.raw?.label ?? ''}
          placeholder="Label"
          disabled={disabled}
          onChange={(e) => setDocumentLabel(item.index, e.target.value)}
        />
      )}
    />
  )
}
