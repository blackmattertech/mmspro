import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { useBackdropClose } from '../../hooks/useBackdropClose'
import { profileDisplayName } from '../../hooks/useProfile'
import PhoneInput from '../shared/PhoneInput'
import ImageCropModal from '../shared/ImageCropModal'
import {
  uploadUserAvatar,
  deleteUserAvatar,
  validateAvatarFile,
} from '../../lib/userAssets'
import { validatePhoneE164 } from '../../lib/validation'
import '../company/CompanyShared.css'
import './ProfileModal.css'

const TABS = [
  { id: 'profile', label: 'Profile' },
  { id: 'password', label: 'Password' },
]

export default function ProfileModal({ profile, avatarUrl, onClose, onUpdated }) {
  const { user, signIn } = useAuth()
  const [tab, setTab] = useState('profile')
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [photoFile, setPhotoFile] = useState(null)
  const [photoPreview, setPhotoPreview] = useState(null)
  const [cropSource, setCropSource] = useState(null)
  const [removePhoto, setRemovePhoto] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [passwordError, setPasswordError] = useState(null)
  const [passwordSuccess, setPasswordSuccess] = useState(null)

  const photoInputRef = useRef(null)
  const handleBackdropClick = useBackdropClose(onClose)

  useEffect(() => {
    setFullName(profile?.full_name || '')
    setPhone(profile?.phone || '')
    setPhotoPreview(avatarUrl)
    setPhotoFile(null)
    setCropSource(null)
    setRemovePhoto(false)
  }, [profile, avatarUrl])

  useEffect(() => {
    if (!photoFile) return undefined
    const url = URL.createObjectURL(photoFile)
    setPhotoPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [photoFile])

  const handlePhotoSelect = (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    const validationError = validateAvatarFile(file)
    if (validationError) {
      setError(validationError)
      return
    }

    setError(null)
    setCropSource({
      url: URL.createObjectURL(file),
      fileName: file.name,
      mimeType: file.type,
    })
  }

  const handleCropCancel = () => {
    if (cropSource?.url) URL.revokeObjectURL(cropSource.url)
    setCropSource(null)
  }

  const handleCropComplete = (file) => {
    if (cropSource?.url) URL.revokeObjectURL(cropSource.url)
    setCropSource(null)
    setPhotoFile(file)
    setRemovePhoto(false)
  }

  const handleRemovePhoto = () => {
    setPhotoFile(null)
    setPhotoPreview(null)
    setRemovePhoto(true)
  }

  const handleProfileSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)

    const phoneError = validatePhoneE164(phone)
    if (phoneError) {
      setError(phoneError)
      return
    }

    if (!user?.id || !supabase) {
      setError('Profile is not available.')
      return
    }

    setSaving(true)

    try {
      let avatarPath = profile?.avatar_url ?? null

      if (removePhoto && avatarPath) {
        await deleteUserAvatar(avatarPath)
        avatarPath = null
      }

      if (photoFile) {
        if (avatarPath) {
          try {
            await deleteUserAvatar(avatarPath)
          } catch {
            // Old file may already be gone after extension change
          }
        }
        avatarPath = await uploadUserAvatar(user.id, photoFile)
      }

      const updates = {
        full_name: fullName.trim() || null,
        phone: phone.trim() || null,
        avatar_url: avatarPath,
      }

      const { error: updateError } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', user.id)

      if (updateError) throw new Error(updateError.message)

      setSuccess('Profile updated.')
      setPhotoFile(null)
      setRemovePhoto(false)
      await onUpdated?.()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handlePasswordSubmit = async (e) => {
    e.preventDefault()
    setPasswordError(null)
    setPasswordSuccess(null)

    if (!user?.email) {
      setPasswordError('Unable to verify your account.')
      return
    }
    if (!currentPassword) {
      setPasswordError('Enter your current password.')
      return
    }
    if (newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters.')
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match.')
      return
    }

    setPasswordSaving(true)

    const { error: verifyError } = await signIn(user.email, currentPassword)
    if (verifyError) {
      setPasswordSaving(false)
      setPasswordError('Current password is incorrect.')
      return
    }

    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword })
    setPasswordSaving(false)

    if (updateError) {
      setPasswordError(updateError.message)
      return
    }

    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
    setPasswordSuccess('Password updated successfully.')
  }

  const displayName = profileDisplayName(profile, user)
  const avatarLetter = (displayName[0] || 'U').toUpperCase()

  return (
    <div className="company-modal-overlay" onMouseDown={handleBackdropClick}>
      <div className="company-modal profile-modal" onClick={(e) => e.stopPropagation()}>
        <div className="company-modal__header">
          <h2>My Profile</h2>
          <button type="button" className="company-modal__close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="profile-modal__tabs company-tabs">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`company-tabs__btn ${tab === item.id ? 'company-tabs__btn--active' : ''}`}
              onClick={() => setTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>

        {tab === 'profile' ? (
          <form className="company-modal__form" onSubmit={handleProfileSubmit}>
            <div className="profile-modal__avatar-section">
              <div className="profile-modal__avatar-preview">
                {photoPreview ? (
                  <img src={photoPreview} alt="" className="profile-modal__avatar-img" />
                ) : (
                  <span className="profile-modal__avatar-placeholder">{avatarLetter}</span>
                )}
              </div>
              <div className="profile-modal__avatar-actions">
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="company-logo__input"
                  onChange={handlePhotoSelect}
                  disabled={saving}
                />
                <button
                  type="button"
                  className="company-btn company-btn--secondary"
                  onClick={() => photoInputRef.current?.click()}
                  disabled={saving}
                >
                  {photoPreview ? 'Change Photo' : 'Upload Photo'}
                </button>
                {(photoPreview || profile?.avatar_url) && !removePhoto && (
                  <button
                    type="button"
                    className="company-link company-link--danger"
                    onClick={handleRemovePhoto}
                    disabled={saving}
                  >
                    Remove
                  </button>
                )}
                <p className="company-logo__hint">JPEG, PNG, WebP or GIF. Max 5 MB.</p>
              </div>
            </div>

            <label className="company-form__field company-form__field--full">
              <span className="company-form__label">Full Name</span>
              <input
                type="text"
                className="company-form__input"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Your name"
                autoComplete="name"
              />
            </label>

            <label className="company-form__field company-form__field--full">
              <span className="company-form__label">Email</span>
              <input
                type="email"
                className="company-form__input"
                value={profile?.email || user?.email || ''}
                disabled
              />
              <p className="company-modal__hint">Email is managed through your login account.</p>
            </label>

            <div className="company-form__field company-form__field--full">
              <span className="company-form__label">Phone</span>
              <PhoneInput value={phone} onChange={setPhone} disabled={saving} />
            </div>

            {error && <p className="company-alert" role="alert">{error}</p>}
            {success && <p className="profile-modal__success" role="status">{success}</p>}

            <div className="company-modal__actions">
              <button type="button" className="company-btn company-btn--secondary" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="company-btn company-btn--primary" disabled={saving}>
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </form>
        ) : (
          <form className="company-modal__form" onSubmit={handlePasswordSubmit}>
            <p className="company-modal__hint">
              Enter your current password, then choose a new one with at least 8 characters.
            </p>

            <label className="company-form__field company-form__field--full">
              <span className="company-form__label">Current Password</span>
              <div className="profile-modal__password-wrap">
                <input
                  type={showCurrent ? 'text' : 'password'}
                  className="company-form__input"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className="profile-modal__password-toggle"
                  onClick={() => setShowCurrent((v) => !v)}
                  aria-label={showCurrent ? 'Hide password' : 'Show password'}
                >
                  {showCurrent ? 'Hide' : 'Show'}
                </button>
              </div>
            </label>

            <label className="company-form__field company-form__field--full">
              <span className="company-form__label">New Password</span>
              <div className="profile-modal__password-wrap">
                <input
                  type={showNew ? 'text' : 'password'}
                  className="company-form__input"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                  minLength={8}
                />
                <button
                  type="button"
                  className="profile-modal__password-toggle"
                  onClick={() => setShowNew((v) => !v)}
                  aria-label={showNew ? 'Hide password' : 'Show password'}
                >
                  {showNew ? 'Hide' : 'Show'}
                </button>
              </div>
            </label>

            <label className="company-form__field company-form__field--full">
              <span className="company-form__label">Confirm New Password</span>
              <div className="profile-modal__password-wrap">
                <input
                  type={showConfirm ? 'text' : 'password'}
                  className="company-form__input"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  minLength={8}
                />
                <button
                  type="button"
                  className="profile-modal__password-toggle"
                  onClick={() => setShowConfirm((v) => !v)}
                  aria-label={showConfirm ? 'Hide password' : 'Show password'}
                >
                  {showConfirm ? 'Hide' : 'Show'}
                </button>
              </div>
            </label>

            {passwordError && <p className="company-alert" role="alert">{passwordError}</p>}
            {passwordSuccess && <p className="profile-modal__success" role="status">{passwordSuccess}</p>}

            <div className="company-modal__actions">
              <button type="button" className="company-btn company-btn--secondary" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="company-btn company-btn--primary" disabled={passwordSaving}>
                {passwordSaving ? 'Updating…' : 'Update Password'}
              </button>
            </div>
          </form>
        )}
      </div>

      {cropSource && (
        <ImageCropModal
          nested
          imageSrc={cropSource.url}
          fileName={cropSource.fileName}
          mimeType={cropSource.mimeType}
          onCancel={handleCropCancel}
          onComplete={handleCropComplete}
        />
      )}
    </div>
  )
}
