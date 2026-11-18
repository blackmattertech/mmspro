import { useMemo, useRef, useState } from 'react'
import { IMAGE_ACCEPT } from '../../lib/imageFiles'
import { getAttachmentKind } from '../../lib/workOrderFileValues'
import { downloadFromUrl } from '../../lib/fileDownload'
import ImageLightbox from './ImageLightbox'
import NavIcon from '../layout/NavIcon'
import './AttachmentsEvidence.css'

export const DEFAULT_DOCUMENT_ACCEPT = [
  'image/*',
  '.svg',
  '.pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.zip',
].join(',')

export const DEFAULT_IMAGE_HINT = 'JPG, PNG, WebP, GIF, SVG, BMP, AVIF · Max 10 MB each'
export const DEFAULT_DOCUMENT_HINT = 'PDF, DOC, DOCX, XLS, XLSX, and images · Max 10 MB each'

export function formatAttachmentSize(bytes) {
  const n = Number(bytes)
  if (!Number.isFinite(n) || n <= 0) return null
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

export function attachmentExtension(name) {
  return (String(name || '').split('.').pop() || 'FILE').slice(0, 4).toUpperCase()
}

/**
 * Normalize heterogeneous attachment shapes (WR/WO/task/warranty) into UI items.
 */
export function normalizeAttachmentItem(item, index = 0, signedUrls = {}) {
  if (!item) return null
  const name = item.name || item.file_name || 'File'
  const key = String(item.key || item.id || item.path || `file-${index}-${name}`)
  const size = item.size ?? item.file_size ?? item.file?.size ?? null
  const typed = {
    ...item,
    type: item.type || item.mime_type || item.content_type || item.file?.type || '',
    name,
  }
  const kind = item.kind || getAttachmentKind(typed)
  const signed = item.path ? signedUrls[item.path] : null
  const previewSrc = kind === 'image'
    ? (
      item.previewSrc
      || item.previewUrl
      || item.preview_url
      || item.signed_url
      || item.url
      || signed
      || null
    )
    : null
  const openUrl = (
    item.openUrl
    || item.signed_url
    || item.url
    || item.previewUrl
    || item.preview_url
    || previewSrc
    || signed
    || null
  )

  return {
    key,
    name,
    size,
    kind,
    previewSrc,
    openUrl,
    statusLabel: item.statusLabel || null,
    path: item.path || null,
    raw: item,
  }
}

function PaperclipIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M16.5 6.75v8.25a4.5 4.5 0 1 1-9 0V6a3 3 0 1 1 6 0v8.25a1.5 1.5 0 1 1-3 0V7.5h-1.5v6.75a3 3 0 1 0 6 0V6a4.5 4.5 0 1 0-9 0v9a6 6 0 1 0 12 0V6.75H16.5z"
        fill="currentColor"
      />
    </svg>
  )
}

function ImageStackIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="5" width="14" height="12" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M7 17h14v-8a2 2 0 0 0-2-2h-1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="8.5" cy="9.5" r="1.25" fill="currentColor" />
      <path d="m5.5 14.5 3-3 2 2 3.5-3.5 2.5 2.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function FileTextIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M7 3.75h7.5L19 8.25V20.25a.75.75 0 0 1-.75.75H7.75A.75.75 0 0 1 7 20.25V3.75Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M14.5 3.75V8.25H19" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M9.5 12h5M9.5 15.5h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

function ImagePlusIcon({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2.5" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="9" cy="10" r="1.5" fill="currentColor" />
      <path d="m6.5 16 3.2-3.2 2.1 2.1L15 12l2.5 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M17.5 7.5v3M16 9h3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

function CloudUploadIcon({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M7 18h10a4 4 0 0 0 .4-8 5.5 5.5 0 0 0-10.6-1.5A3.5 3.5 0 0 0 7 18Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M12 12v6M9.5 14.5 12 12l2.5 2.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function TrashIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4.5 7h15" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M9.5 7V5.5A1.5 1.5 0 0 1 11 4h2a1.5 1.5 0 0 1 1.5 1.5V7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M8 7.5 8.7 18.2A1.5 1.5 0 0 0 10.2 19.5h3.6a1.5 1.5 0 0 0 1.5-1.3L16 7.5" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M10.5 11v5M13.5 11v5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  )
}

function DropZone({
  accept,
  multiple = true,
  disabled = false,
  variant = 'wide',
  title,
  hint,
  icon,
  onFiles,
}) {
  const inputRef = useRef(null)
  const [dragOver, setDragOver] = useState(false)

  const pickFiles = (fileList) => {
    const files = Array.from(fileList || [])
    if (!files.length || disabled) return
    onFiles?.(files)
  }

  return (
    <div
      className={`ae-drop ae-drop--${variant}${dragOver ? ' is-over' : ''}${disabled ? ' ae-drop--disabled' : ''}`}
      onDragEnter={(event) => {
        event.preventDefault()
        if (!disabled) setDragOver(true)
      }}
      onDragOver={(event) => {
        event.preventDefault()
        if (!disabled) setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(event) => {
        event.preventDefault()
        setDragOver(false)
        pickFiles(event.dataTransfer?.files)
      }}
      onClick={() => {
        if (!disabled) inputRef.current?.click()
      }}
      role="button"
      tabIndex={disabled ? -1 : 0}
      onKeyDown={(event) => {
        if (disabled) return
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          inputRef.current?.click()
        }
      }}
      aria-label={title}
    >
      <input
        ref={inputRef}
        type="file"
        className="ae-drop__input"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        tabIndex={-1}
        onChange={(event) => {
          pickFiles(event.target.files)
          event.target.value = ''
        }}
      />
      <span className="ae-drop__icon" aria-hidden="true">{icon}</span>
      <p className="ae-drop__title">{title}</p>
      {hint ? <p className="ae-drop__hint">{hint}</p> : null}
    </div>
  )
}

function ImageTile({ item, disabled, readOnly, onView, onRemove, renderExtra }) {
  return (
    <div className="ae-image-tile-wrap">
      <div className="ae-image-tile">
        <button
          type="button"
          className="ae-image-tile__preview"
          onClick={() => onView?.(item)}
          aria-label={`View ${item.name}`}
          title={`View ${item.name}`}
        >
          {item.previewSrc ? (
            <img src={item.previewSrc} alt="" />
          ) : (
            <span className="ae-image-tile__fallback">IMG</span>
          )}
        </button>
        <div className="ae-image-tile__actions">
          <button
            type="button"
            className="ae-icon-btn"
            onClick={() => onView?.(item)}
            aria-label={`View ${item.name}`}
            title="View"
          >
            <NavIcon name="view" />
          </button>
          {!readOnly && (
            <button
              type="button"
              className="ae-icon-btn ae-icon-btn--danger"
              onClick={() => onRemove?.(item)}
              disabled={disabled}
              aria-label={`Remove ${item.name}`}
              title="Delete"
            >
              <TrashIcon />
            </button>
          )}
        </div>
      </div>
      {renderExtra ? <div className="ae-image-tile__extra">{renderExtra(item)}</div> : null}
    </div>
  )
}

function DocumentRow({ item, disabled, readOnly, onView, onDownload, onRemove, renderExtra }) {
  const sizeLabel = formatAttachmentSize(item.size)
  const ext = attachmentExtension(item.name)
  const sub = [ext, sizeLabel || item.statusLabel].filter(Boolean).join(' · ')

  return (
    <li className="ae-doc">
      <div className="ae-doc__icon" aria-hidden="true">{ext}</div>
      <div className="ae-doc__meta">
        <p className="ae-doc__name" title={item.name}>{item.name}</p>
        {sub && <p className="ae-doc__sub">{sub}</p>}
        {renderExtra ? <div className="ae-doc__extra">{renderExtra(item)}</div> : null}
      </div>
      <div className="ae-doc__actions">
        <button
          type="button"
          className="ae-icon-btn ae-icon-btn--ghost"
          onClick={() => onView?.(item)}
          aria-label={`View ${item.name}`}
          title="View"
        >
          <NavIcon name="view" />
        </button>
        <button
          type="button"
          className="ae-icon-btn ae-icon-btn--ghost"
          onClick={() => onDownload?.(item)}
          aria-label={`Download ${item.name}`}
          title="Download"
        >
          <NavIcon name="download" />
        </button>
        {!readOnly && (
          <button
            type="button"
            className="ae-icon-btn ae-icon-btn--ghost ae-icon-btn--danger"
            onClick={() => onRemove?.(item)}
            disabled={disabled}
            aria-label={`Remove ${item.name}`}
            title="Delete"
          >
            <TrashIcon />
          </button>
        )}
      </div>
    </li>
  )
}

/**
 * Shared dual-panel attachments UI: Photos & Images + Documents & Files.
 */
export default function AttachmentsEvidence({
  title = 'Attachments & Evidence',
  description = 'Upload photos of the issue and supporting maintenance documents.',
  badge = 'Optional',
  showHeader = true,
  mode = 'both',
  items = [],
  disabled = false,
  readOnly = false,
  imageAccept = IMAGE_ACCEPT,
  documentAccept = DEFAULT_DOCUMENT_ACCEPT,
  imageHint = DEFAULT_IMAGE_HINT,
  documentHint = DEFAULT_DOCUMENT_HINT,
  error = null,
  onPickFiles,
  onRemove,
  onView,
  onDownload,
  renderDocumentExtra,
  className = '',
  compact = false,
}) {
  const [lightbox, setLightbox] = useState(null)

  const normalized = useMemo(
    () => (items || []).map((item, index) => (
      item?.key && item?.name != null && item?.kind
        ? item
        : normalizeAttachmentItem(item, index)
    )).filter(Boolean),
    [items],
  )

  const images = useMemo(
    () => (mode === 'documents' ? [] : normalized.filter((item) => item.kind === 'image')),
    [normalized, mode],
  )
  const documents = useMemo(
    () => (mode === 'images'
      ? []
      : normalized.filter((item) => mode === 'documents' || item.kind !== 'image')),
    [normalized, mode],
  )

  const showImages = mode === 'both' || mode === 'images'
  const showDocuments = mode === 'both' || mode === 'documents'

  const defaultView = async (item) => {
    if (onView) {
      await onView(item)
      return
    }
    const src = item.previewSrc || item.openUrl
    if (!src) return
    if (item.kind === 'image') {
      setLightbox({ src, alt: item.name, filename: item.name })
      return
    }
    window.open(src, '_blank', 'noopener,noreferrer')
  }

  const defaultDownload = async (item) => {
    if (onDownload) {
      await onDownload(item)
      return
    }
    const src = item.openUrl || item.previewSrc
    if (!src) return
    await downloadFromUrl(src, item.name)
  }

  const handlePick = (files, bucket) => {
    if (!files?.length || disabled || readOnly) return
    onPickFiles?.(files, bucket)
  }

  const imageCountLabel = `${images.length} Image${images.length === 1 ? '' : 's'}`
  const fileCountLabel = `${documents.length} File${documents.length === 1 ? '' : 's'}`

  return (
    <div className={`ae-panel${compact ? ' ae-panel--compact' : ''}${className ? ` ${className}` : ''}`}>
      {showHeader && (
        <div className="ae-panel__header">
          <div className="ae-panel__title-row">
            <span className="ae-panel__title-icon" aria-hidden="true">
              <PaperclipIcon />
            </span>
            <h3 className="ae-panel__title">{title}</h3>
            {badge ? (
              <span className={`ae-panel__badge${badge === 'Required' ? ' ae-panel__badge--required' : ''}`}>
                {badge}
              </span>
            ) : null}
          </div>
          {description ? <p className="ae-panel__description">{description}</p> : null}
        </div>
      )}

      {error ? <p className="ae-panel__error" role="alert">{error}</p> : null}

      <div className={`ae-panel__grid${showImages && showDocuments ? '' : ' ae-panel__grid--single'}`}>
        {showImages && (
          <section className="ae-section" aria-label="Photos and images">
            <div className="ae-section__head">
              <h4 className="ae-section__label">
                <span className="ae-section__label-icon" aria-hidden="true"><ImageStackIcon /></span>
                Photos &amp; Images
              </h4>
              <span className="ae-section__count">{imageCountLabel}</span>
            </div>

            <div className="ae-images">
              {images.map((item) => (
                <ImageTile
                  key={item.key}
                  item={item}
                  disabled={disabled}
                  readOnly={readOnly}
                  onView={defaultView}
                  onRemove={onRemove}
                  renderExtra={renderDocumentExtra}
                />
              ))}
              {!readOnly && (
                <DropZone
                  accept={imageAccept}
                  disabled={disabled}
                  variant="tile"
                  title="Add Photos"
                  hint="Drag & drop or click to upload"
                  icon={<ImagePlusIcon size={20} />}
                  onFiles={(files) => handlePick(files, 'image')}
                />
              )}
            </div>
            <p className="ae-section__formats">{imageHint}</p>
          </section>
        )}

        {showDocuments && (
          <section className="ae-section" aria-label="Documents and files">
            <div className="ae-section__head">
              <h4 className="ae-section__label">
                <span className="ae-section__label-icon" aria-hidden="true"><FileTextIcon /></span>
                Documents &amp; Files
              </h4>
              <span className="ae-section__count">{fileCountLabel}</span>
            </div>

            {documents.length > 0 && (
              <ul className="ae-docs">
                {documents.map((item) => (
                  <DocumentRow
                    key={item.key}
                    item={item}
                    disabled={disabled}
                    readOnly={readOnly}
                    onView={defaultView}
                    onDownload={defaultDownload}
                    onRemove={onRemove}
                    renderExtra={renderDocumentExtra}
                  />
                ))}
              </ul>
            )}

            {!readOnly && (
              <DropZone
                accept={documentAccept}
                disabled={disabled}
                variant="wide"
                title="Upload Documents"
                hint={(
                  <>
                    Drag &amp; drop files here or
                    {' '}
                    <span className="ae-drop__browse">browse</span>
                  </>
                )}
                icon={<CloudUploadIcon />}
                onFiles={(files) => handlePick(files, 'document')}
              />
            )}
            <p className="ae-section__formats">{documentHint}</p>
          </section>
        )}
      </div>

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
