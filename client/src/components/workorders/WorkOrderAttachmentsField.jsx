import { useEffect, useRef, useState } from 'react'
import { getWorkOrderFileSignedUrl, validateWorkOrderFile } from '../../lib/workOrderAssets'
import { downloadFromUrl } from '../../lib/fileDownload'
import { isImageFileItem } from '../../lib/workOrderFileValues'
import ImageLightbox from '../shared/ImageLightbox'
import '../workrequests/WorkRequests.css'
import './ManualWorkOrder.css'

function formatFileSize(bytes) {
  const n = Number(bytes)
  if (!Number.isFinite(n) || n <= 0) return null
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

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
  accept = 'image/*,.pdf,.doc,.docx,.xls,.xlsx',
  addLabel = 'Add photos or files',
}) {
  const inputRef = useRef(null)
  const [urls, setUrls] = useState({})
  const [lightbox, setLightbox] = useState(null)
  const [fileError, setFileError] = useState(null)

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

  const openStored = async (file) => {
    const label = fileLabel(file)
    const url = (file.path && urls[file.path]) || file.url || file.previewUrl
    setFileError(null)
    try {
      const src = url || (file.path ? await getWorkOrderFileSignedUrl(file.path) : null)
      if (!src) return
      if (isImageFileItem(file)) {
        setLightbox({ src, alt: label, filename: label })
        return
      }
      await downloadFromUrl(src, label)
    } catch (err) {
      setFileError(err.message || 'Could not open file')
    }
  }

  const downloadStored = async (file) => {
    const label = fileLabel(file)
    setFileError(null)
    try {
      const src = (file.path && urls[file.path])
        || file.url
        || (file.path ? await getWorkOrderFileSignedUrl(file.path) : null)
      if (src) await downloadFromUrl(src, label)
    } catch (err) {
      setFileError(err.message || 'Could not download file')
    }
  }

  const handlePick = (event) => {
    const picked = Array.from(event.target.files || [])
    event.target.value = ''
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

  const hasItems = files.length > 0 || pendingFiles.length > 0

  return (
    <div className="wo-execution-files">
      {fileError && (
        <div className="wo-alert wo-alert--error" role="alert">{fileError}</div>
      )}

      {hasItems && (
        <ul className="wr-detail-attachments">
          {files.map((file, index) => {
            const label = fileLabel(file)
            const size = formatFileSize(file.size)
            const previewSrc = (file.path && urls[file.path]) || file.url
            const isImage = isImageFileItem(file)
            return (
              <li key={file.path || `${label}-${index}`} className="wr-detail-attachments__item">
                <button
                  type="button"
                  className="wr-detail-attachments__thumb"
                  onClick={() => openStored(file)}
                  aria-label={isImage ? `Preview ${label}` : `Download ${label}`}
                >
                  {isImage && previewSrc ? (
                    <img src={previewSrc} alt="" />
                  ) : (
                    <span className="wr-detail-attachments__fallback" aria-hidden="true">
                      {(label.split('.').pop() || 'FILE').slice(0, 4).toUpperCase()}
                    </span>
                  )}
                </button>
                <div className="wr-detail-attachments__meta">
                  <button
                    type="button"
                    className="wo-received-detail__file-link"
                    onClick={() => openStored(file)}
                  >
                    {label}
                  </button>
                  {size && <span className="wr-detail-attachments__size">{size}</span>}
                  <button
                    type="button"
                    className="wr-detail-attachments__download"
                    onClick={() => downloadStored(file)}
                  >
                    Download
                  </button>
                  {!readOnly && (
                    <button
                      type="button"
                      className="wr-detail-attachments__download"
                      onClick={() => onRemoveFile?.(file, index)}
                      disabled={disabled}
                    >
                      Remove
                    </button>
                  )}
                </div>
              </li>
            )
          })}

          {pendingFiles.map((file, index) => {
            const isImage = String(file.type || '').startsWith('image/')
            const previewSrc = file.previewUrl
            return (
              <li key={`pending-${file.name}-${index}`} className="wr-detail-attachments__item">
                <div className="wr-detail-attachments__thumb" aria-hidden="true">
                  {isImage && previewSrc ? (
                    <img src={previewSrc} alt="" />
                  ) : (
                    <span className="wr-detail-attachments__fallback">
                      {(file.name.split('.').pop() || 'FILE').slice(0, 4).toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="wr-detail-attachments__meta">
                  <span className="wo-received-detail__file-link">{file.name}</span>
                  <span className="wr-detail-attachments__size">Ready to upload</span>
                  {!readOnly && (
                    <button
                      type="button"
                      className="wr-detail-attachments__download"
                      onClick={() => onRemovePending?.(index)}
                      disabled={disabled}
                    >
                      Remove
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {!readOnly && (
        <div className="wo-execution-files__add">
          <input
            ref={inputRef}
            type="file"
            accept={accept}
            multiple
            className="wo-execution-files__input"
            disabled={disabled}
            onChange={handlePick}
          />
          <button
            type="button"
            className="company-btn company-btn--secondary company-btn--compact"
            disabled={disabled}
            onClick={() => inputRef.current?.click()}
          >
            {addLabel}
          </button>
          <span className="wo-execution-files__hint">
            JPG, PNG, PDF, DOC, or XLS · up to 10 MB each
          </span>
        </div>
      )}

      {lightbox && (
        <ImageLightbox
          src={lightbox.src}
          alt={lightbox.alt}
          filename={lightbox.filename}
          onClose={() => setLightbox(null)}
        />
      )}
    </div>
  )
}
