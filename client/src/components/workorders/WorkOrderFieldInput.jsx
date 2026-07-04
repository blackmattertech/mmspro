import { useEffect, useRef, useState } from 'react'
import { fieldTypeLabel } from '../../lib/assetFieldTypes'
import { validateWorkOrderFile } from '../../lib/workOrderAssets'
import {
  createLocalFileItem,
  getWorkOrderFiles,
  revokeWorkOrderFilePreviews,
  workOrderFilesValue,
} from '../../lib/workOrderFileValues'

const FILE_ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png'
const IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif'
const IMAGE_TILE_SIZE = 96

function formatFileSize(bytes) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function ImageLightbox({ src, alt, onClose }) {
  useEffect(() => {
    const handleKey = (event) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  return (
    <div
      className="wo-image-lightbox"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`View ${alt}`}
    >
      <button type="button" className="wo-image-lightbox__close" onClick={onClose} aria-label="Close">
        ×
      </button>
      <img
        src={src}
        alt={alt}
        className="wo-image-lightbox__img"
        onClick={(event) => event.stopPropagation()}
      />
    </div>
  )
}

function ImageFieldPreview({ field, value, onChange, disabled }) {
  const inputRef = useRef(null)
  const id = `wo-field-${field.id}`
  const files = getWorkOrderFiles(value)
  const [fieldError, setFieldError] = useState(null)
  const [lightbox, setLightbox] = useState(null)

  useEffect(() => () => revokeWorkOrderFilePreviews(value), [value])

  const handleFileChange = (event) => {
    const selected = [...(event.target.files || [])]
    event.target.value = ''
    if (!selected.length) return

    const next = [...files]
    for (const file of selected) {
      const validationError = validateWorkOrderFile(file, 'image')
      if (validationError) {
        setFieldError(validationError)
        return
      }
      next.push(createLocalFileItem(file, 'image'))
    }

    setFieldError(null)
    onChange(workOrderFilesValue(next))
  }

  const removeFile = (itemKey) => {
    const target = files.find((item) => (item.id || item.path) === itemKey)
    if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl)
    if (lightbox?.key === itemKey) setLightbox(null)
    const next = files.filter((item) => (item.id || item.path) !== itemKey)
    setFieldError(null)
    onChange(workOrderFilesValue(next))
  }

  const openLightbox = (item) => {
    const src = item.previewUrl || item.url
    if (!src) return
    setLightbox({ key: item.id || item.path, src, alt: item.name || field.name })
  }

  return (
    <div
      className="company-form__field wo-field-upload wo-field-upload--image"
      style={{ '--wo-image-tile-size': `${IMAGE_TILE_SIZE}px` }}
    >
      <label className="company-form__label" htmlFor={id}>
        {field.name}
        <span className="wo-field-type-hint"> ({fieldTypeLabel('image')})</span>
      </label>

      <div className="wo-field-upload__tiles">
        {files.map((item) => {
          const itemKey = item.id || item.path
          const previewSrc = item.previewUrl || item.url
          return (
            <div key={itemKey} className="wo-field-upload__tile wo-field-upload__tile--preview">
              <button
                type="button"
                className="wo-field-upload__thumb-btn"
                onClick={() => openLightbox(item)}
                disabled={!previewSrc}
                aria-label={`View ${item.name}`}
              >
                {previewSrc ? (
                  <img src={previewSrc} alt={item.name} />
                ) : (
                  <span className="wo-field-upload__thumb-fallback" aria-hidden="true">IMG</span>
                )}
              </button>
              {!disabled && (
                <button
                  type="button"
                  className="wo-field-upload__tile-remove"
                  onClick={() => removeFile(itemKey)}
                  aria-label={`Remove ${item.name}`}
                >
                  ×
                </button>
              )}
            </div>
          )
        })}

        {!disabled && (
          <div className="wo-field-upload__tile wo-field-upload__tile--add">
            <input
              ref={inputRef}
              id={id}
              type="file"
              className="wo-field-upload__input"
              accept={IMAGE_ACCEPT}
              multiple
              onChange={handleFileChange}
              disabled={disabled}
            />
            <div className="wo-field-upload__add-label">
              <span className="wo-field-upload__add-icon" aria-hidden="true">+</span>
              <span className="wo-field-upload__add-text">
                {files.length ? 'Add' : 'Upload'}
              </span>
            </div>
          </div>
        )}
      </div>

      <p className="wo-field-upload__hint wo-field-upload__hint--below">
        JPEG, PNG, WebP, GIF · max 10 MB each · click image to view full size
      </p>

      {fieldError && <span className="wo-field-upload__error">{fieldError}</span>}

      {lightbox && (
        <ImageLightbox
          src={lightbox.src}
          alt={lightbox.alt}
          onClose={() => setLightbox(null)}
        />
      )}
    </div>
  )
}

function FileFieldPreview({ field, value, onChange, disabled }) {
  const id = `wo-field-${field.id}`
  const type = field.field_type
  const accept = type === 'image' ? IMAGE_ACCEPT : FILE_ACCEPT
  const files = getWorkOrderFiles(value)
  const [fieldError, setFieldError] = useState(null)

  useEffect(() => () => revokeWorkOrderFilePreviews(value), [value])

  const handleFileChange = (e) => {
    const selected = [...(e.target.files || [])]
    e.target.value = ''
    if (!selected.length) return

    const next = [...files]
    for (const file of selected) {
      const validationError = validateWorkOrderFile(file, type)
      if (validationError) {
        setFieldError(validationError)
        return
      }
      next.push(createLocalFileItem(file, type))
    }

    setFieldError(null)
    onChange(workOrderFilesValue(next))
  }

  const removeFile = (itemKey) => {
    const target = files.find((item) => (item.id || item.path) === itemKey)
    if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl)
    const next = files.filter((item) => (item.id || item.path) !== itemKey)
    setFieldError(null)
    onChange(workOrderFilesValue(next))
  }

  return (
    <div className="company-form__field wo-field-upload">
      <label className="company-form__label" htmlFor={id}>
        {field.name}
        <span className="wo-field-type-hint"> ({fieldTypeLabel(type)})</span>
      </label>

      <div className="wo-field-upload__zone">
        <input
          id={id}
          type="file"
          className="wo-field-upload__input"
          accept={accept}
          multiple
          onChange={handleFileChange}
          disabled={disabled}
        />
        <div className="wo-field-upload__placeholder">
          <span>
            {files.length
              ? `${files.length} file${files.length === 1 ? '' : 's'} selected`
              : <>Drop files here or <strong>browse</strong></>}
          </span>
          <span className="wo-field-upload__hint">
            {type === 'image' ? 'JPEG, PNG, WebP, GIF' : 'PDF, DOC, DOCX, XLS, XLSX, JPG, PNG'} · max 10 MB each · multiple allowed
          </span>
        </div>
      </div>

      {fieldError && <span className="wo-field-upload__error">{fieldError}</span>}

      {files.length > 0 && (
        <ul className="wo-field-upload__list">
          {files.map((item) => (
            <li key={item.id || item.path} className="wo-field-upload__item">
              {item.previewUrl ? (
                <div className="wo-field-upload__preview wo-field-upload__preview--thumb">
                  <img src={item.previewUrl} alt={item.name} />
                </div>
              ) : (
                <div className="wo-field-upload__file-icon" aria-hidden="true">📄</div>
              )}
              <div className="wo-field-upload__item-meta">
                <span className="wo-field-upload__filename">{item.name}</span>
                {item.size > 0 && (
                  <span className="wo-field-file-name">{formatFileSize(item.size)}</span>
                )}
              </div>
              <button
                type="button"
                className="wo-field-upload__clear wo-field-upload__clear--inline"
                onClick={() => removeFile(item.id || item.path)}
                disabled={disabled}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function WorkOrderFieldInput({ field, value, onChange, disabled }) {
  const id = `wo-field-${field.id}`
  const label = field.name
  const type = field.field_type

  if (type === 'textarea') {
    return (
      <div className="company-form__field company-form__field--full">
        <label className="company-form__label" htmlFor={id}>{label}</label>
        <textarea
          id={id}
          className="company-form__input company-form__textarea"
          rows={4}
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
        />
      </div>
    )
  }

  if (type === 'dropdown') {
    return (
      <div className="company-form__field">
        <label className="company-form__label" htmlFor={id}>{label}</label>
        <select
          id={id}
          className="company-form__input company-form__input--select"
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
        >
          <option value="">Select {label}</option>
          {(field.dropdown_options || []).map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      </div>
    )
  }

  if (type === 'checkbox') {
    return (
      <div className="company-form__field wo-field-checkbox">
        <label className="wo-field-checkbox__label">
          <input
            id={id}
            type="checkbox"
            checked={Boolean(value)}
            onChange={(e) => onChange(e.target.checked)}
            disabled={disabled}
          />
          <span>{label}</span>
        </label>
      </div>
    )
  }

  if (type === 'date') {
    return (
      <div className="company-form__field">
        <label className="company-form__label" htmlFor={id}>{label}</label>
        <input
          id={id}
          type="date"
          className="company-form__input"
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
        />
      </div>
    )
  }

  if (type === 'datetime') {
    return (
      <div className="company-form__field">
        <label className="company-form__label" htmlFor={id}>{label}</label>
        <input
          id={id}
          type="datetime-local"
          className="company-form__input"
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
        />
      </div>
    )
  }

  if (type === 'number') {
    return (
      <div className="company-form__field">
        <label className="company-form__label" htmlFor={id}>{label}</label>
        <input
          id={id}
          type="number"
          className="company-form__input"
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
        />
      </div>
    )
  }

  if (type === 'file' || type === 'image') {
    if (type === 'image') {
      return (
        <ImageFieldPreview
          field={field}
          value={value}
          onChange={onChange}
          disabled={disabled}
        />
      )
    }
    return (
      <FileFieldPreview
        field={field}
        value={value}
        onChange={onChange}
        disabled={disabled}
      />
    )
  }

  return (
    <div className="company-form__field">
      <label className="company-form__label" htmlFor={id}>{label}</label>
      <input
        id={id}
        type="text"
        className="company-form__input"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      />
    </div>
  )
}
