import { useEffect, useState } from 'react'
import { useBackdropClose } from '../../hooks/useBackdropClose'
import GooToggle from '../ui/GooToggle'
import { fieldTypeLabel } from '../../lib/assetFieldTypes'
import '../dashboard/CreateWorkOrderModal.css'
import '../company/CompanyShared.css'
import './ManualWorkOrder.css'

export default function WorkOrderFieldSettingsModal({
  settings,
  loading,
  saving,
  onClose,
  onSave,
}) {
  const [local, setLocal] = useState([])
  const handleBackdropClick = useBackdropClose(onClose)

  useEffect(() => {
    if (settings?.sections) {
      setLocal(JSON.parse(JSON.stringify(settings.sections)))
    }
  }, [settings])

  const toggleSection = (sectionId, visible) => {
    setLocal((prev) => prev.map((section) => {
      if (section.id !== sectionId) return section
      return {
        ...section,
        is_visible: visible,
        fields: section.fields.map((f) => ({ ...f, is_visible: visible })),
      }
    }))
  }

  const toggleField = (sectionId, fieldId, visible) => {
    setLocal((prev) => prev.map((section) => {
      if (section.id !== sectionId) return section
      const fields = section.fields.map((f) => (
        f.id === fieldId ? { ...f, is_visible: visible } : f
      ))
      const sectionVisible = fields.some((f) => f.is_visible)
      return { ...section, is_visible: sectionVisible, fields }
    }))
  }

  const handleSave = async () => {
    const updates = []
    for (const section of local) {
      updates.push({ field_id: section.id, is_visible: section.is_visible })
      for (const field of section.fields) {
        updates.push({ field_id: field.id, is_visible: field.is_visible })
      }
    }
    await onSave(updates)
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={handleBackdropClick} role="presentation">
      <div
        className="modal wo-settings-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="wo-settings-title"
      >
        <div className="modal__header">
          <h2 id="wo-settings-title" className="modal__title">Form field settings</h2>
          <button type="button" className="modal__close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="wo-settings-modal__body">
          <p className="wo-settings-modal__intro">
            Choose which asset fields appear on the manual work order form for this company.
            Changes apply to everyone in your organization.
          </p>

          {loading && <p className="wo-settings-loading">Loading settings...</p>}

          {!loading && !local.length && (
            <p className="wo-settings-empty">No asset sections found. Create fields under Masters → Assets first.</p>
          )}

          <div className="wo-settings-list">
            {local.map((section) => (
              <div key={section.id} className="wo-settings-group">
                <div className="wo-settings-row wo-settings-row--section">
                  <div>
                    <span className="wo-settings-row__name">{section.name}</span>
                    <span className="wo-settings-row__meta">Section</span>
                  </div>
                  <GooToggle
                    checked={section.is_visible}
                    onChange={(v) => toggleSection(section.id, v)}
                    ariaLabel={`Toggle ${section.name} section`}
                  />
                </div>

                {section.fields.map((field) => (
                  <div key={field.id} className="wo-settings-row wo-settings-row--field">
                    <div>
                      <span className="wo-settings-row__name">{field.name}</span>
                      <span className="wo-settings-row__meta">{fieldTypeLabel(field.field_type)}</span>
                    </div>
                    <GooToggle
                      checked={field.is_visible}
                      onChange={(v) => toggleField(section.id, field.id, v)}
                      ariaLabel={`Toggle ${field.name} field`}
                    />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>

        <div className="modal__actions wo-settings-modal__actions">
          <button type="button" className="company-btn company-btn--secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="company-btn company-btn--primary"
            onClick={handleSave}
            disabled={saving || loading}
          >
            {saving ? 'Saving...' : 'Save settings'}
          </button>
        </div>
      </div>
    </div>
  )
}
