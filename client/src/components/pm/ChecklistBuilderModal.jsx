import { useEffect, useState } from 'react'
import { useBackdropClose } from '../../hooks/useBackdropClose'
import PageBack from '../shared/PageBack'
import FilterableSelect from '../ui/FilterableSelect'
import GooToggle from '../ui/GooToggle'
import EditIcon from '../ui/EditIcon'
import TrashIcon from '../ui/TrashIcon'
import {
  CHECKLIST_FIELD_TYPES,
  OPTION_CHECKLIST_FIELD_TYPES,
  checklistFieldTypeLabel,
} from '../../config/pm'
import {
  createChecklistField,
  updateChecklistField,
  deleteChecklistField,
  reorderChecklistFields,
  getChecklistTemplate,
} from '../../lib/api-pm'
import '../company/CompanyShared.css'
import './Pm.css'

const EMPTY_FIELD = {
  name: '',
  field_type: 'checkbox',
  optionsText: 'Pass\nFail\nNot Applicable',
  is_required: false,
}

function parseOptions(text) {
  return String(text || '')
    .split(/[\n\r,;]+/)
    .map((value) => value.trim())
    .filter(Boolean)
}

export default function ChecklistBuilderModal({
  template,
  saving,
  onClose,
  onSaveTemplate,
}) {
  const [form, setForm] = useState({
    name: template?.name || '',
    description: template?.description || '',
    is_active: template?.is_active !== false,
  })
  const [fields, setFields] = useState(template?.fields || [])
  const [fieldDraft, setFieldDraft] = useState(EMPTY_FIELD)
  const [editingFieldId, setEditingFieldId] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const handleBackdropClick = useBackdropClose(onClose)

  useEffect(() => {
    setForm({
      name: template?.name || '',
      description: template?.description || '',
      is_active: template?.is_active !== false,
    })
    setFields(template?.fields || [])
  }, [template])

  const reloadFields = async () => {
    if (!template?.id) return
    const detail = await getChecklistTemplate(template.id)
    setFields(detail.fields || [])
  }

  const handleSaveMeta = async (event) => {
    event.preventDefault()
    setError(null)
    try {
      await onSaveTemplate({
        name: form.name.trim(),
        description: form.description.trim() || null,
        is_active: form.is_active,
      })
    } catch (err) {
      setError(err.message)
    }
  }

  const startEditField = (field) => {
    setEditingFieldId(field.id)
    setFieldDraft({
      name: field.name,
      field_type: field.field_type,
      optionsText: (field.options || []).join('\n'),
      is_required: Boolean(field.is_required),
    })
  }

  const resetFieldDraft = () => {
    setEditingFieldId(null)
    setFieldDraft(EMPTY_FIELD)
  }

  const handleSaveField = async (event) => {
    event.preventDefault()
    if (!template?.id) {
      setError('Save the checklist name first, then add fields.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const payload = {
        name: fieldDraft.name.trim(),
        field_type: fieldDraft.field_type,
        is_required: fieldDraft.is_required,
        options: OPTION_CHECKLIST_FIELD_TYPES.has(fieldDraft.field_type)
          ? parseOptions(fieldDraft.optionsText)
          : [],
      }
      if (editingFieldId) {
        await updateChecklistField(template.id, editingFieldId, payload)
      } else {
        await createChecklistField(template.id, payload)
      }
      resetFieldDraft()
      await reloadFields()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const handleDeleteField = async (fieldId) => {
    if (!template?.id) return
    setBusy(true)
    setError(null)
    try {
      await deleteChecklistField(template.id, fieldId)
      if (editingFieldId === fieldId) resetFieldDraft()
      await reloadFields()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const moveField = async (index, direction) => {
    if (!template?.id) return
    const next = [...fields]
    const target = index + direction
    if (target < 0 || target >= next.length) return
    const [row] = next.splice(index, 1)
    next.splice(target, 0, row)
    setFields(next)
    setBusy(true)
    try {
      await reorderChecklistFields(template.id, next.map((field) => field.id))
    } catch (err) {
      setError(err.message)
      await reloadFields()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="company-modal-overlay company-modal-overlay--popup pm-modal-overlay"
      onMouseDown={handleBackdropClick}
      role="presentation"
    >
      <div className="company-modal company-modal--popup pm-modal pm-modal--wide" role="dialog">
        <div className="company-modal__header">
          <PageBack onClick={onClose} label="Back" />
          <h2>{template?.id ? 'Checklist builder' : 'New checklist'}</h2>
          <button type="button" className="company-modal__close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <form className="company-modal__form" onSubmit={handleSaveMeta}>
          <section className="pm-section">
            <h3 className="pm-section__title">Template</h3>
            <div className="company-form__grid company-form__grid--2">
              <label className="company-form__field">
                <span className="company-form__label">Name *</span>
                <input
                  className="company-form__input"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                />
              </label>
              <div className="company-form__field">
                <span className="company-form__label">Active</span>
                <GooToggle
                  checked={form.is_active}
                  onChange={(checked) => setForm({ ...form, is_active: checked })}
                />
              </div>
              <label className="company-form__field company-form__field--full">
                <span className="company-form__label">Description</span>
                <textarea
                  className="company-form__input company-form__textarea"
                  rows={2}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </label>
            </div>
            {template?.version && (
              <p className="pm-section__hint">
                Version {template.version}. Changes apply only to future scheduled work orders.
              </p>
            )}
            <div className="company-modal__actions">
              <button type="submit" className="company-btn company-btn--primary" disabled={saving}>
                {saving ? 'Saving...' : 'Save checklist'}
              </button>
            </div>
          </section>
        </form>

        {template?.id && (
          <div className="company-modal__form">
            <section className="pm-section">
              <h3 className="pm-section__title">Fields</h3>
              <div className="pm-field-list">
                {fields.map((field, index) => (
                  <div key={field.id} className="pm-field-row">
                    <span className="pm-drag" aria-hidden>⋮⋮</span>
                    <div>
                      <div className="pm-field-row__name">{field.name}</div>
                      <div className="pm-field-row__meta">
                        {checklistFieldTypeLabel(field.field_type)}
                        {field.is_required ? ' · Required' : ''}
                      </div>
                    </div>
                    <button type="button" className="company-btn company-btn--secondary company-btn--compact" onClick={() => moveField(index, -1)} disabled={index === 0 || busy}>Up</button>
                    <div className="pm-table-actions">
                      <button type="button" className="company-btn company-btn--secondary company-btn--compact" onClick={() => moveField(index, 1)} disabled={index === fields.length - 1 || busy}>Down</button>
                      <button type="button" className="company-btn company-btn--secondary company-btn--compact company-btn--icon" onClick={() => startEditField(field)} aria-label="Edit field"><EditIcon /></button>
                      <button type="button" className="company-btn company-btn--secondary company-btn--compact company-btn--icon" onClick={() => handleDeleteField(field.id)} aria-label="Delete field"><TrashIcon /></button>
                    </div>
                  </div>
                ))}
                {!fields.length && <p className="pm-section__hint">No fields yet. Add the first inspection step below.</p>}
              </div>
            </section>

            <form className="pm-section" onSubmit={handleSaveField}>
              <h3 className="pm-section__title">{editingFieldId ? 'Edit field' : 'Add field'}</h3>
              <div className="company-form__grid company-form__grid--2">
                <label className="company-form__field">
                  <span className="company-form__label">Field name *</span>
                  <input
                    className="company-form__input"
                    value={fieldDraft.name}
                    onChange={(e) => setFieldDraft({ ...fieldDraft, name: e.target.value })}
                    required
                  />
                </label>
                <label className="company-form__field">
                  <span className="company-form__label">Field type *</span>
                  <FilterableSelect
                    value={fieldDraft.field_type}
                    onChange={(value) => setFieldDraft({ ...fieldDraft, field_type: value })}
                    options={CHECKLIST_FIELD_TYPES}
                    getOptionValue={(row) => row.value}
                    getOptionLabel={(row) => row.label}
                    allowEmpty={false}
                  />
                </label>
                {OPTION_CHECKLIST_FIELD_TYPES.has(fieldDraft.field_type) && (
                  <label className="company-form__field company-form__field--full">
                    <span className="company-form__label">Options (one per line)</span>
                    <textarea
                      className="company-form__input company-form__textarea"
                      rows={4}
                      value={fieldDraft.optionsText}
                      onChange={(e) => setFieldDraft({ ...fieldDraft, optionsText: e.target.value })}
                    />
                  </label>
                )}
                <div className="company-form__field">
                  <span className="company-form__label">Required</span>
                  <GooToggle
                    checked={fieldDraft.is_required}
                    onChange={(checked) => setFieldDraft({ ...fieldDraft, is_required: checked })}
                  />
                </div>
              </div>
              <div className="company-modal__actions">
                {editingFieldId && (
                  <button type="button" className="company-btn company-btn--secondary" onClick={resetFieldDraft}>Cancel edit</button>
                )}
                <button type="submit" className="company-btn company-btn--primary" disabled={busy}>
                  {editingFieldId ? 'Update field' : 'Add field'}
                </button>
              </div>
            </form>
          </div>
        )}

        {error && <p className="company-alert" style={{ margin: '0 20px 16px' }}>{error}</p>}
      </div>
    </div>
  )
}
