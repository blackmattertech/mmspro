import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../lib/supabase'
import { readRememberMe, readSavedEmail, writeRememberMe, writeSavedEmail } from '../../lib/authPreferences'
import { requestPasswordReset } from '../../lib/api'
import { assetUrl } from '../../lib/assets'
import './Login.css'

const LOGO_SRC = assetUrl('Assets/images/logo.svg')

const SLOGAN_ICON = (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
    <path d="M14.5 3.5L16.5 5.5M3.5 16.5L5.5 14.5M11.5 2.5L8.5 5.5M5.5 8.5L2.5 11.5M14 6L6 14M6.5 3.5C6.5 4.88 5.38 6 4 6C2.62 6 1.5 4.88 1.5 3.5C1.5 2.12 2.62 1 4 1C5.38 1 6.5 2.12 6.5 3.5ZM16.5 13.5C16.5 14.88 15.38 16 14 16C12.62 16 11.5 14.88 11.5 13.5C11.5 12.12 12.62 11 14 11C15.38 11 16.5 12.12 16.5 13.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
)

const FEATURES = [
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <path d="M14.5 3.5L16.5 5.5M3.5 16.5L5.5 14.5M11.5 2.5L8.5 5.5M5.5 8.5L2.5 11.5M14 6L6 14M6.5 3.5C6.5 4.88 5.38 6 4 6C2.62 6 1.5 4.88 1.5 3.5C1.5 2.12 2.62 1 4 1C5.38 1 6.5 2.12 6.5 3.5ZM16.5 13.5C16.5 14.88 15.38 16 14 16C12.62 16 11.5 14.88 11.5 13.5C11.5 12.12 12.62 11 14 11C15.38 11 16.5 12.12 16.5 13.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
    title: 'Equipment Maintenance',
    description: 'Stay on top of every inspection and service.',
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <rect x="2" y="6" width="16" height="10" rx="1" stroke="currentColor" strokeWidth="1.5"/>
        <path d="M2 9H18M6 6V4C6 3.45 6.45 3 7 3H13C13.55 3 14 3.45 14 4V6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        <path d="M5 12H7M9 12H11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    ),
    title: 'Asset Tracking',
    description: 'Real-time visibility across all assets and locations.',
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <path d="M10 2L3 5.5V9.5C3 13.36 6.13 16.93 10 18C13.87 16.93 17 13.36 17 9.5V5.5L10 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
        <path d="M7.5 10L9.25 11.75L12.5 8.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
    title: 'Operational Excellence',
    description: 'Reduce downtime and improve performance.',
  },
]

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

export default function Login() {
  const [email, setEmail] = useState(() => readSavedEmail())
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(() => readRememberMe())
  const [formMode, setFormMode] = useState('signin')
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [loading, setLoading] = useState(false)
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    if (location.state?.error) {
      setError(location.state.error)
      navigate(location.pathname, { replace: true, state: {} })
    }
    if (location.state?.success) {
      setSuccess(location.state.success)
      navigate(location.pathname, { replace: true, state: {} })
    }
  }, [location, navigate])

  const isForgot = formMode === 'forgot'

  const openForgotMode = (e) => {
    e.preventDefault()
    setFormMode('forgot')
    setError(null)
    setSuccess(null)
  }

  const backToSignIn = () => {
    setFormMode('signin')
    setError(null)
    setSuccess(null)
  }

  const getPostAuthPath = async (userId) => {
    if (!supabase) {
      throw new Error('Authentication is not configured.')
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role, org_id, organizations(slug, is_active)')
      .eq('id', userId)
      .maybeSingle()

    if (profileError) {
      throw new Error(profileError.message || 'Could not load your account profile. Please try again.')
    }

    if (profile?.role === 'super_admin') {
      return '/admin/dashboard'
    }

    if (profile?.organizations?.slug) {
      if (profile.organizations.is_active === false) {
        throw new Error('Your organization has been disabled. Contact support.')
      }
      return `/${profile.organizations.slug}/dashboard`
    }

    throw new Error('No organization is linked to your account. Contact your administrator.')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    setLoading(true)

    if (isForgot) {
      try {
        const { message } = await requestPasswordReset(email)
        setSuccess(message || 'If an account exists for that email, a password reset link has been sent.')
      } catch (err) {
        setError(err.message)
      }
      setLoading(false)
      return
    }

    const { data, error: signInError } = await signIn(email, password, { rememberMe })
    if (signInError) {
      setLoading(false)
      return setError(signInError.message)
    }

    const path = await getPostAuthPath(data.user.id).catch((err) => {
      setLoading(false)
      setError(err.message)
      return null
    })
    if (!path) return
    setLoading(false)
    navigate(path, { replace: true })
  }
  return (
    <div className="login-page">
      <section className="login-hero">
        <div className="login-hero__content">
          <div className="login-hero__top">
            <img
              src={LOGO_SRC}
              alt="MMS PRO"
              className="login-hero__logo"
            />

            <div className="login-hero__headlines">
              <h1 className="login-hero__title">
                Smart Maintenance.
                <span className="login-hero__title-accent">Smoother Operations.</span>
              </h1>

              <div className="slogan-card">
                <div className="slogan-card__icon">{SLOGAN_ICON}</div>
                <p className="slogan-card__text">
                  Track, manage and maintain your equipment effortlessly with{' '}
                  <span className="text-primary">MMS PRO</span>.
                </p>
              </div>

              <p className="login-hero__subtitle login-hero__subtitle--mobile">
                Track, manage and maintain your equipment effortlessly.
              </p>
            </div>
          </div>

          <div className="login-hero__bottom">
            <div className="login-hero__features">
              {FEATURES.map((feature) => (
                <div key={feature.title} className="feature-card">
                  <div className="feature-card__icon">{feature.icon}</div>
                  <div className="feature-card__text">
                    <h3 className="feature-card__title">{feature.title}</h3>
                    <p className="feature-card__description">{feature.description}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="login-hero__indicators" aria-hidden="true">
              <span className="indicator indicator--active" />
              <span className="indicator" />
              <span className="indicator" />
            </div>
          </div>
        </div>
      </section>

      <section className="login-panel">
        <div className="login-card">
          <img
            src={LOGO_SRC}
            alt="MMS PRO"
            className="login-card__logo"
          />

          <div className="login-card__header">
            <h2 className="login-card__title">
              {isForgot ? 'Forgot Password?' : 'Welcome Back!'}
            </h2>
            <p className="login-card__subtitle">
              {isForgot ? (
                <>Enter your username and we&apos;ll send you a reset link.</>
              ) : (
                <>Sign in to continue to <span className="text-primary">MMS PRO</span></>
              )}
            </p>
          </div>

          <form className="login-form" onSubmit={handleSubmit}>
            {error && <p className="login-form__error" role="alert">{error}</p>}
            {success && <p className="login-form__success" role="status">{success}</p>}

            <div className="form-field">
              <label htmlFor="username" className="form-field__label">Username</label>
              <div className="form-field__input-wrap">
                <span className="form-field__icon" aria-hidden="true">
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                    <circle cx="9" cy="5.25" r="3" stroke="currentColor" strokeWidth="1.5"/>
                    <path d="M3 15.75C3 12.85 5.69 10.5 9 10.5C12.31 10.5 15 12.85 15 15.75" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                </span>
                <input
                  id="username"
                  type="email"
                  className="form-field__input"
                  placeholder="Enter your username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="username"
                />
              </div>
            </div>

            {!isForgot && (
              <div className="form-field">
                <label htmlFor="password" className="form-field__label">Password</label>
                <div className="form-field__input-wrap">
                  <span className="form-field__icon" aria-hidden="true">
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                      <rect x="3.75" y="8.25" width="10.5" height="7.5" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
                      <path d="M6 8.25V6C6 4.34 7.34 3 9 3C10.66 3 12 4.34 12 6V8.25" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                      <circle cx="9" cy="12" r="1" fill="currentColor"/>
                    </svg>
                  </span>
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    className="form-field__input form-field__input--password"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
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
            )}

            {formMode === 'signin' && (
              <div className="login-form__options">
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => {
                      const checked = e.target.checked
                      setRememberMe(checked)
                      writeRememberMe(checked)
                      if (!checked) writeSavedEmail(email, false)
                    }}
                    className="checkbox__input"
                  />
                  <span className="checkbox__box" aria-hidden="true">
                    <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                      <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </span>
                  <span className="checkbox__label">Remember me</span>
                </label>
                <a href="#" className="login-form__forgot" onClick={openForgotMode}>
                  Forgot Password?
                </a>
              </div>
            )}

            <button type="submit" className="login-form__submit" disabled={loading}>
              {loading
                ? (isForgot ? 'Sending Reset Link...' : 'Signing In...')
                : (isForgot ? 'Send Reset Link' : 'Sign In')}
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                <path d="M3.75 9H14.25M14.25 9L10.5 5.25M14.25 9L10.5 12.75" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </form>

          <p className="login-card__footer">
            {isForgot ? (
              <>
                Remember your password?{' '}
                <button type="button" className="login-card__link text-primary" onClick={backToSignIn}>
                  Back to Sign In
                </button>
              </>
            ) : (
              <>Need an account? Contact your administrator.</>
            )}
          </p>
        </div>
      </section>
    </div>
  )
}
