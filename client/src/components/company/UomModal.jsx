import { useEffect, useState } from 'react'
import { useBackdropClose } from '../../hooks/useBackdropClose'
import { masterFieldLimit } from '../../lib/textFieldLimits'
import { useMandatoryFieldAlert } from '../../hooks/useMandatoryFieldAlert'
import PageBack from '../shared/PageBack'
import FormLabel from '../shared/FormLabel'
import SpellcheckInput from '../shared/SpellcheckInput'
import './CompanyShared.css'

const EMPTY = { code: '', name: '', category: '' }
const CODE_LIMIT = masterFieldLimit('code')
const NAME_LIMIT = masterFieldLimit('name')
const CATEGORY_LIMIT = masterFieldLimit('category')

export default function UomModal({ uom, saving, onClose, onSave }) {
  const isEdit = Boolean(uom?.id)
  const [form, setForm] = useState(EMPTY)
  const [error, setError] = useState(null)
  const {
    invalidFieldIds,
    showMissing,
    clearInvalidField,
    clearAll: clearMandatoryHighlight,
    alertModal,
  } = useMandatoryFieldAlert()
  const handleBackdropClick = useBackdropClose(onClose)

  useEffect(() => {
    setForm(uom
      ? { code: uom.code || '', name: uom.name || '', category: uom.category || '' }
      : EMPTY)
    setError(null)
    clearMandatoryHighlight()
  }, [uom, clearMandatoryHighlight])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    const missing = []
    if (!form.code.trim()) missing.push({ id: 'code', label: 'Code' })
    if (!form.name.trim()) missing.push({ id: 'name', label: 'Name' })
    if (missing.length) {
      setError(showMissing(missing))
      return
    }
    clearMandatoryHighlight()
    try {
      await onSave({
        code: form.code.trim(),
        name: form.name.trim(),
        category: form.category.trim(),
      })
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="company-modal-overlay" onMouseDown={handleBackdropClick} role="presentation">
      <div className="company-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-labelledby="uom-modal-title">
        <div className="company-modal__header">
          <div className="modal__header-main">
            <PageBack onClick={onClose} className="page-back--header" label="UOM" />
            <h2 id="uom-modal-title">{isEdit ? 'Edit UOM' : 'Add UOM'}</h2>
          </div>
          <button type="button" className="company-modal__close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <form className="company-modal__form" onSubmit={handleSubmit} noValidate>
          {error && <div className="company-alert" role="alert">{error}</div>}
          <label
            className={`company-form__field${invalidFieldIds.includes('code') ? ' company-form__field--invalid' : ''}`}
            data-field-id="code"
          >
            <FormLabel limit={CODE_LIMIT}>Code</FormLabel>
            <input
              className="company-form__input"
              value={form.code}
              onChange={(e) => {
                clearInvalidField('code')
                setForm((current) => ({ ...current, code: e.target.value.toUpperCase() }))
              }}
              placeholder="KG"
              maxLength={CODE_LIMIT}
              autoComplete="off"
            />
          </label>
          <label
            className={`company-form__field${invalidFieldIds.includes('name') ? ' company-form__field--invalid' : ''}`}
            data-field-id="name"
          >
            <FormLabel limit={NAME_LIMIT}>Name</FormLabel>
            <SpellcheckInput
              className="company-form__input"
              value={form.name}
              onChange={(e) => {
                clearInvalidField('name')
                setForm((current) => ({ ...current, name: e.target.value }))
              }}
              placeholder="Kilogram"
              maxLength={NAME_LIMIT}
            />
          </label>
          <label className="company-form__field" data-field-id="category">
            <FormLabel limit={CATEGORY_LIMIT}>Category</FormLabel>
            <SpellcheckInput
              className="company-form__input"
              value={form.category}
              onChange={(e) => setForm((current) => ({ ...current, category: e.target.value }))}
              placeholder="Weight Units"
              maxLength={CATEGORY_LIMIT}
            />
          </label>
          <p className="company-modal__hint">
            The code is what gets stored on quantities. Use category to group units (for example Electrical Units or Weight Units).
          </p>
          <div className="company-modal__actions">
            <button type="button" className="company-btn company-btn--secondary" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="company-btn company-btn--primary" disabled={saving}>
              {saving ? 'Saving…' : (isEdit ? 'Save' : 'Add UOM')}
            </button>
          </div>
        </form>
      </div>
      {alertModal}
    </div>
  )
}
