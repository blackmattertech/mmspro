import { useCallback, useEffect, useRef, useState } from 'react'
import { useBackdropClose } from '../../hooks/useBackdropClose'
import {
  CROP_VIEWPORT_SIZE,
  cropImageToFile,
  getCoverScale,
  loadImage,
} from '../../lib/cropImage'
import '../company/CompanyShared.css'
import './ImageCropModal.css'

export default function ImageCropModal({
  imageSrc,
  fileName = 'photo.jpg',
  mimeType = 'image/jpeg',
  nested = false,
  onComplete,
  onCancel,
}) {
  const [scale, setScale] = useState(1)
  const [minScale, setMinScale] = useState(1)
  const [maxScale, setMaxScale] = useState(3)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const dragRef = useRef(null)
  const handleBackdropClick = useBackdropClose(onCancel)

  useEffect(() => {
    let cancelled = false

    loadImage(imageSrc)
      .then((image) => {
        if (cancelled) return
        const coverScale = getCoverScale(image, CROP_VIEWPORT_SIZE)
        setImageSize({ width: image.naturalWidth, height: image.naturalHeight })
        setMinScale(coverScale)
        setMaxScale(coverScale * 3)
        setScale(coverScale)
        setPosition({ x: 0, y: 0 })
      })
      .catch(() => {
        if (!cancelled) setError('Could not load image')
      })

    return () => {
      cancelled = true
    }
  }, [imageSrc])

  const endDrag = useCallback(() => {
    if (dragRef.current) dragRef.current.active = false
  }, [])

  useEffect(() => {
    window.addEventListener('pointerup', endDrag)
    window.addEventListener('pointercancel', endDrag)
    return () => {
      window.removeEventListener('pointerup', endDrag)
      window.removeEventListener('pointercancel', endDrag)
    }
  }, [endDrag])

  const handlePointerDown = (e) => {
    e.preventDefault()
    dragRef.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      startPos: { ...position },
    }
  }

  const handlePointerMove = (e) => {
    if (!dragRef.current?.active) return
    const dx = e.clientX - dragRef.current.startX
    const dy = e.clientY - dragRef.current.startY
    setPosition({
      x: dragRef.current.startPos.x + dx,
      y: dragRef.current.startPos.y + dy,
    })
  }

  const handleApply = async () => {
    setError(null)
    setSaving(true)
    try {
      const outputName = fileName.replace(/\.[^.]+$/, '') + '.jpg'
      const file = await cropImageToFile({
        imageSrc,
        viewportSize: CROP_VIEWPORT_SIZE,
        scale,
        position,
        fileName: outputName,
        mimeType: 'image/jpeg',
      })
      onComplete(file)
    } catch (err) {
      setError(err.message || 'Could not crop image')
    } finally {
      setSaving(false)
    }
  }

  const displayWidth = imageSize.width * scale
  const displayHeight = imageSize.height * scale
  const imageLeft = (CROP_VIEWPORT_SIZE - displayWidth) / 2 + position.x
  const imageTop = (CROP_VIEWPORT_SIZE - displayHeight) / 2 + position.y

  return (
    <div
      className={`company-modal-overlay image-crop-overlay ${nested ? 'company-modal-overlay--nested' : ''}`}
      onMouseDown={handleBackdropClick}
    >
      <div className="company-modal image-crop-modal" onClick={(e) => e.stopPropagation()}>
        <div className="company-modal__header">
          <h2>Adjust Photo</h2>
          <button type="button" className="company-modal__close" onClick={onCancel} aria-label="Close">
            ×
          </button>
        </div>

        <div className="image-crop-modal__body">
          <p className="image-crop-modal__hint">Drag to reposition. Use the slider to zoom.</p>

          <div
            className="image-crop-modal__viewport"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
          >
            {imageSize.width > 0 && (
              <img
                src={imageSrc}
                alt=""
                className="image-crop-modal__image"
                style={{
                  width: `${displayWidth}px`,
                  height: `${displayHeight}px`,
                  left: `${imageLeft}px`,
                  top: `${imageTop}px`,
                }}
                draggable={false}
              />
            )}
          </div>

          <label className="image-crop-modal__zoom">
            <span>Zoom</span>
            <input
              type="range"
              min={minScale}
              max={maxScale}
              step={0.01}
              value={scale}
              onChange={(e) => setScale(Number(e.target.value))}
            />
          </label>

          {error && <p className="company-alert">{error}</p>}

          <div className="company-modal__actions">
            <button type="button" className="company-btn company-btn--secondary" onClick={onCancel}>
              Cancel
            </button>
            <button
              type="button"
              className="company-btn company-btn--primary"
              onClick={handleApply}
              disabled={saving || imageSize.width === 0}
            >
              {saving ? 'Applying...' : 'Apply'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
