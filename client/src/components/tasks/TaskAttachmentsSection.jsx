import {
  inferWarrantyDocumentContentType,
  isWarrantyImageDocument,
  readFileAsDataUrl,
} from '../../config/warrantyDocuments'
import { TASK_ATTACHMENT_ACCEPT } from '../../config/taskAttachments'
import { downloadFromUrl } from '../../lib/fileDownload'
import AttachmentsEvidence, {
  normalizeAttachmentItem,
} from '../shared/AttachmentsEvidence'
import { IMAGE_ACCEPT } from '../../lib/imageFiles'

function makePendingId() {
  return `pending-${crypto.randomUUID()}`
}

const TASK_IMAGE_HINT = 'JPG, PNG, WebP, GIF, SVG · Max 25 MB each'
const TASK_DOCUMENT_HINT = 'PDF, DOC, DOCX, XLS, XLSX, PPT, ZIP, video · Max 25 MB each'

export default function TaskAttachmentsSection({
  attachments = [],
  removedAttachmentIds = [],
  onChange,
  disabled = false,
  showHeader = true,
}) {
  const updateAttachments = (nextAttachments, nextRemoved = removedAttachmentIds) => {
    onChange({ attachments: nextAttachments, removedAttachmentIds: nextRemoved })
  }

  const items = attachments.map((file, index) => {
    const typed = {
      ...file,
      name: file.file_name,
      type: file.content_type,
      size: file.file_size,
      previewUrl: file.preview_url || (
        isWarrantyImageDocument(file.content_type) ? file.signed_url : null
      ),
      signed_url: file.signed_url,
      url: file.signed_url,
    }
    const normalized = normalizeAttachmentItem(typed, index)
    if (!normalized) return null
    return {
      ...normalized,
      index,
      raw: file,
    }
  }).filter(Boolean)

  const handlePickFiles = async (files) => {
    if (!files.length) return
    const next = [...attachments]
    for (const file of files) {
      const data = await readFileAsDataUrl(file)
      const content_type = inferWarrantyDocumentContentType(file.name, file.type)
      next.push({
        id: makePendingId(),
        file_name: file.name,
        content_type,
        file_size: file.size,
        data,
        preview_url: isWarrantyImageDocument(content_type) ? data : null,
        isPending: true,
      })
    }
    updateAttachments(next)
  }

  const removeItem = (item) => {
    const index = item.index
    const file = attachments[index]
    const next = attachments.filter((_, i) => i !== index)
    const nextRemoved = file?.id && !file.isPending
      ? [...removedAttachmentIds, file.id]
      : removedAttachmentIds
    updateAttachments(next, nextRemoved)
  }

  return (
    <AttachmentsEvidence
      className="task-attachments"
      title="Attachments & Evidence"
      description="Upload photos, PDFs, documents, or videos related to this task."
      badge="Optional"
      showHeader={showHeader}
      items={items}
      disabled={disabled}
      imageAccept={IMAGE_ACCEPT}
      documentAccept={TASK_ATTACHMENT_ACCEPT}
      imageHint={TASK_IMAGE_HINT}
      documentHint={TASK_DOCUMENT_HINT}
      onPickFiles={handlePickFiles}
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
    />
  )
}
