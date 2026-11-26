import { useEffect, useMemo, useState } from 'react'
import DateField from '../ui/DateField'
import FilterableSelect from '../ui/FilterableSelect'
import { getWorkOrderFileSignedUrl, validateWorkOrderFile } from '../../lib/workOrderAssets'
import {
  createLocalFileItem,
  getFilePreviewSrc,
  getWorkOrderFiles,
  revokeWorkOrderFilePreviews,
  workOrderFilesValue,
} from '../../lib/workOrderFileValues'
import { downloadFromUrl } from '../../lib/fileDownload'
import AttachmentsEvidence, {
  DEFAULT_DOCUMENT_HINT,
  DEFAULT_IMAGE_HINT,
  normalizeAttachmentItem,
} from '../shared/AttachmentsEvidence'
import SpellcheckInput from '../shared/SpellcheckInput'
import FormLabel from '../shared/FormLabel'
import { useTextFieldLimits } from '../../hooks/useTextFieldLimits'
import { fieldHelpFor } from '../../lib/fieldHelpText'
import { formFieldClassName, normalizeColSpan } from '../../lib/formLayoutIds'
import { isRichTextFormField } from '../../lib/textFieldLimits'

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

const FILE_ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx,image/*,.jpg,.jpeg,.png,.gif,.webp,.bmp,.svg,.avif,.ico,.heic,.heif'
const IMAGE_ACCEPT = 'image/*,.svg,.jpg,.jpeg,.png,.gif,.webp,.bmp,.avif,.ico,.heic,.heif'

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

function CatalogAttachmentsField({ field, value, onChange, disabled, mode, invalid = false }) {
  const files = getWorkOrderFiles(value)
  const signedUrls = useSignedPreviewMap(files)
  const [fieldError, setFieldError] = useState(null)
  const fieldType = mode === 'images' ? 'image' : 'file'

  useEffect(() => () => revokeWorkOrderFilePreviews(value), [value])

  const items = useMemo(() => (
    files.map((item, index) => {
      const normalized = normalizeAttachmentItem(item, index, signedUrls)
      if (!normalized) return null
      const preview = previewSrcFor(item, signedUrls)
      return {
        ...normalized,
        previewSrc: normalized.kind === 'image' ? preview : null,
        openUrl: preview || normalized.openUrl,
        index,
        raw: item,
      }
    }).filter(Boolean)
  ), [files, signedUrls])

  const handlePickFiles = (selected) => {
    if (!selected.length) return
    const next = [...files]
    for (const file of selected) {
      const validationError = validateWorkOrderFile(file, fieldType)
      if (validationError) {
        setFieldError(validationError)
        return
      }
      next.push(createLocalFileItem(file, fieldType))
    }
    setFieldError(null)
    onChange(workOrderFilesValue(next))
  }

  const removeItem = (item) => {
    const target = files[item.index]
    if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl)
    const next = files.filter((_, i) => i !== item.index)
    setFieldError(null)
    onChange(workOrderFilesValue(next))
  }

  return (
    <div
      className={wrapClass(field, ['wo-field-upload', invalid ? 'company-form__field--invalid' : ''].filter(Boolean).join(' '))}
      data-field-id={field.id}
    >
      <AttachmentsEvidence
        title={field.is_required ? `${field.name} *` : field.name}
        description={null}
        badge={field.is_required ? 'Required' : 'Optional'}
        mode={mode}
        items={items}
        disabled={disabled}
        error={fieldError}
        imageAccept={IMAGE_ACCEPT}
        documentAccept={FILE_ACCEPT}
        imageHint={DEFAULT_IMAGE_HINT}
        documentHint={DEFAULT_DOCUMENT_HINT}
        onPickFiles={handlePickFiles}
        onRemove={removeItem}
        onDownload={async (item) => {
          let src = item.openUrl || item.previewSrc || getFilePreviewSrc(item.raw)
          if (!src && item.raw?.path) {
            try {
              src = await getWorkOrderFileSignedUrl(item.raw.path)
            } catch {
              src = null
            }
          }
          if (src) await downloadFromUrl(src, item.name)
        }}
      />
    </div>
  )
}

export default function WorkOrderFieldInput({ field, value, onChange, disabled, invalid = false }) {
  const id = `wo-field-${field.id}`
  const label = field.is_required ? `${field.name} *` : field.name
  const type = field.field_type
  const optionValues = field.dropdown_options || []
  const { maxLengthForField } = useTextFieldLimits()
  const limit = maxLengthForField(field)
  const help = fieldHelpFor(field)
  const withInvalid = (extra = '') => (
    wrapClass(field, [extra, invalid ? 'company-form__field--invalid' : ''].filter(Boolean).join(' '))
  )

  if (type === 'textarea' || isRichTextFormField(field, type)) {
    return (
      <div className={withInvalid('company-form__field--full')} data-field-id={field.id}>
        <FormLabel htmlFor={id} fieldType="textarea" limit={limit}>{label}</FormLabel>
        <SpellcheckInput
          richText
          multiline
          id={id}
          className="company-form__input company-form__textarea"
          rows={4}
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          maxLength={limit}
          placeholder={help?.placeholder}
        />
        {help?.hint ? <p className="company-form__hint">{help.hint}</p> : null}
      </div>
    )
  }

  if (type === 'dropdown' || (isPermitRequiredField(field) && optionValues.length)) {
    const selected = singleOptionValue(value)
    return (
      <div className={withInvalid()} data-field-id={field.id}>
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
      <div className={withInvalid()} data-field-id={field.id}>
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
        <div className={withInvalid()} data-field-id={field.id}>
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
      <div className={withInvalid('wo-field-checkbox')} data-field-id={field.id}>
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
      <div className={withInvalid()} data-field-id={field.id}>
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
      <div className={withInvalid()} data-field-id={field.id}>
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
    const hint = String(field.hint || help?.hint || '').trim()
    return (
      <div className={withInvalid()} data-field-id={field.id}>
        <label className="company-form__label" htmlFor={id}>{label}</label>
        <input
          id={id}
          type="number"
          className="company-form__input"
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          min={0}
          step="any"
        />
        {hint ? <p className="company-form__hint">{hint}</p> : null}
      </div>
    )
  }

  if (type === 'file' || type === 'image') {
    return (
      <CatalogAttachmentsField
        field={field}
        value={value}
        onChange={onChange}
        disabled={disabled}
        invalid={invalid}
        mode={type === 'image' ? 'images' : 'documents'}
      />
    )
  }

  return (
    <div className={withInvalid()} data-field-id={field.id}>
      <FormLabel htmlFor={id} fieldType="text" limit={limit || undefined}>{label}</FormLabel>
      <SpellcheckInput
        id={id}
        className="company-form__input"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        maxLength={limit}
        placeholder={help?.placeholder}
      />
      {help?.hint ? <p className="company-form__hint">{help.hint}</p> : null}
    </div>
  )
}
