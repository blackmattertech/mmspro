import { useEffect, useRef, useState } from 'react'
import ImageLightbox from '../shared/ImageLightbox'
import NavIcon from '../layout/NavIcon'
import RichTextDisplay from '../shared/RichTextDisplay'
import SpellcheckInput from '../shared/SpellcheckInput'
import {
  SUPPORT_ATTACHMENT_ACCEPT,
  SUPPORT_ATTACHMENT_MAX_FILES,
  createPendingSupportFiles,
  formatSupportFileSize,
  isSupportImageAttachment,
  revokePendingSupportFiles,
  uploadSupportFiles,
} from '../../lib/supportTicketAssets'
import { downloadFromUrl } from '../../lib/fileDownload'
import { isRichTextEmpty, normalizeRichTextValue } from '../../lib/richText'
import './Support.css'

function fileExt(name = '') {
  return String(name).split('.').pop()?.slice(0, 4).toUpperCase() || 'FILE'
}

export function AttachmentCards({ files = [], pending = false, onRemove }) {
  const [lightbox, setLightbox] = useState(null)

  if (!files.length) return null

  return (
    <>
      <div className="support-attach-list">
        {files.map((file) => {
          const key = file.path || file.id || file.name
          const image = isSupportImageAttachment(file)
          const preview = file.previewUrl || file.signed_url || null
          return (
            <div className="support-attach-card" key={key}>
              <div className={`support-attach-card__thumb${image && preview ? '' : ' support-attach-card__thumb--file'}`}>
                {image && preview ? (
                  <img src={preview} alt="" />
                ) : (
                  <span>{fileExt(file.name)}</span>
                )}
              </div>
              <div className="support-attach-card__meta">
                <strong title={file.name}>{file.name}</strong>
                <span>{formatSupportFileSize(file.size) || (pending ? 'Ready to upload' : 'Attachment')}</span>
              </div>
              <div className="support-attach-card__actions">
                {image && preview && (
                  <button
                    type="button"
                    className="company-btn company-btn--secondary company-btn--compact company-btn--icon"
                    onClick={() => setLightbox({ src: preview, name: file.name })}
                    aria-label={`Preview ${file.name}`}
                    title="Preview"
                  >
                    <NavIcon name="view" />
                  </button>
                )}
                {!pending && preview && (
                  <button
                    type="button"
                    className="company-btn company-btn--secondary company-btn--compact company-btn--icon"
                    onClick={() => downloadFromUrl(preview, file.name)}
                    aria-label={`Download ${file.name}`}
                    title="Download"
                  >
                    <NavIcon name="download" />
                  </button>
                )}
                {pending && onRemove && (
                  <button
                    type="button"
                    className="company-btn company-btn--secondary company-btn--compact company-btn--icon"
                    onClick={() => onRemove(file)}
                    aria-label={`Remove ${file.name}`}
                    title="Remove"
                  >
                    <NavIcon name="close" />
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
      {lightbox && (
        <ImageLightbox src={lightbox.src} alt={lightbox.name} filename={lightbox.name} onClose={() => setLightbox(null)} />
      )}
    </>
  )
}

export function SupportMessageBubble({ message }) {
  const support = message.author_role === 'support'
  return (
    <article className={`support-bubble${support ? ' support-bubble--support' : ' support-bubble--customer'}`}>
      <header>
        <strong>{message.author_name}</strong>
        <span>{message.created_at_label}</span>
      </header>
      {message.body && !isRichTextEmpty(message.body) ? (
        <RichTextDisplay value={message.body} className="support-bubble__body" empty="" />
      ) : null}
      <AttachmentCards files={message.attachments || []} />
    </article>
  )
}

export function SupportReplyComposer({
  disabled = false,
  saving = false,
  ticketId,
  admin = false,
  placeholder = 'Type your reply...',
  submitLabel = 'Send Reply',
  onCancel,
  onSend,
}) {
  const inputRef = useRef(null)
  const [body, setBody] = useState('')
  const [pending, setPending] = useState([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const locked = disabled || saving || busy

  useEffect(() => () => revokePendingSupportFiles(pending), [pending])

  const pickFiles = (event) => {
    try {
      setError('')
      const next = createPendingSupportFiles(event.target.files)
      if (pending.length + next.length > SUPPORT_ATTACHMENT_MAX_FILES) {
        revokePendingSupportFiles(next)
        setError(`You can attach up to ${SUPPORT_ATTACHMENT_MAX_FILES} files`)
        return
      }
      setPending((prev) => [...prev, ...next])
    } catch (err) {
      setError(err.message || 'Could not attach files')
    } finally {
      event.target.value = ''
    }
  }

  const removePending = (file) => {
    setPending((prev) => {
      const next = prev.filter((item) => item.id !== file.id)
      revokePendingSupportFiles([file])
      return next
    })
  }

  const reset = () => {
    revokePendingSupportFiles(pending)
    setPending([])
    setBody('')
    setError('')
  }

  const submit = async (event) => {
    event.preventDefault()
    const nextBody = normalizeRichTextValue(body)
    if (isRichTextEmpty(nextBody) && !pending.length) {
      setError('Add a reply or attach at least one file')
      return
    }
    setError('')
    setBusy(true)
    try {
      const attachments = pending.length
        ? await uploadSupportFiles(ticketId, pending.map((item) => item.file), { admin })
        : []
      await onSend({ body: nextBody, attachments })
      revokePendingSupportFiles(pending)
      setPending([])
      setBody('')
    } catch (err) {
      setError(err.message || 'Could not send the reply')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="support-composer" onSubmit={submit}>
      {error && <div className="company-alert" role="alert">{error}</div>}
      <div className="support-composer__shell">
        <SpellcheckInput
          richText
          multiline
          className="company-form__input company-form__textarea support-composer__input"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder={placeholder}
          rows={4}
          disabled={locked}
          maxLength={8000}
        />
        <AttachmentCards files={pending} pending onRemove={removePending} />
        <div className="support-composer__bar">
          <div className="support-composer__attach">
            <input
              ref={inputRef}
              type="file"
              accept={SUPPORT_ATTACHMENT_ACCEPT}
              multiple
              hidden
              onChange={pickFiles}
            />
            <button
              type="button"
              className="company-btn company-btn--secondary support-composer__attach-btn"
              disabled={locked || pending.length >= SUPPORT_ATTACHMENT_MAX_FILES}
              onClick={() => inputRef.current?.click()}
            >
              <NavIcon name="upload" />
              Attach Files
            </button>
            <span>Up to {SUPPORT_ATTACHMENT_MAX_FILES} files (Max 25 MB each) · JPG, PNG, PDF, XLSX, DOCX</span>
          </div>
          <div className="support-composer__actions">
            <button
              type="button"
              className="company-btn company-btn--secondary"
              onClick={() => {
                reset()
                onCancel?.()
              }}
              disabled={locked || (isRichTextEmpty(body) && !pending.length)}
            >
              Cancel
            </button>
            <button type="submit" className="company-btn company-btn--primary" disabled={locked}>
              {busy || saving ? 'Sending…' : submitLabel}
            </button>
          </div>
        </div>
      </div>
    </form>
  )
}

export default AttachmentCards
