import { useEffect, useState } from 'react'
import { useBackdropClose } from '../../hooks/useBackdropClose'
import PageBack from '../shared/PageBack'
import GooToggle from '../ui/GooToggle'
import EditIcon from '../ui/EditIcon'
import TrashIcon from '../ui/TrashIcon'
import {
  getPmActivityTypes,
  createPmActivityType,
  updatePmActivityType,
  deletePmActivityType,
} from '../../lib/api-pm'
import '../company/CompanyShared.css'
import './Pm.css'

export default function PmActivityTypesModal({ onClose }) {
  const [rows, setRows] = useState([])
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [editing, setEditing] = useState(null)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const handleBackdropClick = useBackdropClose(onClose)

  const load = async () => {
    const data = await getPmActivityTypes({ includeInactive: true })
    setRows(data || [])
  }

  useEffect(() => {
    load().catch((err) => setError(err.message))
  }, [])

  const resetDraft = () => {
    setEditing(null)
    setName('')
    setDescription('')
  }

  const handleSave = async (event) => {
    event.preventDefault()
    setSaving(true)
    setError(null)
    try {
      if (editing) {
        await updatePmActivityType(editing.id, { name: name.trim(), description: description.trim() })
      } else {
        await createPmActivityType({ name: name.trim(), description: description.trim() })
      }
      resetDraft()
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (row) => {
    setError(null)
    try {
      await updatePmActivityType(row.id, { is_active: !row.is_active })
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  const handleDelete = async (row) => {
    setError(null)
    try {
      await deletePmActivityType(row.id)
      if (editing?.id === row.id) resetDraft()
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div
      className="company-modal-overlay company-modal-overlay--popup pm-modal-overlay"
      onMouseDown={handleBackdropClick}
      role="presentation"
    >
      <div className="company-modal company-modal--popup pm-modal" role="dialog">
        <div className="company-modal__header">
          <PageBack onClick={onClose} label="Back" />
          <h2>Maintenance activity types</h2>
          <button type="button" className="company-modal__close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="company-modal__form">
          <p className="pm-section__hint">
            System types can be deactivated. Add custom types without a software change.
          </p>
          <div className="pm-field-list">
            {rows.map((row) => (
              <div key={row.id} className="pm-field-row">
                <span />
                <div>
                  <div className="pm-field-row__name">{row.name}</div>
                  <div className="pm-field-row__meta">{row.description || (row.is_system ? 'System type' : 'Custom')}</div>
                </div>
                <GooToggle checked={row.is_active} onChange={() => toggleActive(row)} />
                <div className="pm-table-actions">
                  <button
                    type="button"
                    className="company-btn company-btn--secondary company-btn--compact company-btn--icon"
                    onClick={() => {
                      setEditing(row)
                      setName(row.name)
                      setDescription(row.description || '')
                    }}
                    aria-label="Edit"
                  >
                    <EditIcon />
                  </button>
                  {!row.is_system && (
                    <button type="button" className="company-btn company-btn--secondary company-btn--compact company-btn--icon" onClick={() => handleDelete(row)} aria-label="Delete">
                      <TrashIcon />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <form className="pm-section" onSubmit={handleSave}>
            <h3 className="pm-section__title">{editing ? 'Edit type' : 'Add type'}</h3>
            <div className="company-form__grid company-form__grid--2">
              <label className="company-form__field">
                <span className="company-form__label">Name *</span>
                <input className="company-form__input" value={name} onChange={(e) => setName(e.target.value)} required />
              </label>
              <label className="company-form__field">
                <span className="company-form__label">Description</span>
                <input className="company-form__input" value={description} onChange={(e) => setDescription(e.target.value)} />
              </label>
            </div>
            {error && <p className="company-alert">{error}</p>}
            <div className="company-modal__actions">
              {editing && (
                <button type="button" className="company-btn company-btn--secondary" onClick={resetDraft}>Cancel</button>
              )}
              <button type="submit" className="company-btn company-btn--primary" disabled={saving}>
                {editing ? 'Update' : 'Add'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
