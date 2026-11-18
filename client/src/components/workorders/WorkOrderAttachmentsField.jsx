import { useEffect, useMemo, useState } from 'react'
import { getWorkOrderFileSignedUrl, validateWorkOrderFile } from '../../lib/workOrderAssets'
import { downloadFromUrl } from '../../lib/fileDownload'
import { IMAGE_ACCEPT } from '../../lib/imageFiles'
import AttachmentsEvidence, {
  DEFAULT_DOCUMENT_ACCEPT,
  DEFAULT_DOCUMENT_HINT,
  DEFAULT_IMAGE_HINT,
  normalizeAttachmentItem,
} from '../shared/AttachmentsEvidence'
import ImageLightbox from '../shared/ImageLightbox'
import '../workrequests/WorkRequests.css'
import './ManualWorkOrder.css'

function fileLabel(file) {
  return file?.name || file?.file_name || 'File'
}

export default function WorkOrderAttachmentsField({
  files = [],
  pendingFiles = [],
  onAddPending,
  onRemovePending,
  onRemoveFile,
  readOnly = false,
  disabled = false,
  accept = DEFAULT_DOCUMENT_ACCEPT,
  title = 'Attachments & Evidence',
  description = 'Upload photos of the issue and supporting maintenance documents.',
  badge = 'Optional',
  showHeader = true,
}) {
  const [urls, setUrls] = useState({})
  const [fileError, setFileError] = useState(null)
  const [lightbox, setLightbox] = useState(null)

  const pathKey = files.map((file) => file.path).filter(Boolean).join('|')

  useEffect(() => {
    if (!pathKey) {
      setUrls({})
      return undefined
    }

    let cancelled = false
    const paths = pathKey.split('|')
    ;(async () => {
      const next = {}
      await Promise.all(paths.map(async (path) => {
        try {
          const url = await getWorkOrderFileSignedUrl(path)
          if (url) next[path] = url
        } catch (err) {
          if (!cancelled) setFileError(err.message || 'Could not open file')
        }
      }))
      if (!cancelled) setUrls(next)
    })()

    return () => { cancelled = true }
  }, [pathKey])

  const items = useMemo(() => {
    const stored = files.map((file, index) => {
      const normalized = normalizeAttachmentItem(file, index, urls)
      if (!normalized) return null
      return {
        ...normalized,
        key: `stored-${normalized.key}`,
        source: 'stored',
        index,
        raw: file,
      }
    }).filter(Boolean)

    const pending = pendingFiles.map((file, index) => {
      const normalized = normalizeAttachmentItem({
        ...file,
        name: file.name,
        type: file.type,
        previewUrl: file.previewUrl,
        size: file.size,
        statusLabel: 'Ready to upload',
      }, index)
      if (!normalized) return null
      return {
        ...normalized,
        key: `pending-${file.name}-${index}`,
        source: 'pending',
        index,
        raw: file,
      }
    }).filter(Boolean)

    return [...stored, ...pending]
  }, [files, pendingFiles, urls])

  const resolveUrl = async (file) => {
    const cached = (file.path && urls[file.path]) || file.url || file.previewUrl
    if (cached) return cached
    if (file.path) return getWorkOrderFileSignedUrl(file.path)
    return null
  }

  const openItem = async (item) => {
    setFileError(null)
    try {
      const src = item.source === 'pending'
        ? (item.previewSrc || item.openUrl)
        : await resolveUrl(item.raw)
      if (!src) return
      if (item.kind === 'image') {
        setLightbox({ src, alt: item.name, filename: item.name })
        return
      }
      window.open(src, '_blank', 'noopener,noreferrer')
    } catch (err) {
      setFileError(err.message || 'Could not open file')
    }
  }

  const downloadItem = async (item) => {
    setFileError(null)
    try {
      const src = item.source === 'pending'
        ? (item.openUrl || item.previewSrc)
        : await resolveUrl(item.raw)
      if (src) await downloadFromUrl(src, item.name || fileLabel(item.raw))
    } catch (err) {
      setFileError(err.message || 'Could not download file')
    }
  }

  const handlePick = (picked) => {
    if (!picked.length) return
    setFileError(null)
    const accepted = []
    for (const file of picked) {
      const error = validateWorkOrderFile(file, 'file')
      if (error) {
        setFileError(error)
        continue
      }
      accepted.push(file)
    }
    if (accepted.length) onAddPending?.(accepted)
  }

  const removeItem = (item) => {
    if (item.source === 'pending') {
      onRemovePending?.(item.index)
      return
    }
    onRemoveFile?.(item.raw, item.index)
  }

  return (
    <>
      <AttachmentsEvidence
        className="wo-execution-files"
        title={title}
        description={description}
        badge={readOnly ? null : badge}
        showHeader={showHeader}
        items={items}
        disabled={disabled}
        readOnly={readOnly}
        error={fileError}
        imageAccept={IMAGE_ACCEPT}
        documentAccept={accept}
        imageHint={DEFAULT_IMAGE_HINT}
        documentHint={DEFAULT_DOCUMENT_HINT}
        onPickFiles={handlePick}
        onRemove={removeItem}
        onView={openItem}
        onDownload={downloadItem}
      />
      {lightbox && (
        <ImageLightbox
          src={lightbox.src}
          alt={lightbox.alt}
          filename={lightbox.filename}
          onClose={() => setLightbox(null)}
        />
      )}
    </>
  )
}
