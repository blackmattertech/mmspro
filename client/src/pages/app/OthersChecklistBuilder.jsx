import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { useOrg } from '../../hooks/useOrg'
import { usePermissions } from '../../hooks/usePermissions'
import { isCompanyAdmin, canManageOrg } from '../../lib/accountRoles'
import { orgPath } from '../../config/navigation'
import {
  CHECKLIST_FIELD_PRESETS,
  OPTION_CHECKLIST_FIELD_TYPES,
} from '../../config/pm'
import {
  getChecklistTemplate,
  createChecklistTemplate,
  updateChecklistTemplate,
  createChecklistSection,
  updateChecklistSection,
  deleteChecklistSection,
  createChecklistField,
  updateChecklistField,
  deleteChecklistField,
  reorderChecklistFields,
} from '../../lib/api-pm'
import PageBack from '../../components/shared/PageBack'
import EditIcon from '../../components/ui/EditIcon'
import TrashIcon from '../../components/ui/TrashIcon'
import GooToggle from '../../components/ui/GooToggle'
import '../../components/company/CompanyShared.css'
import './Others.css'
import './OthersChecklistBuilder.css'

function presetForField(field) {
  if (!field) return CHECKLIST_FIELD_PRESETS[0]
  const options = (field.options || []).join('|').toLowerCase()
  const match = CHECKLIST_FIELD_PRESETS.find((preset) => {
    if (preset.field_type !== field.field_type) return false
    if (!preset.options?.length) return preset.id === field.field_type
    return preset.options.join('|').toLowerCase() === options
  })
  return match || CHECKLIST_FIELD_PRESETS.find((p) => p.field_type === field.field_type) || CHECKLIST_FIELD_PRESETS[0]
}

function emptyFieldDraft(preset = CHECKLIST_FIELD_PRESETS[0]) {
  return {
    name: '',
    presetId: preset.id,
    field_type: preset.field_type,
    optionsText: (preset.options || []).join('\n'),
    is_required: false,
  }
}

function parseOptions(text) {
  return String(text || '')
    .split(/[\n\r,;]+/)
    .map((value) => value.trim())
    .filter(Boolean)
}

export default function OthersChecklistBuilder() {
  const { checklistId } = useParams()
  const isNew = !checklistId || checklistId === 'new'
  const navigate = useNavigate()
  const { org } = useOrg()
  const { role } = useAuth()
  const { canCreate, canUpdate } = usePermissions()
  const canManage = (
    isCompanyAdmin(role)
    || canManageOrg(role)
    || canCreate('work_orders_scheduled')
    || canUpdate('work_orders_scheduled')
    || canCreate('work_orders')
    || canUpdate('work_orders')
  )

  const [template, setTemplate] = useState(null)
  const [form, setForm] = useState({ name: '', description: '', is_active: true })
  const [sections, setSections] = useState([])
  const [selectedSectionId, setSelectedSectionId] = useState(null)
  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [sectionNameDraft, setSectionNameDraft] = useState('')
  const [fieldDraft, setFieldDraft] = useState(emptyFieldDraft())
  const [editingFieldId, setEditingFieldId] = useState(null)

  const backTo = org?.slug ? orgPath(org.slug, 'masters/others/checklists') : '#'

  const applyDetail = useCallback((detail) => {
    setTemplate(detail)
    setForm({
      name: detail?.name || '',
      description: detail?.description || '',
      is_active: detail?.is_active !== false,
    })
    const nextSections = detail?.sections || []
    setSections(nextSections)
    setSelectedSectionId((prev) => {
      if (prev && nextSections.some((s) => s.id === prev)) return prev
      return nextSections[0]?.id || null
    })
  }, [])

  const reload = useCallback(async (id) => {
    const detail = await getChecklistTemplate(id)
    applyDetail(detail)
    return detail
  }, [applyDetail])

  useEffect(() => {
    if (isNew) {
      setLoading(false)
      return undefined
    }
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const detail = await getChecklistTemplate(checklistId)
        if (!cancelled) applyDetail(detail)
      } catch (err) {
        if (!cancelled) setError(err.message || 'Could not load checklist')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [checklistId, isNew, applyDetail])

  const selectedSection = useMemo(
    () => sections.find((row) => row.id === selectedSectionId) || null,
    [sections, selectedSectionId],
  )

  const selectedFields = selectedSection?.fields || []
  const totalFields = sections.reduce((sum, section) => sum + (section.fields?.length || 0), 0)

  const ensureSavedTemplate = async () => {
    const name = form.name.trim()
    if (!name) {
      throw new Error('Checklist name is required.')
    }
    setSaving(true)
    try {
      if (template?.id) {
        const updated = await updateChecklistTemplate(template.id, {
          name,
          description: form.description.trim() || null,
          is_active: form.is_active,
        })
        applyDetail({ ...updated, sections })
        return updated
      }
      const created = await createChecklistTemplate({
        name,
        description: form.description.trim() || null,
        is_active: form.is_active,
      })
      applyDetail(created)
      if (org?.slug) {
        navigate(orgPath(org.slug, `masters/others/checklists/${created.id}`), { replace: true })
      }
      return created
    } finally {
      setSaving(false)
    }
  }

  const handleSaveMeta = async (event) => {
    event.preventDefault()
    if (!canManage) return
    setError(null)
    try {
      await ensureSavedTemplate()
    } catch (err) {
      setError(err.message)
    }
  }

  const handleAddSection = async () => {
    if (!canManage) return
    setError(null)
    setBusy(true)
    try {
      const saved = await ensureSavedTemplate()
      const name = sectionNameDraft.trim() || `Section ${(sections.length || 0) + 1}`
      const section = await createChecklistSection(saved.id, { name })
      setSectionNameDraft('')
      const detail = await reload(saved.id)
      setSelectedSectionId(section.id || detail.sections?.[detail.sections.length - 1]?.id || null)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const handleRenameSection = async (section) => {
    const name = window.prompt('Section name', section.name)
    if (name == null) return
    const trimmed = name.trim()
    if (!trimmed || !template?.id) return
    setBusy(true)
    setError(null)
    try {
      await updateChecklistSection(template.id, section.id, { name: trimmed })
      await reload(template.id)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const handleDeleteSection = async (section) => {
    if (!template?.id) return
    if (!window.confirm(`Delete section "${section.name}" and its fields?`)) return
    setBusy(true)
    setError(null)
    try {
      await deleteChecklistSection(template.id, section.id)
      await reload(template.id)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const applyPreset = (presetId) => {
    const preset = CHECKLIST_FIELD_PRESETS.find((row) => row.id === presetId) || CHECKLIST_FIELD_PRESETS[0]
    setFieldDraft((prev) => ({
      ...prev,
      presetId: preset.id,
      field_type: preset.field_type,
      optionsText: (preset.options || []).join('\n'),
    }))
  }

  const startEditField = (field) => {
    const preset = presetForField(field)
    setEditingFieldId(field.id)
    setFieldDraft({
      name: field.name,
      presetId: preset.id,
      field_type: field.field_type,
      optionsText: (field.options || []).join('\n'),
      is_required: Boolean(field.is_required),
    })
  }

  const resetFieldDraft = () => {
    setEditingFieldId(null)
    setFieldDraft(emptyFieldDraft())
  }

  const handleSaveField = async (event) => {
    event?.preventDefault?.()
    if (!canManage) return
    if (!selectedSectionId) {
      setError('Select or add a section first.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const saved = await ensureSavedTemplate()
      const preset = CHECKLIST_FIELD_PRESETS.find((row) => row.id === fieldDraft.presetId)
      const fieldType = preset?.field_type || fieldDraft.field_type
      const options = OPTION_CHECKLIST_FIELD_TYPES.has(fieldType)
        ? (preset?.options?.length ? preset.options : parseOptions(fieldDraft.optionsText))
        : []
      const payload = {
        name: fieldDraft.name.trim() || 'Inspection item',
        field_type: fieldType,
        options,
        is_required: Boolean(fieldDraft.is_required),
        section_id: selectedSectionId,
      }
      if (editingFieldId) {
        await updateChecklistField(saved.id, editingFieldId, payload)
      } else {
        await createChecklistField(saved.id, payload)
      }
      resetFieldDraft()
      await reload(saved.id)
      setSelectedSectionId(selectedSectionId)
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
      await reload(template.id)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const moveField = async (index, direction) => {
    if (!template?.id || !selectedSection) return
    const next = [...selectedFields]
    const target = index + direction
    if (target < 0 || target >= next.length) return
    const [row] = next.splice(index, 1)
    next.splice(target, 0, row)
    setBusy(true)
    try {
      await reorderChecklistFields(template.id, next.map((field) => field.id))
      await reload(template.id)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const needsCustomOptions = fieldDraft.field_type === 'dropdown'
    && !(CHECKLIST_FIELD_PRESETS.find((p) => p.id === fieldDraft.presetId)?.options?.length)

  if (loading) {
    return (
      <div className="company-page">
        <div className="company-loading">Loading checklist…</div>
      </div>
    )
  }

  return (
    <div className="company-page others-page checklist-builder-page">
      <header className="company-page__header">
        <PageBack to={backTo} label="Checklists" />
        <div className="others-manage__header-row">
          <div>
            <h1 className="company-page__title">
              {template?.id ? 'Checklist builder' : 'New checklist'}
            </h1>
            <p className="company-page__subtitle">
              Name the checklist, add sections, then define inspection fields and types.
            </p>
          </div>
        </div>
      </header>

      <div className="company-page__content">
      {error && <div className="company-alert">{error}</div>}
      {!canManage && (
        <p className="company-readonly-note">Read-only. Contact a company admin to edit.</p>
      )}

      <div className="checklist-builder">
        <aside className="checklist-builder__sidebar">
          <form className="checklist-builder__meta" onSubmit={handleSaveMeta}>
            <label className="company-form__field">
              <span className="company-form__label">Checklist title *</span>
              <input
                className="company-form__input"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Enter checklist title"
                disabled={!canManage || saving}
                required
              />
            </label>
            <label className="company-form__field">
              <span className="company-form__label">Checklist description</span>
              <textarea
                className="company-form__input company-form__textarea"
                rows={3}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Enter checklist description"
                disabled={!canManage || saving}
              />
            </label>
            <div className="company-form__field">
              <span className="company-form__label">Active</span>
              <GooToggle
                checked={form.is_active}
                onChange={(checked) => setForm({ ...form, is_active: checked })}
                disabled={!canManage || saving}
              />
            </div>
            {canManage && (
              <button type="submit" className="company-btn company-btn--secondary" disabled={saving || busy}>
                {saving ? 'Saving…' : template?.id ? 'Save details' : 'Create checklist'}
              </button>
            )}
          </form>

          <div className="checklist-builder__sections">
            <div className="checklist-builder__sections-head">
              <h3>Sections</h3>
              {canManage && (
                <div className="checklist-builder__section-add">
                  <input
                    className="company-form__input"
                    value={sectionNameDraft}
                    onChange={(e) => setSectionNameDraft(e.target.value)}
                    placeholder="New section name"
                    disabled={busy}
                  />
                  <button
                    type="button"
                    className="company-btn company-btn--primary company-btn--compact"
                    onClick={handleAddSection}
                    disabled={busy}
                  >
                    + Add section
                  </button>
                </div>
              )}
            </div>

            {!sections.length ? (
              <p className="checklist-builder__empty">No sections yet. Add a section to start adding fields.</p>
            ) : (
              <ul className="checklist-builder__section-list">
                {sections.map((section, index) => {
                  const active = section.id === selectedSectionId
                  return (
                    <li key={section.id}>
                      <button
                        type="button"
                        className={`checklist-builder__section-card${active ? ' is-active' : ''}`}
                        onClick={() => setSelectedSectionId(section.id)}
                      >
                        <span className="checklist-builder__section-index">{index + 1}</span>
                        <span className="checklist-builder__section-copy">
                          <strong>{section.name}</strong>
                          <span>{section.fields?.length || 0} items</span>
                        </span>
                      </button>
                      {canManage && (
                        <span className="checklist-builder__section-actions">
                          <button
                            type="button"
                            className="company-btn company-btn--secondary company-btn--compact company-btn--icon"
                            onClick={() => handleRenameSection(section)}
                            aria-label={`Rename ${section.name}`}
                            disabled={busy}
                          >
                            <EditIcon />
                          </button>
                          <button
                            type="button"
                            className="company-btn company-btn--danger company-btn--compact company-btn--icon"
                            onClick={() => handleDeleteSection(section)}
                            aria-label={`Delete ${section.name}`}
                            disabled={busy}
                          >
                            <TrashIcon />
                          </button>
                        </span>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </aside>

        <section className="checklist-builder__main">
          <div className="checklist-builder__main-head">
            <h3>Checklist items</h3>
            <p>
              {selectedSection
                ? `Add items for “${selectedSection.name}”.`
                : 'Select a section to add inspection items.'}
            </p>
          </div>

          {!selectedSection ? (
            <div className="checklist-builder__empty-panel">
              Create and select a section to manage fields.
            </div>
          ) : (
            <>
              <div className="checklist-builder__items">
                {selectedFields.map((field, index) => (
                  <div key={field.id} className="checklist-builder__item-row">
                    <span className="checklist-builder__item-index">{index + 1}</span>
                    <span className="checklist-builder__item-name">{field.name}</span>
                    <span className="checklist-builder__item-type">
                      {presetForField(field).label}
                      {field.is_required ? ' · Required' : ''}
                    </span>
                    {canManage && (
                      <span className="checklist-builder__item-actions">
                        <button type="button" className="company-btn company-btn--secondary company-btn--compact" onClick={() => startEditField(field)} disabled={busy}>
                          Edit
                        </button>
                        <button type="button" className="company-btn company-btn--secondary company-btn--compact" onClick={() => moveField(index, -1)} disabled={busy || index === 0}>
                          ↑
                        </button>
                        <button type="button" className="company-btn company-btn--secondary company-btn--compact" onClick={() => moveField(index, 1)} disabled={busy || index === selectedFields.length - 1}>
                          ↓
                        </button>
                        <button type="button" className="company-btn company-btn--danger company-btn--compact company-btn--icon" onClick={() => handleDeleteField(field.id)} disabled={busy} aria-label="Delete field">
                          <TrashIcon />
                        </button>
                      </span>
                    )}
                  </div>
                ))}
                {!selectedFields.length && (
                  <p className="checklist-builder__empty">No items in this section yet.</p>
                )}
              </div>

              {canManage && (
                <form className="checklist-builder__field-form" onSubmit={handleSaveField}>
                  <h4>{editingFieldId ? 'Edit item' : 'Add inspection item'}</h4>
                  <div className="checklist-builder__field-grid">
                    <label className="company-form__field">
                      <span className="company-form__label">Item name *</span>
                      <input
                        className="company-form__input"
                        value={fieldDraft.name}
                        onChange={(e) => setFieldDraft({ ...fieldDraft, name: e.target.value })}
                        placeholder="Inspection item"
                        required
                        disabled={busy}
                      />
                    </label>
                    <label className="company-form__field">
                      <span className="company-form__label">Field type *</span>
                      <select
                        className="company-form__input"
                        value={fieldDraft.presetId}
                        onChange={(e) => applyPreset(e.target.value)}
                        disabled={busy}
                      >
                        {CHECKLIST_FIELD_PRESETS.map((preset) => (
                          <option key={preset.id} value={preset.id}>{preset.label}</option>
                        ))}
                      </select>
                    </label>
                    <label className="company-form__field company-form__check">
                      <input
                        type="checkbox"
                        checked={fieldDraft.is_required}
                        onChange={(e) => setFieldDraft({ ...fieldDraft, is_required: e.target.checked })}
                        disabled={busy}
                      />
                      <span>Required</span>
                    </label>
                  </div>
                  {needsCustomOptions && (
                    <label className="company-form__field">
                      <span className="company-form__label">Dropdown options (one per line)</span>
                      <textarea
                        className="company-form__input company-form__textarea"
                        rows={3}
                        value={fieldDraft.optionsText}
                        onChange={(e) => setFieldDraft({ ...fieldDraft, optionsText: e.target.value })}
                        placeholder={'Option A\nOption B'}
                        disabled={busy}
                      />
                    </label>
                  )}
                  <div className="checklist-builder__field-actions">
                    {editingFieldId && (
                      <button type="button" className="company-btn company-btn--secondary" onClick={resetFieldDraft} disabled={busy}>
                        Cancel edit
                      </button>
                    )}
                    <button type="submit" className="company-btn company-btn--primary" disabled={busy}>
                      {busy ? 'Saving…' : editingFieldId ? 'Update item' : '+ Add inspection item'}
                    </button>
                  </div>
                </form>
              )}
            </>
          )}
        </section>
      </div>

      <footer className="checklist-builder__footer">
        <span>{sections.length} sections · {totalFields} items</span>
        <button
          type="button"
          className="company-btn company-btn--secondary"
          onClick={() => org?.slug && navigate(backTo)}
        >
          Done
        </button>
      </footer>
      </div>
    </div>
  )
}
