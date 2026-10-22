import { useEffect, useState } from 'react'
import { getAdminIntegrations, saveAdminIntegration, testAdminIntegration } from '../../lib/api'
import './Integrations.css'

const EMPTY = {
  email: { enabled: false, fromEmail: '', fromName: 'MMS PRO', apiKey: '', secretKey: '' },
  firebase: {
    enabled: false,
    apiKey: '',
    authDomain: '',
    projectId: '',
    storageBucket: '',
    messagingSenderId: '',
    appId: '',
    measurementId: '',
    vapidKey: '',
    serviceAccountJson: '',
  },
  cashfree: { enabled: false, environment: 'sandbox', appId: '', secretKey: '' },
}

function maskDisplay(hint) {
  if (!hint) return ''
  const tail = String(hint).replace(/^•+/, '')
  return `${'•'.repeat(18)}${tail}`
}

function configuredEmail(status) {
  return Boolean(status?.apiKeySet && status?.secretKeySet && status?.fromEmail)
}

function configuredFirebase(status) {
  return Boolean(status?.apiKey && status?.projectId && status?.appId && status?.serviceAccountSet)
}

function configuredCashfree(status) {
  return Boolean(status?.appId && status?.secretKeySet)
}

function Icon({ name }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: '1.8', strokeLinecap: 'round', strokeLinejoin: 'round' }
  if (name === 'mail') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" {...common}>
        <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
        <path d="m4 7 8 6 8-6" />
      </svg>
    )
  }
  if (name === 'flame') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" {...common}>
        <path d="M12 3s5 4 5 8a5 5 0 0 1-10 0c0-1.5.8-2.8 1.4-3.6C9 9 10 10 10 11a2 2 0 0 0 4 0c0-3-2-5-2-8Z" />
      </svg>
    )
  }
  if (name === 'card') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" {...common}>
        <rect x="3" y="6" width="18" height="12" rx="2" />
        <path d="M3 10h18" />
      </svg>
    )
  }
  if (name === 'external') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" {...common}>
        <path d="M14 5h5v5" />
        <path d="M19 5 10 14" />
        <path d="M17 13.5V18a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h4.5" />
      </svg>
    )
  }
  if (name === 'book') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" {...common}>
        <path d="M5 5.5A2.5 2.5 0 0 1 7.5 3H19v16H7.5A2.5 2.5 0 0 0 5 21.5Z" />
        <path d="M5 5.5A2.5 2.5 0 0 1 7.5 8H19" />
      </svg>
    )
  }
  if (name === 'eye') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" {...common}>
        <path d="M2.5 12S6 6.5 12 6.5 21.5 12 21.5 12 18 17.5 12 17.5 2.5 12 2.5 12Z" />
        <circle cx="12" cy="12" r="2.5" />
      </svg>
    )
  }
  if (name === 'send') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" {...common}>
        <path d="m4 12 16-8-6 16-2.5-6.5L4 12Z" />
      </svg>
    )
  }
  if (name === 'save') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" {...common}>
        <path d="M5 4h11l3 3v13H5V4Z" />
        <path d="M8 4v5h7M8 20v-6h8v6" />
      </svg>
    )
  }
  if (name === 'wifi') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" {...common}>
        <path d="M5 12.5a9 9 0 0 1 14 0" />
        <path d="M8 15.5a5 5 0 0 1 8 0" />
        <path d="M12 19h.01" />
      </svg>
    )
  }
  if (name === 'unlink') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" {...common}>
        <path d="M9 15 15 9" />
        <path d="M8 12.5 6.5 14a3.5 3.5 0 0 0 5 5L13 17.5" />
        <path d="m16 11.5 1.5-1.5a3.5 3.5 0 0 0-5-5L11 6.5" />
      </svg>
    )
  }
  return null
}

function SidePanel({ tone, icon, title, configured, description, guideHref, links }) {
  return (
    <aside className={`int-side int-side--${tone}`}>
      <div className="int-side__title">
        <span className={`int-side__icon int-side__icon--${tone}`}><Icon name={icon} /></span>
        <div>
          <h2>{title}</h2>
          {configured && <span className="int-badge">Configured</span>}
        </div>
      </div>
      <p>{description}</p>
      <a className="int-guide" href={guideHref} target="_blank" rel="noreferrer">
        View Setup Guide <Icon name="external" />
      </a>
      <div className="int-links">
        <span>Useful Links</span>
        {links.map((link) => (
          <a key={link.href} href={link.href} target="_blank" rel="noreferrer">
            {link.label}
            <Icon name="external" />
          </a>
        ))}
      </div>
    </aside>
  )
}

function Toggle({ checked, onChange, label = 'Enabled' }) {
  return (
    <label className="int-toggle">
      <span>{label}</span>
      <button
        type="button"
        className={`int-switch${checked ? ' is-on' : ''}`}
        aria-pressed={checked}
        onClick={() => onChange(!checked)}
      >
        <span />
      </button>
    </label>
  )
}

function SecretField({ label, required, value, onChange, placeholder }) {
  const [shown, setShown] = useState(false)
  const masked = String(value || '').startsWith('•')
  return (
    <label className="int-field">
      <span>{label}{required ? ' *' : ''}</span>
      <div className="int-secret">
        <input
          type={masked || shown ? 'text' : 'password'}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          autoComplete="off"
        />
        <button type="button" aria-label={shown ? 'Hide value' : 'Show value'} onClick={() => setShown((open) => !open)}>
          <Icon name="eye" />
        </button>
      </div>
    </label>
  )
}

function TextField({ label, required, value, onChange, placeholder, type = 'text', hint }) {
  return (
    <label className="int-field">
      <span>{label}{required ? ' *' : ''}</span>
      <input type={type} value={value} onChange={onChange} placeholder={placeholder} />
      {hint ? <small>{hint}</small> : null}
    </label>
  )
}

export default function Integrations() {
  const [status, setStatus] = useState(null)
  const [forms, setForms] = useState(EMPTY)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState('')
  const [testEmail, setTestEmail] = useState('')

  const applyStatus = (next) => {
    setStatus(next)
    setForms({
      email: {
        enabled: Boolean(next.email?.enabled),
        fromEmail: next.email?.fromEmail || '',
        fromName: next.email?.fromName || 'MMS PRO',
        apiKey: next.email?.apiKeySet ? maskDisplay(next.email.apiKeyHint) : '',
        secretKey: next.email?.secretKeySet ? maskDisplay(next.email.secretKeyHint) : '',
      },
      firebase: {
        enabled: Boolean(next.firebase?.enabled),
        apiKey: next.firebase?.apiKey || '',
        authDomain: next.firebase?.authDomain || '',
        projectId: next.firebase?.projectId || '',
        storageBucket: next.firebase?.storageBucket || '',
        messagingSenderId: next.firebase?.messagingSenderId || '',
        appId: next.firebase?.appId || '',
        measurementId: next.firebase?.measurementId || '',
        vapidKey: next.firebase?.vapidKeySet ? maskDisplay(next.firebase.vapidKeyHint) : '',
        serviceAccountJson: '',
      },
      cashfree: {
        enabled: Boolean(next.cashfree?.enabled),
        environment: next.cashfree?.environment || 'sandbox',
        appId: next.cashfree?.appId || '',
        secretKey: next.cashfree?.secretKeySet ? maskDisplay(next.cashfree.secretKeyHint) : '',
      },
    })
  }

  useEffect(() => {
    getAdminIntegrations()
      .then(applyStatus)
      .catch((err) => setError(err.message || 'Could not load integrations'))
      .finally(() => setLoading(false))
  }, [])

  const update = (provider, field, value) => {
    setForms((current) => ({
      ...current,
      [provider]: { ...current[provider], [field]: value },
    }))
  }

  const save = async (provider, override) => {
    const body = override || forms[provider]
    setBusy(provider)
    setError('')
    setNotice('')
    try {
      applyStatus(await saveAdminIntegration(provider, body))
      setNotice('Changes saved.')
    } catch (err) {
      setError(err.message || 'Could not save')
    } finally {
      setBusy('')
    }
  }

  const disconnect = (provider) => {
    const body = { ...forms[provider], enabled: false }
    setForms((current) => ({ ...current, [provider]: body }))
    save(provider, body)
  }

  const test = async (provider, body) => {
    setBusy(`${provider}-test`)
    setError('')
    setNotice('')
    try {
      await testAdminIntegration(provider, body)
      setNotice(provider === 'email' ? 'Test email sent.' : 'Connection succeeded.')
    } catch (err) {
      setError(err.message || 'Connection test failed')
    } finally {
      setBusy('')
    }
  }

  if (loading) return <div className="int-page int-page--loading">Loading integrations...</div>

  return (
    <div className="int-page">
      <header className="int-page__head">
        <div>
          <h1>Integrations</h1>
          <p>Connect and manage third-party services. These settings will be applied for all organizations.</p>
        </div>
        <a className="int-docs" href="https://dev.mailjet.com/email/guides/" target="_blank" rel="noreferrer">
          <Icon name="book" /> View Documentation
        </a>
      </header>

      {status && !status.tableReady && (
        <p className="int-alert">Apply supabase-patches/84-platform-integrations.sql before saving. Environment values still work until then.</p>
      )}
      {error && <p className="int-alert">{error}</p>}
      {notice && <p className="int-notice">{notice}</p>}

      <article className="int-card">
        <SidePanel
          tone="email"
          icon="mail"
          title="Email"
          configured={configuredEmail(status?.email)}
          description="Configure Mailjet for sending transactional emails, notifications, and system alerts."
          guideHref="https://dev.mailjet.com/email/guides/send-api-v31/"
          links={[
            { label: 'Mailjet Dashboard', href: 'https://app.mailjet.com/' },
            { label: 'API Documentation', href: 'https://dev.mailjet.com/email/guides/' },
            { label: 'SMTP Settings', href: 'https://dev.mailjet.com/email/guides/send-api-v31/' },
          ]}
        />
        <form className="int-form" onSubmit={(event) => { event.preventDefault(); save('email') }}>
          <div className="int-form__switch">
            <Toggle checked={forms.email.enabled} onChange={(value) => update('email', 'enabled', value)} />
          </div>
          <div className="int-grid">
            <SecretField label="Mailjet API Key" required value={forms.email.apiKey} onChange={(event) => update('email', 'apiKey', event.target.value)} placeholder="API key" />
            <SecretField label="Mailjet Secret Key" required value={forms.email.secretKey} onChange={(event) => update('email', 'secretKey', event.target.value)} placeholder="Secret key" />
            <TextField label="From Email" required type="email" value={forms.email.fromEmail} onChange={(event) => update('email', 'fromEmail', event.target.value)} hint="This email will be used as the sender address." />
            <TextField label="From Name" required value={forms.email.fromName} onChange={(event) => update('email', 'fromName', event.target.value)} hint="This name will appear as the sender name." />
          </div>
          <div className="int-test">
            <div className="int-test__copy">
              <span><Icon name="send" /> Send Test Email</span>
              <small>Send a test email to verify your configuration.</small>
            </div>
            <div className="int-test__row">
              <input type="email" value={testEmail} onChange={(event) => setTestEmail(event.target.value)} placeholder="Enter email address" />
              <button type="button" disabled={busy === 'email-test'} onClick={() => test('email', { to: testEmail })}>
                <Icon name="send" /> Send Test Email
              </button>
            </div>
          </div>
          <div className="int-actions">
            <button type="submit" className="int-save" disabled={busy === 'email'}><Icon name="save" /> Save Changes</button>
            <button type="button" className="int-disconnect" disabled={busy === 'email'} onClick={() => disconnect('email')}><Icon name="unlink" /> Disconnect</button>
          </div>
        </form>
      </article>

      <article className="int-card">
        <SidePanel
          tone="firebase"
          icon="flame"
          title="Firebase Notifications"
          configured={configuredFirebase(status?.firebase)}
          description="Configure Firebase for push notifications and in-app messaging."
          guideHref="https://firebase.google.com/docs/cloud-messaging/js/client"
          links={[
            { label: 'Firebase Console', href: 'https://console.firebase.google.com/' },
            { label: 'Web Push Setup', href: 'https://firebase.google.com/docs/cloud-messaging/js/client' },
            { label: 'FCM Documentation', href: 'https://firebase.google.com/docs/cloud-messaging' },
          ]}
        />
        <form className="int-form" onSubmit={(event) => { event.preventDefault(); save('firebase') }}>
          <div className="int-form__switch">
            <Toggle checked={forms.firebase.enabled} onChange={(value) => update('firebase', 'enabled', value)} />
          </div>
          <div className="int-grid">
            <TextField label="Web API Key" required value={forms.firebase.apiKey} onChange={(event) => update('firebase', 'apiKey', event.target.value)} />
            <TextField label="Auth Domain" required value={forms.firebase.authDomain} onChange={(event) => update('firebase', 'authDomain', event.target.value)} placeholder="your-project.firebaseapp.com" />
            <TextField label="Project ID" required value={forms.firebase.projectId} onChange={(event) => update('firebase', 'projectId', event.target.value)} placeholder="your-project-id" />
            <TextField label="Storage Bucket" value={forms.firebase.storageBucket} onChange={(event) => update('firebase', 'storageBucket', event.target.value)} placeholder="your-project-id.appspot.com" />
            <TextField label="Messaging Sender ID" required value={forms.firebase.messagingSenderId} onChange={(event) => update('firebase', 'messagingSenderId', event.target.value)} />
            <TextField label="App ID" required value={forms.firebase.appId} onChange={(event) => update('firebase', 'appId', event.target.value)} />
            <TextField label="Measurement ID (optional)" value={forms.firebase.measurementId} onChange={(event) => update('firebase', 'measurementId', event.target.value)} placeholder="G-XXXXXXXX" />
            <SecretField label="Web Push Certificate (VAPID)" required value={forms.firebase.vapidKey} onChange={(event) => update('firebase', 'vapidKey', event.target.value)} placeholder="VAPID key" />
          </div>
          <label className="int-field int-field--full">
            <span>Service Account JSON</span>
            <textarea
              rows={4}
              value={forms.firebase.serviceAccountJson}
              onChange={(event) => update('firebase', 'serviceAccountJson', event.target.value)}
              placeholder={status?.firebase?.serviceAccountSet ? 'A service account is saved. Paste new JSON to replace it.' : 'Paste the Firebase service account JSON here...'}
            />
          </label>
          <div className="int-actions">
            <button type="submit" className="int-save" disabled={busy === 'firebase'}><Icon name="save" /> Save Changes</button>
            <button type="button" className="int-ghost" disabled={busy === 'firebase-test'} onClick={() => test('firebase')}><Icon name="wifi" /> Test Connection</button>
            <button type="button" className="int-disconnect" disabled={busy === 'firebase'} onClick={() => disconnect('firebase')}><Icon name="unlink" /> Disconnect</button>
          </div>
        </form>
      </article>

      <article className="int-card">
        <SidePanel
          tone="cashfree"
          icon="card"
          title="Cashfree"
          configured={configuredCashfree(status?.cashfree)}
          description="Configure Cashfree for payment processing and subscriptions."
          guideHref="https://www.cashfree.com/docs/payments/online/web/redirect"
          links={[
            { label: 'Cashfree Dashboard', href: 'https://merchant.cashfree.com/merchants/login' },
            { label: 'API Documentation', href: 'https://www.cashfree.com/docs/api-reference/payments/latest/overview' },
            { label: 'Webhook Setup', href: 'https://www.cashfree.com/docs/payments/online/webhooks' },
          ]}
        />
        <form className="int-form" onSubmit={(event) => { event.preventDefault(); save('cashfree') }}>
          <div className="int-form__switch">
            <Toggle checked={forms.cashfree.enabled} onChange={(value) => update('cashfree', 'enabled', value)} />
          </div>
          <div className="int-grid">
            <label className="int-field">
              <span>Environment *</span>
              <select value={forms.cashfree.environment} onChange={(event) => update('cashfree', 'environment', event.target.value)}>
                <option value="sandbox">Sandbox</option>
                <option value="production">Production</option>
              </select>
              <small>Use Sandbox for testing. Switch to Production for live payments.</small>
            </label>
            <TextField label="App ID" required value={forms.cashfree.appId} onChange={(event) => update('cashfree', 'appId', event.target.value)} />
            <SecretField label="Secret Key" required value={forms.cashfree.secretKey} onChange={(event) => update('cashfree', 'secretKey', event.target.value)} placeholder="Secret key" />
          </div>
          <div className="int-actions">
            <button type="submit" className="int-save" disabled={busy === 'cashfree'}><Icon name="save" /> Save Changes</button>
            <button type="button" className="int-ghost" disabled={busy === 'cashfree-test'} onClick={() => test('cashfree')}><Icon name="wifi" /> Test Connection</button>
            <button type="button" className="int-disconnect" disabled={busy === 'cashfree'} onClick={() => disconnect('cashfree')}><Icon name="unlink" /> Disconnect</button>
          </div>
        </form>
      </article>
    </div>
  )
}
