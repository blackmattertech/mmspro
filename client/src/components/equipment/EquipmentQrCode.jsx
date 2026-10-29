import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[ch]))
}

function printQrLabel({ dataUrl, title, caption }) {
  const popup = window.open('', '_blank', 'noopener,noreferrer,width=480,height=640')
  if (!popup) return
  popup.document.write(`<!DOCTYPE html><html><head><title>${escapeHtml(title)}</title>
    <style>
      body { font-family: Inter, sans-serif; margin: 32px; color: #111827; }
      img { width: 220px; height: 220px; }
      h1 { font-size: 22px; margin: 16px 0 4px; }
      p { margin: 0; color: #6b7280; }
      strong { display: block; margin-top: 8px; font-size: 18px; color: #111827; }
    </style></head><body>
    <img src="${dataUrl}" alt="Asset QR code" />
    <h1>${escapeHtml(title)}</h1>
    <p>${escapeHtml(caption?.label || 'QR code')}</p>
    <strong>${escapeHtml(caption?.value || '')}</strong>
    </body></html>`)
  popup.document.close()
  popup.focus()
  popup.print()
}

function QrTitleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4.75 4.75H9.25V9.25H4.75V4.75ZM14.75 4.75H19.25V9.25H14.75V4.75ZM4.75 14.75H9.25V19.25H4.75V14.75Z" stroke="currentColor" strokeWidth="1.5" />
      <path d="M14.75 14.75H16.25V16.25H14.75V14.75ZM17.75 14.75H19.25V16.25H17.75V14.75ZM14.75 17.75H16.25V19.25H14.75V17.75ZM17.75 17.75H19.25V19.25H17.75V17.75Z" fill="currentColor" />
    </svg>
  )
}

function DownloadIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 4.75V14.25M12 14.25L8.25 10.5M12 14.25L15.75 10.5M5.75 19.25H18.25" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function PrintIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M7.75 9.25V4.75H16.25V9.25" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M6.75 16.25H4.75V9.75H19.25V16.25H17.25" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M7.75 13.75H16.25V19.25H7.75V13.75Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  )
}

export default function EquipmentQrCode({ value, caption, fileName = 'asset-qr', variant = 'inline' }) {
  const [dataUrl, setDataUrl] = useState('')
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!value) {
      setDataUrl('')
      return undefined
    }
    let cancelled = false
    QRCode.toDataURL(value, {
      width: 280,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: { dark: '#000000', light: '#ffffff' },
    })
      .then((url) => {
        if (!cancelled) setDataUrl(url)
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Could not draw the QR code')
      })
    return () => { cancelled = true }
  }, [value])

  if (!value) return null

  if (variant === 'panel') {
    return (
      <section className="equipment-detail__card equipment-detail__qr">
        <h2 className="equipment-detail__card-title">
          <QrTitleIcon />
          Asset QR code
        </h2>
        <div className="equipment-detail__qr-body">
          {dataUrl ? (
            <img className="equipment-detail__qr-image" src={dataUrl} alt="Asset QR code" />
          ) : (
            <div className="equipment-detail__qr-image equipment-detail__qr-image--empty">
              {error || 'Preparing QR code…'}
            </div>
          )}
          <div className="equipment-detail__qr-copy">
            <h3>Scan to access this asset</h3>
            <p>Scan this QR code to view asset details, work orders, PM schedule and more.</p>
            <span>{caption?.label || 'QR code'}</span>
            <strong>{caption?.value || '—'}</strong>
            <div className="equipment-detail__qr-actions">
              {dataUrl && (
                <a className="company-btn company-btn--primary" href={dataUrl} download={`${fileName}.png`}>
                  <DownloadIcon />
                  Download QR
                </a>
              )}
              <button
                type="button"
                className="company-btn company-btn--secondary"
                disabled={!dataUrl}
                onClick={() => printQrLabel({ dataUrl, title: fileName, caption })}
              >
                <PrintIcon />
                Print label
              </button>
            </div>
          </div>
        </div>
      </section>
    )
  }

  return (
    <div className="equipment-qr">
      {dataUrl ? (
        <img className="equipment-qr__image" src={dataUrl} alt="Asset QR code" />
      ) : (
        <div className="equipment-qr__image equipment-qr__image--empty">
          {error || 'Preparing QR code…'}
        </div>
      )}
      <div className="equipment-qr__meta">
        <span className="equipment-qr__label">{caption?.label || 'QR code'}</span>
        <strong className="equipment-qr__value">{caption?.value || '—'}</strong>
        {dataUrl && (
          <a className="company-btn company-btn--ghost company-btn--compact" href={dataUrl} download={`${fileName}.png`}>
            Download QR
          </a>
        )}
      </div>
    </div>
  )
}
