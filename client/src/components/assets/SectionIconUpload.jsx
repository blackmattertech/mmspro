import { useRef } from 'react'
import { validateSectionIconFile } from '../../lib/orgAssets'
import './AssetsFields.css'

export default function SectionIconUpload({
  previewUrl,
  uploading = false,
  disabled = false,
  error,
  onSelect,
  onRemove,
}) {
  const inputRef = useRef(null)

  const handleFile = (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    const validationError = validateSectionIconFile(file)
    if (validationError) {
      onSelect?.(null, validationError)
      return
    }

    onSelect?.(file, null)
  }

  return (
    <div className="asset-section-icon">
      <span className="company-form__label">Section icon</span>
      <p className="company-employee-photo__login-hint">
        PNG or SVG. Shown beside the section title on work order forms.
      </p>
      <div className="asset-section-icon__row">
        <div className="asset-section-icon__preview" aria-hidden={!previewUrl}>
          {previewUrl ? (
            <img src={previewUrl} alt="" className="asset-section-icon__img" />
          ) : (
            <span className="asset-section-icon__placeholder" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <rect x="3" y="3" width="5" height="5" rx="1" fill="currentColor" opacity="0.35" />
                <rect x="10" y="3" width="5" height="5" rx="1" fill="currentColor" opacity="0.25" />
                <rect x="3" y="10" width="5" height="5" rx="1" fill="currentColor" opacity="0.25" />
                <rect x="10" y="10" width="5" height="5" rx="1" fill="currentColor" opacity="0.15" />
              </svg>
            </span>
          )}
        </div>

        <div className="asset-section-icon__actions">
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/svg+xml,.png,.svg"
            className="company-logo__input"
            onChange={handleFile}
            disabled={disabled || uploading}
          />
          <button
            type="button"
            className="company-btn company-btn--secondary"
            onClick={() => inputRef.current?.click()}
            disabled={disabled || uploading}
          >
            {uploading ? 'Uploading…' : previewUrl ? 'Replace icon' : 'Upload icon'}
          </button>
          {previewUrl && (
            <button
              type="button"
              className="company-link company-link--danger"
              onClick={onRemove}
              disabled={disabled || uploading}
            >
              Remove
            </button>
          )}
        </div>
      </div>
      {error && <p className="company-alert asset-section-icon__error">{error}</p>}
    </div>
  )
}
