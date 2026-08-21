import { useRef, useState } from 'react'
import { validateWorkOrderFile } from '../../lib/workOrderAssets'
import {
  createLocalFileItem,
  getAttachmentKind,
  getFilePreviewSrc,
} from '../../lib/workOrderFileValues'
import ImageLightbox from '../shared/ImageLightbox'

const PAPERCLIP_ICON = 'https://ik.imagekit.io/w2lf8dznx/icons/paperclip-outline%20(1).svg'
const PDF_ICON = 'https://ik.imagekit.io/w2lf8dznx/icons/file-pdf-outline.svg'
const ZIP_ICON = 'https://ik.imagekit.io/w2lf8dznx/icons/file-zip-outline.svg'

export const WR_ATTACHMENT_ACCEPT = 'image/*,.pdf,.doc,.docx,.xls,.xlsx,.zip'

function kindIcon(kind) {
  if (kind === 'pdf') return PDF_ICON
  if (kind === 'zip') return ZIP_ICON
  return null
}

export default function WorkRequestAttachmentsField({
  files = [],
  onChange,
  disabled = false,
  label = 'Attachment',
}) {
  const inputRef = useRef(null)
  const [fileError, setFileError] = useState(null)
  const [lightbox, setLightbox] = useState(null)

  const handlePick = (event) => {
    const picked = Array.from(event.target.files || [])
    event.target.value = ''
    if (!picked.length) return

    setFileError(null)
    const next = [...files]
    for (const file of picked) {
      const error = validateWorkOrderFile(file, 'file')
      if (error) {
        setFileError(error)
        continue
      }
      next.push(createLocalFileItem(file, 'file'))
    }
    onChange?.(next)
  }

  const removeFile = (index) => {
    const item = files[index]
    if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl)
    onChange?.(files.filter((_, i) => i !== index))
  }

  return (
    <>
      <div className="company-form__field wr-attach-field">
        <span className="company-form__label">{label}</span>
        <div className="wr-attach-picker">
          <span
            className="wr-attach-picker__clip"
            style={{
              WebkitMaskImage: `url("${PAPERCLIP_ICON}")`,
              maskImage: `url("${PAPERCLIP_ICON}")`,
            }}
            aria-hidden="true"
          />
          <button
            type="button"
            className="wr-attach-picker__add"
            onClick={() => inputRef.current?.click()}
            disabled={disabled}
            aria-label="Add attachments"
            title="Add attachments"
          >
            +
          </button>
          <input
            ref={inputRef}
            type="file"
            accept={WR_ATTACHMENT_ACCEPT}
            multiple
            className="wr-attach-picker__input"
            disabled={disabled}
            onChange={handlePick}
          />
        </div>
        {fileError && (
          <p className="wr-attach-field__error" role="alert">{fileError}</p>
        )}
      </div>
      {files.length > 0 && (
        <ul className="wr-attach-files">
          {files.map((item, index) => {
            const kind = getAttachmentKind(item)
            const previewSrc = getFilePreviewSrc(item)
            const icon = kindIcon(kind)
            const label = item.name || item.file_name || 'File'
            return (
              <li key={item.id || `${label}-${index}`} className="wr-attach-files__item">
                <button
                  type="button"
                  className="wr-attach-files__box"
                  onClick={() => {
                    if (kind === 'image' && previewSrc) {
                      setLightbox({ src: previewSrc, alt: label, filename: label })
                    }
                  }}
                  aria-label={kind === 'image' ? `Preview ${label}` : label}
                >
                  {kind === 'image' && previewSrc ? (
                    <img src={previewSrc} alt="" />
                  ) : icon ? (
                    <img src={icon} alt="" className="wr-attach-files__icon" />
                  ) : (
                    <span className="wr-attach-files__ext">
                      {(label.split('.').pop() || 'FILE').slice(0, 4).toUpperCase()}
                    </span>
                  )}
                </button>
                <span className="wr-attach-files__name" title={label}>{label}</span>
                <button
                  type="button"
                  className="wr-attach-files__remove"
                  onClick={() => removeFile(index)}
                  disabled={disabled}
                >
                  Remove
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {lightbox && (
        <ImageLightbox
          src={lightbox.src}
          alt={lightbox.alt}
          filename={lightbox.filename}
          onClose={() => setLightbox(null)}
        />
      )}
    </>
  )
}
