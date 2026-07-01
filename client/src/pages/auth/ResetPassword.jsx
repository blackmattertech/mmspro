import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import './Login.css'

function EyeIcon({ open }) {
  if (open) {
    return (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
        <path d="M1.5 9C1.5 9 4 3.75 9 3.75C14 3.75 16.5 9 16.5 9C16.5 9 14 14.25 9 14.25C4 14.25 1.5 9 1.5 9Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
        <circle cx="9" cy="9" r="2.25" stroke="currentColor" strokeWidth="1.5"/>
        <path d="M2.5 2.5L15.5 15.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    )
  }
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M1.5 9C1.5 9 4 3.75 9 3.75C14 3.75 16.5 9 16.5 9C16.5 9 14 14.25 9 14.25C4 14.25 1.5 9 1.5 9Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
      <circle cx="9" cy="9" r="2.25" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  )
}

export default function ResetPassword() {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [ready, setReady] = useState(false)
  const [checking, setChecking] = useState(true)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    if (!supabase) {
      setChecking(false)
      setError('Authentication is not configured.')
      return
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setReady(true)
        setChecking(false)
      }
    })

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setReady(true)
      }
      setChecking(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)

    if (password.length < 8) {
      return setError('Password must be at least 8 characters.')
    }
    if (password !== confirmPassword) {
      return setError('Passwords do not match.')
    }

    setLoading(true)

    const { error: updateError } = await supabase.auth.updateUser({ password })
    if (updateError) {
      setLoading(false)
      return setError(updateError.message)
    }

    await supabase.auth.signOut()
    setLoading(false)
    navigate('/login', {
      replace: true,
      state: { success: 'Password updated. Please sign in with your new password.' },
    })
  }

  return (
    <div className="login-page">
      <section className="login-panel login-panel--full">
        <div className="login-card">
          <img
            src="/Assets/images/logo.svg"
            alt="MMS PRO"
            className="login-card__logo"
          />

          <div className="login-card__header">
            <h2 className="login-card__title">Set New Password</h2>
            <p className="login-card__subtitle">
              Choose a secure password for your <span className="text-primary">MMS PRO</span> account.
            </p>
          </div>

          {checking ? (
            <p className="login-card__subtitle">Verifying reset link…</p>
          ) : !ready ? (
            <>
              <p className="login-form__error" role="alert">
                {error || 'This reset link is invalid or has expired.'}
              </p>
              <p className="login-card__footer">
                <button
                  type="button"
                  className="login-card__link text-primary"
                  onClick={() => navigate('/login')}
                >
                  Back to Sign In
                </button>
              </p>
            </>
          ) : (
            <form className="login-form" onSubmit={handleSubmit}>
              {error && <p className="login-form__error" role="alert">{error}</p>}

              <div className="form-field">
                <label htmlFor="new-password" className="form-field__label">New Password</label>
                <div className="form-field__input-wrap">
                  <span className="form-field__icon" aria-hidden="true">
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                      <rect x="3.75" y="8.25" width="10.5" height="7.5" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
                      <path d="M6 8.25V6C6 4.34 7.34 3 9 3C10.66 3 12 4.34 12 6V8.25" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                      <circle cx="9" cy="12" r="1" fill="currentColor"/>
                    </svg>
                  </span>
                  <input
                    id="new-password"
                    type={showPassword ? 'text' : 'password'}
                    className="form-field__input form-field__input--password"
                    placeholder="Enter new password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={8}
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    className="form-field__toggle"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    <EyeIcon open={showPassword} />
                  </button>
                </div>
              </div>

              <div className="form-field">
                <label htmlFor="confirm-password" className="form-field__label">Confirm Password</label>
                <div className="form-field__input-wrap">
                  <span className="form-field__icon" aria-hidden="true">
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                      <rect x="3.75" y="8.25" width="10.5" height="7.5" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
                      <path d="M6 8.25V6C6 4.34 7.34 3 9 3C10.66 3 12 4.34 12 6V8.25" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                      <circle cx="9" cy="12" r="1" fill="currentColor"/>
                    </svg>
                  </span>
                  <input
                    id="confirm-password"
                    type={showConfirm ? 'text' : 'password'}
                    className="form-field__input form-field__input--password"
                    placeholder="Confirm new password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    minLength={8}
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    className="form-field__toggle"
                    onClick={() => setShowConfirm(!showConfirm)}
                    aria-label={showConfirm ? 'Hide password' : 'Show password'}
                  >
                    <EyeIcon open={showConfirm} />
                  </button>
                </div>
              </div>

              <button type="submit" className="login-form__submit" disabled={loading}>
                {loading ? 'Updating Password…' : 'Update Password'}
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                  <path d="M3.75 9H14.25M14.25 9L10.5 5.25M14.25 9L10.5 12.75" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </form>
          )}
        </div>
      </section>
    </div>
  )
}
