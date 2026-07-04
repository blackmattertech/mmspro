import { useEffect, useMemo, useState } from 'react'
import { useBackdropClose } from '../../hooks/useBackdropClose'
import WorkOrderForm from '../workorders/WorkOrderForm'
import { buildAssetFormSchema, reorderItemsById } from '../../lib/assetFormSchema'
import '../company/CompanyShared.css'
import '../workorders/ManualWorkOrder.css'
import './AssetFormLayoutModal.css'

function DragHandle() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true" className="asset-layout-drag-handle">
      <circle cx="4.5" cy="3.5" r="1" fill="currentColor" />
      <circle cx="9.5" cy="3.5" r="1" fill="currentColor" />
      <circle cx="4.5" cy="7" r="1" fill="currentColor" />
      <circle cx="9.5" cy="7" r="1" fill="currentColor" />
      <circle cx="4.5" cy="10.5" r="1" fill="currentColor" />
      <circle cx="9.5" cy="10.5" r="1" fill="currentColor" />
    </svg>
  )
}

export default function AssetFormLayoutModal({
  fields,
  saving,
  onClose,
  onSave,
}) {
  const handleBackdropClick = useBackdropClose(onClose)
  const [error, setError] = useState(null)
  const [previewValues, setPreviewValues] = useState({})
  const [draggingId, setDraggingId] = useState(null)
  const [dropTargetId, setDropTargetId] = useState(null)

  const initialSections = useMemo(
    () => (fields || [])
      .filter((field) => field.kind === 'section')
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name)),
    [fields],
  )

  const [orderedSections, setOrderedSections] = useState(initialSections)

  useEffect(() => {
    setOrderedSections(initialSections)
  }, [initialSections])

  const orderedSectionIds = useMemo(
    () => orderedSections.map((section) => section.id),
    [orderedSections],
  )

  const previewSchema = useMemo(
    () => buildAssetFormSchema(fields, orderedSectionIds, { activeOnly: true }),
    [fields, orderedSectionIds],
  )

  const parentCountForSection = (sectionId) => (
    (fields || []).filter(
      (field) => field.kind === 'parent'
        && field.section_id === sectionId
        && field.is_active !== false,
    ).length
  )

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

    const toIndex = orderedSections.findIndex((section) => section.id === targetId)
    setOrderedSections((prev) => reorderItemsById(prev, draggingId, toIndex))
    setDraggingId(null)
    setDropTargetId(null)
  }

  const handleDragEnd = () => {
    setDraggingId(null)
    setDropTargetId(null)
  }

  const handlePreviewChange = (fieldId, value) => {
    setPreviewValues((prev) => ({ ...prev, [fieldId]: value }))
  }

  const isDirty = useMemo(() => {
    const currentIds = orderedSections.map((section) => section.id).join(',')
    const initialIds = initialSections.map((section) => section.id).join(',')
    return currentIds !== initialIds
  }, [orderedSections, initialSections])

  const handleSave = async () => {
    setError(null)
    try {
      await onSave(orderedSectionIds)
      onClose()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="company-modal-overlay" onMouseDown={handleBackdropClick} role="presentation">
      <div
        className="company-modal asset-layout-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="asset-layout-modal-title"
      >
        <div className="company-modal__header">
          <h2 id="asset-layout-modal-title">Arrange form layout</h2>
          <button type="button" className="company-modal__close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="asset-layout-modal__body">
          <div className="asset-layout-modal__editor">
            <div className="asset-layout-modal__panel-head">
              <h3>Sections</h3>
              <p>Drag to set the order sections appear on asset and work order forms.</p>
            </div>

            {!orderedSections.length ? (
              <div className="asset-layout-modal__empty">
                No sections yet. Add a section first, then return here to arrange the form.
              </div>
            ) : (
              <ul className="asset-layout-sections">
                {orderedSections.map((section, index) => {
                  const isDragging = draggingId === section.id
                  const isDropTarget = dropTargetId === section.id && draggingId !== section.id
                  const fieldCount = parentCountForSection(section.id)
                  const isInactive = section.is_active === false

                  return (
                    <li
                      key={section.id}
                      className={[
                        'asset-layout-sections__item',
                        isDragging ? 'asset-layout-sections__item--dragging' : '',
                        isDropTarget ? 'asset-layout-sections__item--drop-target' : '',
                        isInactive ? 'asset-layout-sections__item--inactive' : '',
                      ].filter(Boolean).join(' ')}
                      onDragOver={(event) => handleDragOver(event, section.id)}
                      onDrop={(event) => handleDrop(event, section.id)}
                    >
                      <span
                        className="asset-layout-sections__handle"
                        draggable
                        onDragStart={(event) => handleDragStart(event, section.id)}
                        onDragEnd={handleDragEnd}
                        aria-label={`Drag to reorder ${section.name}`}
                      >
                        <DragHandle />
                      </span>
                      <div className="asset-layout-sections__meta">
                        <span className="asset-layout-sections__order">{index + 1}</span>
                        <div className="asset-layout-sections__text">
                          <span className="asset-layout-sections__name">{section.name}</span>
                          <span className="asset-layout-sections__count">
                            {fieldCount} field{fieldCount === 1 ? '' : 's'}
                            {isInactive ? ' · Inactive' : ''}
                          </span>
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          <div className="asset-layout-modal__preview">
            <div className="asset-layout-modal__panel-head">
              <h3>Form preview</h3>
              <p>Live preview of active sections and fields in the chosen order.</p>
            </div>
            <div className="asset-layout-modal__preview-scroll">
              <WorkOrderForm
                schema={previewSchema}
                values={previewValues}
                onChange={handlePreviewChange}
                disabled={false}
              />
            </div>
          </div>
        </div>

        {error && <div className="company-alert asset-layout-modal__error">{error}</div>}

        <div className="company-modal__actions asset-layout-modal__actions">
          <button type="button" className="company-btn company-btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="company-btn company-btn--primary"
            onClick={handleSave}
            disabled={saving || !orderedSections.length || !isDirty}
          >
            {saving ? 'Saving…' : 'Save order'}
          </button>
        </div>
      </div>
    </div>
  )
}
