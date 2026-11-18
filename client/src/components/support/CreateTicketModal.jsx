import { useEffect, useRef, useState } from 'react'
import { useBackdropClose } from '../../hooks/useBackdropClose'
import {
  RELATED_MODULES,
  TICKET_CATEGORIES,
  TICKET_PRIORITIES,
} from '../../../../shared/supportTickets.js'
import {
  SUPPORT_ATTACHMENT_ACCEPT,
  SUPPORT_ATTACHMENT_MAX_FILES,
  createPendingSupportFiles,
  revokePendingSupportFiles,
} from '../../lib/supportTicketAssets'
import PageBack from '../shared/PageBack'
import FormLabel from '../shared/FormLabel'
import NavIcon from '../layout/NavIcon'
import SpellcheckInput from '../shared/SpellcheckInput'
import { normalizeRichTextValue } from '../../lib/richText'
import { AttachmentCards } from './SupportConversation'
import '../company/CompanyShared.css'
import './Support.css'

const EMPTY = {
  subject: '',
  category: TICKET_CATEGORIES[0],
  priority: 'medium',
  related_module: '',
  asset_ref: '',
  description: '',
}

/** Prefill from a duplicate draft; only editable ticket fields, never identity / status / SLA. */
function initialFormFor(cloneDraft) {
  if (!cloneDraft) return EMPTY
  const next = { ...EMPTY }
  for (const key of Object.keys(EMPTY)) {
    if (cloneDraft[key] != null) next[key] = cloneDraft[key]
  }
  return next
}

export default function CreateTicketModal({
  saving = false,
  cloneDraft = null,
  cloneSourceNumber = null,
  onClose,
  onCreate,
}) {
  const inputRef = useRef(null)
  const [form, setForm] = useState(() => initialFormFor(cloneDraft))
  const [pending, setPending] = useState([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const handleBackdropClick = useBackdropClose(onClose)

  useEffect(() => {
    setForm(initialFormFor(cloneDraft))
    setError('')
    setPending([])
  }, [])

  useEffect(() => () => revokePendingSupportFiles(pending), [pending])

  const set = (key) => (event) => setForm((prev) => ({ ...prev, [key]: event.target.value }))

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

  const submit = async (event) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await onCreate({
        ...form,
        description: normalizeRichTextValue(form.description),
        related_module: form.related_module || null,
        asset_ref: form.asset_ref.trim() || null,
        files: pending.map((item) => item.file),
      })
      revokePendingSupportFiles(pending)
      setPending([])
    } catch (err) {
      setError(err.message || 'Could not create the ticket')
      setBusy(false)
    }
  }

  const disabled = busy || saving

  return (
    <div className="company-modal-overlay" onMouseDown={handleBackdropClick} role="presentation">
      <div className="company-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-labelledby="create-ticket-title">
        <div className="company-modal__header">
          <div className="modal__header-main">
            <PageBack onClick={onClose} className="page-back--header" label="Support" />
            <h2 id="create-ticket-title">{cloneDraft ? 'Duplicate support ticket' : 'Create support ticket'}</h2>
          </div>
          <button type="button" className="company-modal__close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <form className="company-modal__form" onSubmit={submit} noValidate>
          {cloneDraft && (
            <p className="company-form__hint">
              Duplicating {cloneSourceNumber || 'an earlier ticket'}. Attachments and conversation are not copied.
              Change the subject and at least one other detail before submitting.
            </p>
          )}
          {error && <div className="company-alert" role="alert">{error}</div>}
          <label className="company-form__field">
            <FormLabel>Subject *</FormLabel>
            <input className="company-form__input" value={form.subject} onChange={set('subject')} required maxLength={160} />
          </label>
          <label className="company-form__field">
            <FormLabel>Category *</FormLabel>
            <select className="company-form__input" value={form.category} onChange={set('category')}>
              {TICKET_CATEGORIES.map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
          <label className="company-form__field">
            <FormLabel>Priority *</FormLabel>
            <select className="company-form__input" value={form.priority} onChange={set('priority')}>
              {TICKET_PRIORITIES.map((item) => (
                <option key={item.id} value={item.id}>{item.label} — {item.description}</option>
              ))}
            </select>
          </label>
          <label className="company-form__field">
            <FormLabel>Related module</FormLabel>
            <select className="company-form__input" value={form.related_module} onChange={set('related_module')}>
              <option value="">Not linked</option>
              {RELATED_MODULES.map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
          <label className="company-form__field">
            <FormLabel>Impacted asset ID</FormLabel>
            <input className="company-form__input" value={form.asset_ref} onChange={set('asset_ref')} maxLength={80} />
          </label>
          <label className="company-form__field">
            <FormLabel fieldType="textarea" limit={8000}>Description *</FormLabel>
            <SpellcheckInput
              richText
              multiline
              className="company-form__input company-form__textarea"
              value={form.description}
              onChange={set('description')}
              rows={6}
              maxLength={8000}
              required
            />
          </label>
          <div className="company-form__field support-create-attach">
            <FormLabel>Attachments</FormLabel>
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
              disabled={disabled || pending.length >= SUPPORT_ATTACHMENT_MAX_FILES}
              onClick={() => inputRef.current?.click()}
            >
              <NavIcon name="upload" />
              Attach Files
            </button>
            <p className="support-create-attach__hint">
              Up to {SUPPORT_ATTACHMENT_MAX_FILES} files (Max 25 MB each) · JPG, PNG, PDF, XLSX, DOCX
            </p>
            <AttachmentCards files={pending} pending onRemove={removePending} />
          </div>
          <div className="company-modal__actions">
            <button type="button" className="company-btn company-btn--secondary" onClick={onClose} disabled={disabled}>Cancel</button>
            <button type="submit" className="company-btn company-btn--primary" disabled={disabled}>
              {disabled ? 'Submitting…' : 'Submit support request'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
