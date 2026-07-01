import { useState, useEffect, useRef } from 'react'
import { uploadOrgLogo, deleteOrgLogo, getOrgAssetSignedUrl, validateLogoFile } from '../../lib/orgAssets'
import { updateCompanyDetails } from '../../lib/api'
import './CompanyShared.css'

export default function LogoUpload({ orgId, logoPath, canManage, onLogoChange }) {
  const inputRef = useRef(null)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false

    async function loadPreview() {
      if (!logoPath) {
        setPreviewUrl(null)
        return
      }
      try {
        const url = await getOrgAssetSignedUrl(logoPath)
        if (!cancelled) setPreviewUrl(url)
      } catch {
        if (!cancelled) setPreviewUrl(null)
      }
    }

    loadPreview()
    return () => { cancelled = true }
  }, [logoPath])

  const handleFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !orgId) return

    const validationError = validateLogoFile(file)
    if (validationError) {
      setError(validationError)
      return
    }

    setUploading(true)
    setError(null)

    try {
      const path = await uploadOrgLogo(orgId, file)
      await updateCompanyDetails({ logo_url: path })
      onLogoChange?.(path)
      const url = await getOrgAssetSignedUrl(path)
      setPreviewUrl(url)
    } catch (err) {
      setError(err.message)
    } finally {
      setUploading(false)
    }
  }

  const handleRemove = async () => {
    if (!logoPath || !window.confirm('Remove company logo?')) return

    setUploading(true)
    setError(null)

    try {
      await deleteOrgLogo(logoPath)
      await updateCompanyDetails({ logo_url: null })
      onLogoChange?.(null)
      setPreviewUrl(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="company-logo">
      <span className="company-form__label">Company Logo</span>
      <div className="company-logo__row">
        <div className="company-logo__preview" aria-hidden={!previewUrl}>
          {previewUrl ? (
            <img src={previewUrl} alt="Company logo" className="company-logo__img" />
          ) : (
            <span className="company-logo__placeholder">No logo</span>
          )}
        </div>

        {canManage && (
          <div className="company-logo__actions">
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="company-logo__input"
              onChange={handleFile}
              disabled={uploading}
            />
            <button
              type="button"
              className="company-btn company-btn--secondary"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? 'Uploading...' : previewUrl ? 'Replace Logo' : 'Upload Logo'}
            </button>
            {previewUrl && (
              <button
                type="button"
                className="company-link company-link--danger"
                onClick={handleRemove}
                disabled={uploading}
              >
                Remove
              </button>
            )}
            <p className="company-logo__hint">JPEG, PNG, WebP or GIF. Max 5 MB.</p>
          </div>
        )}
      </div>
      {error && <p className="company-alert" style={{ marginTop: 12 }}>{error}</p>}
    </div>
  )
}
