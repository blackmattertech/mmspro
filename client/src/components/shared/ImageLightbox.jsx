import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { downloadFromUrl } from '../../lib/fileDownload'
import '../workorders/ManualWorkOrder.css'

export default function ImageLightbox({ src, alt, filename, onClose }) {
  const [downloading, setDownloading] = useState(false)

  useEffect(() => {
    const handleKey = (event) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  const handleDownload = async (event) => {
    event.stopPropagation()
    if (!src || downloading) return
    setDownloading(true)
    try {
      await downloadFromUrl(src, filename || alt || 'image')
    } finally {
      setDownloading(false)
    }
  }

  return createPortal(
    <div
      className="wo-image-lightbox"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`View ${alt || 'image'}`}
    >
      <div className="wo-image-lightbox__toolbar" onClick={(event) => event.stopPropagation()}>
        <button
          type="button"
          className="wo-image-lightbox__download"
          onClick={handleDownload}
          disabled={!src || downloading}
        >
          {downloading ? 'Downloading…' : 'Download'}
        </button>
        <button type="button" className="wo-image-lightbox__close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>
      <img
        src={src}
        alt={alt || ''}
        className="wo-image-lightbox__img"
        onClick={(event) => event.stopPropagation()}
      />
    </div>,
    document.body,
  )
}
