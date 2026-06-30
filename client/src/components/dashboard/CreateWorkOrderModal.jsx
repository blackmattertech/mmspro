import { useState } from 'react'
import './CreateWorkOrderModal.css'

export default function CreateWorkOrderModal({ plants, onClose, onSubmit }) {
  const [title, setTitle] = useState('')
  const [plantId, setPlantId] = useState(plants[0]?.id || '')
  const [priority, setPriority] = useState('medium')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { error: submitError } = await onSubmit({ title, plantId, priority })
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
            <label htmlFor="wo-plant">Plant</label>
            <select id="wo-plant" value={plantId} onChange={(e) => setPlantId(e.target.value)}>
              {plants.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <div className="modal__field">
            <label htmlFor="wo-priority">Priority</label>
            <select id="wo-priority" value={priority} onChange={(e) => setPriority(e.target.value)}>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>

          <div className="modal__actions">
            <button type="button" className="modal__btn modal__btn--secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="modal__btn modal__btn--primary" disabled={loading}>
              {loading ? 'Creating...' : 'Create Work Order'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
