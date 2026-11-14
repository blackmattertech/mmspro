import { useEffect, useMemo, useState } from 'react'
import { useBackdropClose } from '../../hooks/useBackdropClose'
import { useLocations } from '../../hooks/useLocations'
import { masterFieldLimit } from '../../lib/textFieldLimits'
import FilterableSelect from '../ui/FilterableSelect'
import PageBack from '../shared/PageBack'
import FormLabel from '../shared/FormLabel'
import SpellcheckInput from '../shared/SpellcheckInput'
import '../company/CompanyShared.css'

const EMPTY = {
  name: '',
  code: '',
  description: '',
  location_id: '',
}

const NAME_LIMIT = masterFieldLimit('name')
const CODE_LIMIT = masterFieldLimit('code')
const DESC_LIMIT = masterFieldLimit('description')

export default function WorkCenterModal({
  workCenter,
  saving,
  onClose,
  onSave,
  defaultLocationId = '',
  lockLocation = false,
}) {
  const isEdit = Boolean(workCenter?.id)
  const { locations } = useLocations()
  const [form, setForm] = useState(EMPTY)
  const [error, setError] = useState(null)
  const handleBackdropClick = useBackdropClose(onClose)

  useEffect(() => {
    if (workCenter) {
      setForm({
        name: workCenter.name || '',
        code: workCenter.code || '',
        description: workCenter.description || '',
        location_id: workCenter.location_id || '',
      })
    } else {
      setForm({
        ...EMPTY,
        location_id: defaultLocationId || '',
      })
    }
  }, [workCenter, defaultLocationId])

  const activeLocations = useMemo(
    () => (locations || []).filter((location) => location.is_active !== false),
    [locations],
  )

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    if (!form.name.trim()) {
      setError('Name is required')
      return
    }
    try {
      await onSave({
        name: form.name.trim(),
        code: form.code.trim() || null,
        description: form.description.trim() || null,
        location_id: lockLocation ? (defaultLocationId || form.location_id || null) : (form.location_id || null),
      })
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="company-modal-overlay" onMouseDown={handleBackdropClick} role="presentation">
      <div className="company-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-labelledby="work-center-modal-title">
        <div className="company-modal__header">
          <div className="modal__header-main">
            <PageBack onClick={onClose} className="page-back--header" label="Work Center" />
            <h2 id="work-center-modal-title">{isEdit ? 'Edit Work Center' : 'Add Work Center'}</h2>
          </div>
          <button type="button" className="company-modal__close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <form className="company-modal__form" onSubmit={handleSubmit}>
          {error && <div className="company-alert">{error}</div>}
          <label className="company-form__field">
            <FormLabel fieldType="text" limit={NAME_LIMIT}>Name *</FormLabel>
            <SpellcheckInput
              className="company-form__input"
              value={form.name}
              onChange={(e) => setForm((current) => ({ ...current, name: e.target.value }))}
              required
              maxLength={NAME_LIMIT}
            />
          </label>
          <label className="company-form__field">
            <FormLabel fieldType="text" limit={CODE_LIMIT}>Code</FormLabel>
            <SpellcheckInput
              className="company-form__input"
              value={form.code}
              onChange={(e) => setForm((current) => ({ ...current, code: e.target.value }))}
              placeholder="Optional"
              maxLength={CODE_LIMIT}
            />
          </label>
          <label className="company-form__field">
            <span className="company-form__label">Location</span>
            <FilterableSelect
              className="company-form__input--select"
              value={form.location_id}
              onChange={(location_id) => setForm((current) => ({ ...current, location_id }))}
              options={activeLocations}
              getOptionValue={(location) => location.id}
              getOptionLabel={(location) => location.name}
              placeholder="All locations"
              allowEmpty={!lockLocation}
              disabled={lockLocation}
            />
          </label>
          <label className="company-form__field company-form__field--full">
            <FormLabel fieldType="textarea" limit={DESC_LIMIT}>Description</FormLabel>
            <SpellcheckInput
              multiline
              className="company-form__input company-form__textarea"
              rows={3}
              value={form.description}
              onChange={(e) => setForm((current) => ({ ...current, description: e.target.value }))}
              maxLength={DESC_LIMIT}
            />
          </label>
          <div className="company-modal__actions">
            <button type="button" className="company-btn company-btn--secondary" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="company-btn company-btn--primary" disabled={saving}>
              {saving ? 'Saving…' : (isEdit ? 'Save' : 'Add Work Center')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
