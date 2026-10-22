import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import DateField from '../ui/DateField'
import FilterableSelect from '../ui/FilterableSelect'
import { fieldTypeLabel } from '../../lib/assetFieldTypes'
import { getWorkOrderFileSignedUrl, validateWorkOrderFile } from '../../lib/workOrderAssets'
import {
  createLocalFileItem,
  getFilePreviewSrc,
  getWorkOrderFiles,
  isImageFileItem,
  revokeWorkOrderFilePreviews,
  workOrderFilesValue,
} from '../../lib/workOrderFileValues'
import { assetUrl } from '../../lib/assets'
import ImageLightbox from '../shared/ImageLightbox'
import SpellcheckInput from '../shared/SpellcheckInput'
import FormLabel from '../shared/FormLabel'
import { useTextFieldLimits } from '../../hooks/useTextFieldLimits'
import { formFieldClassName, normalizeColSpan } from '../../lib/formLayoutIds'

function useSignedPreviewMap(files) {
  const [urls, setUrls] = useState({})
  const pathKey = (files || []).map((file) => file?.path).filter(Boolean).join('|')

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
        } catch {
          // signed URL is optional; the chip still shows the file name
        }
      }))
      if (!cancelled) setUrls(next)
    })()
    return () => { cancelled = true }
  }, [pathKey])

  return urls
}

function previewSrcFor(item, signedUrls = {}) {
  return getFilePreviewSrc(item) || (item?.path ? signedUrls[item.path] : null) || null
}

function wrapClass(field, extra = '') {
  const width = field?.colSpan == null ? null : normalizeColSpan(field.colSpan, 25)
  const extras = width != null && width < 100
    ? String(extra).replace(/company-form__field--full/g, '').trim()
    : extra
  return formFieldClassName(field, extras)
}

const FILE_ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.svg'
const IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,image/svg+xml,.svg'
const IMAGE_TILE_SIZE = 96
const FILE_ICON_SRC = assetUrl('Assets/icons/file-outline.svg')
const VIEW_MORE_BTN_WIDTH = 104
const FILE_CHIP_GAP = 8

function isPermitRequiredField(field) {
  return /permit\s*required/i.test(String(field?.name || '').trim())
}

function singleOptionValue(value) {
  if (Array.isArray(value)) {
    const first = value.find((item) => String(item ?? '').trim())
    return first == null ? '' : String(first)
  }
  if (value == null || typeof value === 'boolean') return ''
  return String(value)
}

function ImageFieldPreview({ field, value, onChange, disabled }) {
  const inputRef = useRef(null)
  const id = `wo-field-${field.id}`
  const files = getWorkOrderFiles(value)
  const signedUrls = useSignedPreviewMap(files)
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
    const src = previewSrcFor(item, signedUrls)
    if (!src) return
    setLightbox({ key: item.id || item.path, src, alt: item.name || field.name })
  }

  return (
    <div
      className={wrapClass(field, 'wo-field-upload wo-field-upload--image')}
      style={{ '--wo-image-tile-size': `${IMAGE_TILE_SIZE}px` }}
    >
      <label className="company-form__label" htmlFor={id}>
        {field.is_required ? `${field.name} *` : field.name}
        <span className="wo-field-type-hint"> ({fieldTypeLabel('image')})</span>
      </label>

      <div className="wo-field-upload__tiles">
        {files.map((item) => {
          const itemKey = item.id || item.path
          const previewSrc = previewSrcFor(item, signedUrls)
          return (
            <div key={itemKey} className="wo-field-upload__tile-wrap">
              <div className="wo-field-upload__tile wo-field-upload__tile--preview">
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
              {item.name && (
                <span className="wo-field-upload__tile-name" title={item.name}>{item.name}</span>
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
                Add Image
              </span>
            </div>
          </div>
        )}
      </div>

      <p className="wo-field-upload__hint wo-field-upload__hint--below">
        JPEG, PNG, WebP, GIF, SVG · max 10 MB each · click image to view full size
      </p>

      {fieldError && <span className="wo-field-upload__error">{fieldError}</span>}

      {lightbox && (
        <ImageLightbox
          src={lightbox.src}
          alt={lightbox.alt}
          filename={lightbox.alt}
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
  const signedUrls = useSignedPreviewMap(files)
  const [fieldError, setFieldError] = useState(null)
  const [lightbox, setLightbox] = useState(null)
  const [expanded, setExpanded] = useState(false)
  const [collapsedVisible, setCollapsedVisible] = useState(files.length)
  const rowRef = useRef(null)
  const measureRef = useRef(null)

  useEffect(() => () => revokeWorkOrderFilePreviews(value), [value])

  useLayoutEffect(() => {
    if (!files.length) {
      setCollapsedVisible(0)
      return undefined
    }

    const measure = () => {
      const row = rowRef.current
      const measureRow = measureRef.current
      if (!row || !measureRow) return

      const chips = [...measureRow.querySelectorAll('[data-file-chip]')]
      if (!chips.length) {
        setCollapsedVisible(0)
        return
      }

      const available = row.clientWidth
      let used = 0
      let fit = 0
      for (let i = 0; i < chips.length; i += 1) {
        const chipWidth = chips[i].offsetWidth
        const remaining = chips.length - (i + 1)
        const needMore = remaining > 0
        const budget = needMore
          ? available - VIEW_MORE_BTN_WIDTH - FILE_CHIP_GAP
          : available
        const nextUsed = used + (fit > 0 ? FILE_CHIP_GAP : 0) + chipWidth
        if (nextUsed <= budget + 1) {
          used = nextUsed
          fit = i + 1
        } else {
          break
        }
      }

      setCollapsedVisible(fit > 0 ? fit : 1)
    }

    measure()
    const observer = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(measure)
      : null
    if (observer && rowRef.current) observer.observe(rowRef.current)
    window.addEventListener('resize', measure)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [files, expanded])

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
    setExpanded(false)
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

  const openPreview = (item) => {
    const src = previewSrcFor(item, signedUrls)
    if (!src) return
    setLightbox({ key: item.id || item.path, src, alt: item.name || field.name })
  }

  const hiddenCount = expanded ? 0 : Math.max(0, files.length - collapsedVisible)
  const shownFiles = expanded ? files : files.slice(0, collapsedVisible)

  return (
    <div className={wrapClass(field, 'wo-field-upload')}>
      <label className="company-form__label" htmlFor={id}>
        {field.is_required ? `${field.name} *` : field.name}
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
            {type === 'image' ? 'JPEG, PNG, WebP, GIF, SVG' : 'PDF, DOC, DOCX, XLS, XLSX, JPG, PNG, SVG'} · max 10 MB each · multiple allowed
          </span>
        </div>
      </div>

      {fieldError && <span className="wo-field-upload__error">{fieldError}</span>}

      {files.length > 0 && (
        <div className="wo-field-upload__row-wrap">
          {/* Off-screen measure row keeps natural chip widths for overflow calc */}
          <div className="wo-field-upload__row wo-field-upload__row--measure" ref={measureRef} aria-hidden="true">
            {files.map((item) => (
              <FileChip
                key={`measure-${item.id || item.path}`}
                item={item}
                previewSrc={previewSrcFor(item, signedUrls)}
                disabled
                measuring
              />
            ))}
          </div>

          <div
            ref={rowRef}
            className={`wo-field-upload__row${expanded ? ' wo-field-upload__row--expanded' : ''}`}
          >
            {shownFiles.map((item) => (
              <FileChip
                key={item.id || item.path}
                item={item}
                previewSrc={previewSrcFor(item, signedUrls)}
                disabled={disabled}
                onRemove={() => removeFile(item.id || item.path)}
                onPreview={() => openPreview(item)}
              />
            ))}

            {hiddenCount > 0 && (
              <button
                type="button"
                className="wo-field-upload__view-more"
                onClick={() => setExpanded(true)}
              >
                View more ({hiddenCount})
              </button>
            )}

            {expanded && files.length > collapsedVisible && (
              <button
                type="button"
                className="wo-field-upload__view-more"
                onClick={() => setExpanded(false)}
              >
                View less
              </button>
            )}
          </div>
        </div>
      )}

      {lightbox && (
        <ImageLightbox
          src={lightbox.src}
          alt={lightbox.alt}
          filename={lightbox.alt}
          onClose={() => setLightbox(null)}
        />
      )}
    </div>
  )
}

function FileChip({ item, previewSrc: previewSrcProp, disabled, onRemove, onPreview, measuring = false }) {
  const previewSrc = previewSrcProp || getFilePreviewSrc(item)
  const isImage = Boolean(previewSrc) || isImageFileItem(item)

  return (
    <div
      className={`wo-field-upload__chip${isImage ? ' wo-field-upload__chip--image' : ''}`}
      data-file-chip=""
      title={item.name}
    >
      {isImage && previewSrc ? (
        <button
          type="button"
          className="wo-field-upload__chip-preview"
          onClick={onPreview}
          disabled={measuring || !onPreview}
          aria-label={`View ${item.name}`}
        >
          <img src={previewSrc} alt="" />
        </button>
      ) : (
        <div className="wo-field-upload__chip-file">
          <img src={FILE_ICON_SRC} alt="" className="wo-field-upload__chip-icon" />
          <span className="wo-field-upload__chip-name">{item.name}</span>
        </div>
      )}

      {!disabled && !measuring && (
        <button
          type="button"
          className="wo-field-upload__chip-remove"
          onClick={onRemove}
          aria-label={`Remove ${item.name}`}
        >
          ×
        </button>
      )}
    </div>
  )
}

export default function WorkOrderFieldInput({ field, value, onChange, disabled }) {
  const id = `wo-field-${field.id}`
  const label = field.is_required ? `${field.name} *` : field.name
  const type = field.field_type
  const optionValues = field.dropdown_options || []
  const { maxLengthForField } = useTextFieldLimits()
  const limit = maxLengthForField(field)

  if (type === 'textarea') {
    return (
      <div className={wrapClass(field, 'company-form__field--full')}>
        <FormLabel htmlFor={id} limit={limit}>{label}</FormLabel>
        <SpellcheckInput
          multiline
          id={id}
          className="company-form__input company-form__textarea"
          rows={4}
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          maxLength={limit}
        />
      </div>
    )
  }

  if (type === 'dropdown' || (isPermitRequiredField(field) && optionValues.length)) {
    const selected = singleOptionValue(value)
    return (
      <div className={wrapClass(field)}>
        <label className="company-form__label" htmlFor={id}>{label}</label>
        <FilterableSelect
          id={id}
          value={selected}
          onChange={(next) => {
            if (type === 'checkbox') onChange(next ? [next] : [])
            else onChange(next)
          }}
          options={optionValues}
          placeholder={`Select ${field.name}`}
          disabled={disabled}
          className="company-form__input--select"
        />
      </div>
    )
  }

  if (type === 'radio') {
    return (
      <div className={wrapClass(field)}>
        <span className="company-form__label">{label}</span>
        <div className="asset-field-dependency__options" role="radiogroup" aria-label={field.name}>
          {optionValues.map((opt) => (
            <label key={opt} className="asset-field-dependency__option">
              <input
                type="radio"
                name={id}
                value={opt}
                checked={value === opt}
                onChange={() => onChange(opt)}
                disabled={disabled}
              />
              <span>{opt}</span>
            </label>
          ))}
          {!optionValues.length && (
            <p className="company-employee-photo__login-hint">No options configured yet.</p>
          )}
        </div>
      </div>
    )
  }

  if (type === 'checkbox') {
    if (optionValues.length) {
      const selected = Array.isArray(value) ? value : []
      const toggleOption = (option) => {
        const next = selected.includes(option)
          ? selected.filter((item) => item !== option)
          : [...selected, option]
        onChange(next)
      }

      return (
        <div className={wrapClass(field)}>
          <span className="company-form__label">{label}</span>
          <div className="asset-field-dependency__options" role="group" aria-label={field.name}>
            {optionValues.map((opt) => (
              <label key={opt} className="asset-field-dependency__option">
                <input
                  type="checkbox"
                  checked={selected.includes(opt)}
                  onChange={() => toggleOption(opt)}
                  disabled={disabled}
                />
                <span>{opt}</span>
              </label>
            ))}
          </div>
        </div>
      )
    }

    return (
      <div className={wrapClass(field, 'wo-field-checkbox')}>
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
      <div className={wrapClass(field)}>
        <label className="company-form__label" htmlFor={id}>{label}</label>
        <DateField
          id={id}
          value={value || ''}
          onChange={onChange}
          disabled={disabled}
        />
      </div>
    )
  }

  if (type === 'datetime') {
    return (
      <div className={wrapClass(field)}>
        <label className="company-form__label" htmlFor={id}>{label}</label>
        <DateField
          id={id}
          value={value || ''}
          onChange={onChange}
          disabled={disabled}
          withTime
        />
      </div>
    )
  }

  if (type === 'number') {
    return (
      <div className={wrapClass(field)}>
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
    <div className={wrapClass(field)}>
      <FormLabel htmlFor={id} limit={limit}>{label}</FormLabel>
      <SpellcheckInput
        id={id}
        className="company-form__input"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        maxLength={limit}
      />
    </div>
  )
}
