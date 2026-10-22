import { useCallback, useEffect, useId, useState } from 'react'
import { useNotifications } from '../../hooks/useNotifications'
import { ensureFirebaseConfig } from '../../lib/firebase'
import {
  cameraPermissionState,
  notificationPermissionState,
  notificationsSupported,
  requestCameraAccess,
} from '../../lib/devicePermissions'
import './StartupPermissions.css'

const DISMISS_KEY = 'mmspro-startup-permissions-dismissed'

const COPY = {
  notifications: {
    title: 'Notifications',
    detail: 'Alerts for work orders, tasks, and reminders, including when MMS PRO is in the background.',
    action: 'Allow notifications',
  },
  camera: {
    title: 'Camera',
    detail: 'Scan equipment QR codes from this device.',
    action: 'Allow camera',
  },
}

function sessionDismissed() {
  try {
    return sessionStorage.getItem(DISMISS_KEY) === '1'
  } catch {
    return false
  }
}

function dismissForSession() {
  try {
    sessionStorage.setItem(DISMISS_KEY, '1')
  } catch {
    // ignore storage errors
  }
}

async function askForNotifications() {
  if (!notificationsSupported()) return 'unsupported'
  if (Notification.permission === 'granted') return 'granted'
  return Notification.requestPermission()
}

export default function StartupPermissions() {
  const titleId = useId()
  const { registerToken } = useNotifications()
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState([])
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')

  useEffect(() => {
    if (sessionDismissed()) return undefined
    let cancelled = false
    ;(async () => {
      const firebase = await ensureFirebaseConfig()
      const next = []
      if (firebase?.configured && notificationPermissionState() === 'default') next.push('notifications')
      if (await cameraPermissionState() === 'prompt') next.push('camera')
      if (cancelled || sessionDismissed()) return
      setPending(next)
      setOpen(next.length > 0)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const close = useCallback(() => {
    dismissForSession()
    setOpen(false)
  }, [])

  useEffect(() => {
    if (!open) return undefined
    const onKey = (event) => {
      if (event.key === 'Escape') close()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, close])

  const allowCurrent = async () => {
    const current = pending[0]
    if (!current || busy) return
    setBusy(true)
    setNote('')
    try {
      if (current === 'notifications') {
        const state = await askForNotifications()
        if (state === 'default') return
        if (state === 'granted') await registerToken()
        if (state === 'denied') {
          setNote('Notifications stay off until they are allowed in the browser site settings.')
        }
      } else if (current === 'camera') {
        const state = await requestCameraAccess()
        if (state === 'prompt') return
        if (state === 'denied') {
          setNote('Camera stays off until it is allowed in the browser site settings.')
        }
      }
      const rest = pending.slice(1)
      setPending(rest)
      if (rest.length === 0) setOpen(false)
    } finally {
      setBusy(false)
    }
  }

  if (!open || pending.length === 0) return null

  const current = pending[0]
  const action = COPY[current]?.action || 'Allow'

  return (
    <div className="company-modal-overlay startup-permissions" role="presentation">
      <div
        className="startup-permissions__dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <h2 id={titleId} className="startup-permissions__title">Allow device access</h2>
        <p className="startup-permissions__lead">
          MMS PRO uses these to send alerts and scan equipment. Your browser asks for each one separately.
        </p>
        <ul className="startup-permissions__list">
          {pending.map((id) => (
            <li key={id} className={id === current ? 'is-current' : ''}>
              <span className="startup-permissions__item-title">{COPY[id].title}</span>
              <span className="startup-permissions__item-detail">{COPY[id].detail}</span>
            </li>
          ))}
        </ul>
        {note && <p className="startup-permissions__note">{note}</p>}
        <div className="startup-permissions__actions">
          <button type="button" className="startup-permissions__later" onClick={close} disabled={busy}>
            Not now
          </button>
          <button type="button" className="startup-permissions__allow" onClick={allowCurrent} disabled={busy}>
            {busy ? 'Waiting…' : action}
          </button>
        </div>
      </div>
    </div>
  )
}
