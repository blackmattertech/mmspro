import { useEffect, useRef, useState } from 'react'
import { BrowserQRCodeReader } from '@zxing/browser'
import NavIcon from '../layout/NavIcon'
import './EquipmentScanner.css'

function prepareInlinePreview(video) {
  video.muted = true
  video.defaultMuted = true
  video.playsInline = true
  video.autoplay = true
  video.controls = false
  video.disablePictureInPicture = true
  video.setAttribute('muted', '')
  video.setAttribute('autoplay', '')
  video.setAttribute('playsinline', 'true')
  video.setAttribute('webkit-playsinline', 'true')
}

function cameraApi() {
  const devices = typeof navigator !== 'undefined' ? navigator.mediaDevices : null
  if (devices && typeof devices.getUserMedia === 'function') return devices
  return null
}

async function openPreviewStream() {
  const devices = cameraApi()
  if (!devices) {
    const secure = typeof window !== 'undefined' && window.isSecureContext
    const err = new Error(secure
      ? 'This browser cannot open the camera. Choose a photo of the QR code instead.'
      : 'The camera is unavailable on this connection. Open the site with HTTPS, or choose a photo of the QR code.')
    err.name = 'CameraUnavailableError'
    throw err
  }
  const attempts = [
    { audio: false, video: { facingMode: 'environment' } },
    { audio: false, video: true },
  ]
  let lastError = null
  for (const constraints of attempts) {
    try {
      return await devices.getUserMedia(constraints)
    } catch (err) {
      lastError = err
    }
  }
  throw lastError || new Error('Could not start the camera.')
}

function cameraMessage(error) {
  const name = error?.name || ''
  if (name === 'CameraUnavailableError') return error.message
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return 'Camera access was denied. Allow the camera to scan an asset QR code.'
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return 'No camera was found on this device.'
  }
  if (/notfound/i.test(name) || /no .*qr/i.test(error?.message || '')) {
    return 'No QR code was found in that photo.'
  }
  return error?.message || 'Could not start the camera.'
}

async function decodeQrFile(file) {
  const url = URL.createObjectURL(file)
  try {
    const reader = new BrowserQRCodeReader()
    const result = await reader.decodeFromImageUrl(url)
    return result.getText()
  } finally {
    URL.revokeObjectURL(url)
  }
}

function stopStream(video) {
  const stream = video?.srcObject
  if (stream?.getTracks) stream.getTracks().forEach((track) => track.stop())
}

export default function EquipmentScanner({ onClose, onResult, notice }) {
  const videoRef = useRef(null)
  const onResultRef = useRef(onResult)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef(null)
  onResultRef.current = onResult

  const finishWithText = (text) => {
    setBusy(true)
    setError(null)
    Promise.resolve(onResultRef.current(text)).catch(() => {
      setBusy(false)
    })
  }

  const onPhoto = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      finishWithText(await decodeQrFile(file))
    } catch (err) {
      setBusy(false)
      setError(cameraMessage(err))
    }
  }

  useEffect(() => {
    const video = videoRef.current
    if (!video) return undefined
    let stopped = false
    let controls = null
    prepareInlinePreview(video)
    const reader = new BrowserQRCodeReader(undefined, { delayBetweenScanAttempts: 80 })

    const onFrame = (result, _scanError, scanControls) => {
      controls = scanControls
      if (stopped || !result) return
      stopped = true
      scanControls?.stop()
      stopStream(video)
      finishWithText(result.getText())
    }

    openPreviewStream()
      .then(async (stream) => {
        if (stopped) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }
        video.srcObject = stream
        await video.play()
        if (stopped) return
        controls = await reader.decodeFromStream(stream, video, onFrame)
      })
      .catch((err) => {
        if (!stopped) setError(cameraMessage(err))
      })

    return () => {
      stopped = true
      controls?.stop()
      stopStream(video)
    }
  }, [])

  return (
    <div className="equipment-scanner" role="dialog" aria-modal="true" aria-label="Scan asset QR code">
      <div className="equipment-scanner__bar">
        <h2>Scan asset</h2>
        <button type="button" className="equipment-scanner__close" onClick={onClose} aria-label="Close scanner">
          <NavIcon name="close" />
        </button>
      </div>
      <div className="equipment-scanner__stage">
        <video
          ref={videoRef}
          className="equipment-scanner__video"
          muted
          autoPlay
          playsInline
          controls={false}
          disablePictureInPicture
        />
        <div className="equipment-scanner__frame" aria-hidden="true" />
      </div>
      <p className="equipment-scanner__hint">
        {busy ? 'Looking up asset…' : 'Point the camera at an asset QR code.'}
      </p>
      <div className="equipment-scanner__actions">
        <button
          type="button"
          className="equipment-scanner__photo"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
        >
          Choose photo
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={onPhoto}
        />
      </div>
      {(notice || error) && <p className="equipment-scanner__error" role="alert">{notice || error}</p>}
    </div>
  )
}
