import { useEffect, useMemo, useState } from 'react'
import { useBackdropClose } from '../../hooks/useBackdropClose'
import PageBack from '../shared/PageBack'
import GooToggle from '../ui/GooToggle'
import { fieldTypeLabel } from '../../lib/assetFieldTypes'
import { reorderItemsById } from '../../lib/assetFormSchema'
import '../dashboard/CreateWorkOrderModal.css'
import '../company/CompanyShared.css'
import './ManualWorkOrder.css'

function DragHandle() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <circle cx="4.5" cy="3.5" r="1" fill="currentColor" />
      <circle cx="9.5" cy="3.5" r="1" fill="currentColor" />
      <circle cx="4.5" cy="7" r="1" fill="currentColor" />
      <circle cx="9.5" cy="7" r="1" fill="currentColor" />
      <circle cx="4.5" cy="10.5" r="1" fill="currentColor" />
      <circle cx="9.5" cy="10.5" r="1" fill="currentColor" />
    </svg>
  )
}

export default function WorkOrderFieldSettingsModal({
  settings,
  loading,
  saving,
  onClose,
  onSave,
}) {
  const [local, setLocal] = useState([])
  const [initialOrderKey, setInitialOrderKey] = useState('')
  const [draggingId, setDraggingId] = useState(null)
  const [dropTargetId, setDropTargetId] = useState(null)
  const handleBackdropClick = useBackdropClose(onClose)

  useEffect(() => {
    if (settings?.sections) {
      const next = JSON.parse(JSON.stringify(settings.sections))
      setLocal(next)
      setInitialOrderKey(next.map((section) => section.id).join(','))
    }
  }, [settings])

  const orderDirty = useMemo(
    () => local.map((section) => section.id).join(',') !== initialOrderKey,
    [local, initialOrderKey],
  )

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

  const handleDragStart = (event, id) => {
    setDraggingId(id)
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', id)
  }

  const handleDragOver = (event, targetId) => {
    if (!draggingId || draggingId === targetId) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    setDropTargetId(targetId)
  }

  const handleDrop = (event, targetId) => {
    event.preventDefault()
    if (!draggingId || draggingId === targetId) return
    const toIndex = local.findIndex((section) => section.id === targetId)
    setLocal((prev) => reorderItemsById(prev, draggingId, toIndex))
    setDraggingId(null)
    setDropTargetId(null)
  }

  const handleDragEnd = () => {
    setDraggingId(null)
    setDropTargetId(null)
  }

  const handleSave = async () => {
    const updates = []
    for (const section of local) {
      updates.push({ field_id: section.id, is_visible: section.is_visible })
      for (const field of section.fields) {
        updates.push({ field_id: field.id, is_visible: field.is_visible })
      }
    }
    await onSave(updates, {
      sectionIds: orderDirty ? local.map((section) => section.id) : undefined,
    })
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
          <div className="modal__header-main">
            <PageBack onClick={onClose} className="page-back--header" />
            <h2 id="wo-settings-title" className="modal__title">Form field settings</h2>
          </div>
          <button type="button" className="modal__close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="wo-settings-modal__body">
          <p className="wo-settings-modal__intro">
            Drag sections to change their order on the manual work order form, and choose which
            fields are visible. Changes apply to everyone in your organization.
          </p>

          {loading && <p className="wo-settings-loading">Loading settings...</p>}

          {!loading && !local.length && (
            <p className="wo-settings-empty">No asset sections found. Create fields under Masters → Assets first.</p>
          )}

          <div className="wo-settings-list">
            {local.map((section) => {
              const isDragging = draggingId === section.id
              const isDropTarget = dropTargetId === section.id && draggingId !== section.id

              return (
                <div
                  key={section.id}
                  className={[
                    'wo-settings-group',
                    isDragging ? 'wo-settings-group--dragging' : '',
                    isDropTarget ? 'wo-settings-group--drop-target' : '',
                  ].filter(Boolean).join(' ')}
                  onDragOver={(event) => handleDragOver(event, section.id)}
                  onDrop={(event) => handleDrop(event, section.id)}
                >
                  <div className="wo-settings-row wo-settings-row--section">
                    <div className="wo-settings-row__lead">
                      <span
                        className="wo-settings-drag"
                        draggable
                        onDragStart={(event) => handleDragStart(event, section.id)}
                        onDragEnd={handleDragEnd}
                        aria-label={`Drag to reorder ${section.name}`}
                        title="Drag to reorder"
                      >
                        <DragHandle />
                      </span>
                      <div>
                        <span className="wo-settings-row__name">{section.name}</span>
                        <span className="wo-settings-row__meta">Section · drag to reorder</span>
                      </div>
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
              )
            })}
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
