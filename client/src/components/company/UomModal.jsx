import { useEffect, useState } from 'react'
import { useBackdropClose } from '../../hooks/useBackdropClose'
import { masterFieldLimit } from '../../lib/textFieldLimits'
import PageBack from '../shared/PageBack'
import FormLabel from '../shared/FormLabel'
import SpellcheckInput from '../shared/SpellcheckInput'
import './CompanyShared.css'

const EMPTY = { code: '', name: '' }
const CODE_LIMIT = masterFieldLimit('code')
const NAME_LIMIT = masterFieldLimit('name')

export default function UomModal({ uom, saving, onClose, onSave }) {
  const isEdit = Boolean(uom?.id)
  const [form, setForm] = useState(EMPTY)
  const [error, setError] = useState(null)
  const handleBackdropClick = useBackdropClose(onClose)

  useEffect(() => {
    setForm(uom
      ? { code: uom.code || '', name: uom.name || '' }
      : EMPTY)
    setError(null)
  }, [uom])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    if (!form.code.trim()) {
      setError('Code is required')
      return
    }
    if (!form.name.trim()) {
      setError('Name is required')
      return
    }
    try {
      await onSave({
        code: form.code.trim(),
        name: form.name.trim(),
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
        <form className="company-modal__form" onSubmit={handleSubmit}>
          {error && <div className="company-alert" role="alert">{error}</div>}
          <label className="company-form__field">
            <FormLabel limit={CODE_LIMIT}>Code</FormLabel>
            <input
              className="company-form__input"
              value={form.code}
              onChange={(e) => setForm((current) => ({ ...current, code: e.target.value.toUpperCase() }))}
              placeholder="KG"
              maxLength={CODE_LIMIT}
              autoComplete="off"
              required
            />
          </label>
          <label className="company-form__field">
            <FormLabel limit={NAME_LIMIT}>Name</FormLabel>
            <SpellcheckInput
              className="company-form__input"
              value={form.name}
              onChange={(e) => setForm((current) => ({ ...current, name: e.target.value }))}
              placeholder="Kilogram"
              maxLength={NAME_LIMIT}
              required
            />
          </label>
          <p className="company-modal__hint">
            The code is what gets stored on quantities. Use the same code everywhere this unit is selected.
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
    </div>
  )
}
