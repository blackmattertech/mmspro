import { useState } from 'react'
import FilterableSelect from '../ui/FilterableSelect'
import '../company/CompanyShared.css'
import './CreateWorkOrderModal.css'

export default function CreateWorkOrderModal({
  locations = [],
  defaultLocationId,
  locationLocked = false,
  onClose,
  onSubmit,
}) {
  const [title, setTitle] = useState('')
  const [locationId, setLocationId] = useState(defaultLocationId || locations[0]?.id || '')
  const [priority, setPriority] = useState('medium')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { error: submitError } = await onSubmit({ title, locationId, priority })
    setLoading(false)
    if (submitError) setError(submitError.message)
  }

  return (
    <div className="modal-overlay" onClick={onClose} role="presentation">
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-labelledby="modal-title">
        <div className="modal__header">
          <h2 id="modal-title" className="modal__title">Create Work Order</h2>
          <button type="button" className="modal__close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <form className="modal__form" onSubmit={handleSubmit}>
          {error && <p className="modal__error">{error}</p>}

          <div className="modal__field">
            <label htmlFor="wo-title">Title</label>
            <input
              id="wo-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Describe the maintenance task"
              required
            />
          </div>

          <div className="modal__field">
            <label htmlFor="wo-location">Location</label>
            <FilterableSelect
              id="wo-location"
              value={locationId}
              onChange={setLocationId}
              options={locations}
              getOptionValue={(loc) => loc.id}
              getOptionLabel={(loc) => loc.name}
              disabled={locationLocked || !locations.length}
              required
              allowEmpty={false}
              placeholder={locations.length ? 'Select location…' : 'No locations available'}
            />
          </div>

          <div className="modal__field">
            <label htmlFor="wo-priority">Priority</label>
            <FilterableSelect
              id="wo-priority"
              value={priority}
              onChange={setPriority}
              options={[
                { value: 'high', label: 'High' },
                { value: 'medium', label: 'Medium' },
                { value: 'low', label: 'Low' },
              ]}
              getOptionValue={(opt) => opt.value}
              getOptionLabel={(opt) => opt.label}
              allowEmpty={false}
            />
          </div>

          <div className="modal__actions">
            <button type="button" className="modal__btn modal__btn--secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="modal__btn modal__btn--primary" disabled={loading || !locationId}>
              {loading ? 'Creating...' : 'Create Work Order'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
