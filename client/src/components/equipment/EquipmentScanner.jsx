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

async function openPreviewStream() {
  const attempts = [
    { audio: false, video: { facingMode: 'environment' } },
    { audio: false, video: true },
  ]
  let lastError = null
  for (const constraints of attempts) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraints)
    } catch (err) {
      lastError = err
    }
  }
  throw lastError || new Error('Could not start the camera.')
}

function cameraMessage(error) {
  const name = error?.name || ''
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return 'Camera access was denied. Allow the camera to scan an equipment QR code.'
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return 'No camera was found on this device.'
  }
  return error?.message || 'Could not start the camera.'
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
  onResultRef.current = onResult

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
      setBusy(true)
      Promise.resolve(onResultRef.current(result.getText())).catch(() => {
        setBusy(false)
      })
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
    <div className="equipment-scanner" role="dialog" aria-modal="true" aria-label="Scan equipment QR code">
      <div className="equipment-scanner__bar">
        <h2>Scan equipment</h2>
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
        {busy ? 'Looking up equipment…' : 'Point the camera at an equipment QR code.'}
      </p>
      {(notice || error) && <p className="equipment-scanner__error" role="alert">{notice || error}</p>}
    </div>
  )
}
