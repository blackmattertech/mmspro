import { useState } from 'react'
import { validateWorkOrderFile } from '../../lib/workOrderAssets'
import {
  createLocalFileItem,
  getFilePreviewSrc,
} from '../../lib/workOrderFileValues'
import { downloadFromUrl } from '../../lib/fileDownload'
import AttachmentsEvidence, {
  DEFAULT_DOCUMENT_ACCEPT,
  DEFAULT_DOCUMENT_HINT,
  DEFAULT_IMAGE_HINT,
  normalizeAttachmentItem,
} from '../shared/AttachmentsEvidence'
import { IMAGE_ACCEPT } from '../../lib/imageFiles'

export const WR_ATTACHMENT_ACCEPT = 'image/*,.svg,.jpg,.jpeg,.png,.gif,.webp,.bmp,.avif,.ico,.heic,.heif,.pdf,.doc,.docx,.xls,.xlsx,.zip'

export default function WorkRequestAttachmentsField({
  files = [],
  onChange,
  disabled = false,
  label = 'Attachments & Evidence',
  description = 'Upload photos of the issue and supporting maintenance documents.',
  badge = 'Optional',
  showHeader = true,
}) {
  const [fileError, setFileError] = useState(null)

  const items = files.map((item, index) => {
    const normalized = normalizeAttachmentItem(item, index)
    if (!normalized) return null
    return {
      ...normalized,
      previewSrc: normalized.kind === 'image' ? getFilePreviewSrc(item) : null,
      openUrl: getFilePreviewSrc(item) || normalized.openUrl,
      raw: item,
      index,
    }
  }).filter(Boolean)

  const handlePickFiles = (picked) => {
    if (!picked.length) return
    setFileError(null)
    const next = [...files]
    for (const file of picked) {
      const error = validateWorkOrderFile(file, 'file')
      if (error) {
        setFileError(error)
        continue
      }
      next.push(createLocalFileItem(file, 'file'))
    }
    onChange?.(next)
  }

  const removeItem = (item) => {
    const index = item.index
    if (index == null || index < 0) return
    const target = files[index]
    if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl)
    onChange?.(files.filter((_, i) => i !== index))
  }

  return (
    <AttachmentsEvidence
      className="wr-attach-field"
      title={label}
      description={description}
      badge={badge}
      showHeader={showHeader}
      items={items}
      disabled={disabled}
      error={fileError}
      imageAccept={IMAGE_ACCEPT}
      documentAccept={DEFAULT_DOCUMENT_ACCEPT}
      imageHint={DEFAULT_IMAGE_HINT}
      documentHint={DEFAULT_DOCUMENT_HINT}
      onPickFiles={handlePickFiles}
      onRemove={removeItem}
      onDownload={async (item) => {
        const src = item.openUrl || item.previewSrc
        if (src) await downloadFromUrl(src, item.name)
      }}
    />
  )
}
