import { useEffect, useMemo, useRef, useState } from 'react'
import { useBackdropClose } from '../../hooks/useBackdropClose'
import { useOrg } from '../../hooks/useOrg'
import PageBack from '../shared/PageBack'
import GooToggle from '../ui/GooToggle'
import SectionIconUpload from './SectionIconUpload'
import CreatableSelect from '../company/CreatableSelect'
import FilterableSelect from '../ui/FilterableSelect'
import {
  ASSET_FIELD_TYPES,
  fieldTypeLabel,
  fieldTypeSupportsOptions,
  nextSortOrder,
} from '../../lib/assetFieldTypes'
import { parseDependsOnOptions } from '../../lib/assetFieldDependencies'
import {
  assetFieldDraftKey,
  clearFormDraft,
  readFormDraft,
  writeFormDraft,
} from '../../lib/formDraftStorage'
import { INFO_BUTTON_ICON_SRC } from '../../lib/infoIcon'
import '../company/CompanyShared.css'
import './AssetsFields.css'

const EMPTY = {
  name: '',
  is_section: true,
  is_parent: false,
  parent_id: '',
  section_id: '',
  field_type: 'text',
  sort_order: 0,
  is_required: false,
  dropdown_options: [''],
  is_dependent: false,
  dependency_section_id: '',
  depends_on_parent_id: '',
  depends_on_options: [],
}

function defaultsForMode(mode) {
  if (mode === 'section') {
    return { ...EMPTY, is_section: true, is_parent: false }
  }
  if (mode === 'child') {
    return { ...EMPTY, is_section: false, is_parent: false }
  }
  if (mode === 'parent') {
    return { ...EMPTY, is_section: false, is_parent: true }
  }
  // Add Field (all): Section on by default
  return { ...EMPTY, is_section: true, is_parent: false }
}

function formFromField(field, parents) {
  const depParent = parents.find((parent) => parent.id === field.depends_on_parent_id)
  return {
    name: field.name || '',
    is_section: field.kind === 'section',
    is_parent: field.kind === 'parent',
    section_id: field.section_id || '',
    field_type: field.field_type || 'text',
    sort_order: field.sort_order ?? 0,
    is_required: Boolean(field.is_required),
    dropdown_options: field.dropdown_options?.length
      ? [...field.dropdown_options]
      : [''],
    is_dependent: Boolean(field.depends_on_parent_id),
    dependency_section_id: depParent?.section_id || '',
    depends_on_parent_id: field.depends_on_parent_id || '',
    depends_on_options: parseDependsOnOptions(field.depends_on_option),
  }
}

function parseBulkFieldOptions(text) {
  const parts = String(text || '')
    .split(/[\n\r,;\t]+/)
    .map((value) => value.trim())
    .filter(Boolean)
  const seen = new Set()
  const unique = []
  for (const value of parts) {
    const key = value.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(value)
  }
  return unique
}

function mergeFieldOptionLists(existing, incoming, { replace = false } = {}) {
  const base = replace ? [] : (existing || []).map((o) => String(o).trim()).filter(Boolean)
  const seen = new Set(base.map((o) => o.toLowerCase()))
  const next = [...base]
  for (const value of incoming) {
    const key = value.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    next.push(value)
  }
  return next.length ? next : ['']
}

export default function FieldModal({
  field,
  mode = 'all',
  valuesOnly = false,
  canManageChildren = false,
  canManageSchema = false,
  orgId: orgIdProp,
  sections,
  dependencySections = [],
  parents = [],
  allFields = [],
  saving,
  onClose,
  onSave,
  onCreateSection,
  onRequestCreateSection,
}) {
  const { org } = useOrg()
  const orgId = orgIdProp || org?.id
  const isEdit = Boolean(field?.id)
  const draftKey = assetFieldDraftKey(orgId, { editingId: field?.id, mode })
  const hydratedRef = useRef(false)

  const [form, setForm] = useState(() => defaultsForMode(mode))
  const [error, setError] = useState(null)
  const [iconPreview, setIconPreview] = useState(null)
  const [iconFile, setIconFile] = useState(null)
  const [removeIcon, setRemoveIcon] = useState(false)
  const [bulkPasteText, setBulkPasteText] = useState('')
  const [iconError, setIconError] = useState(null)
  const [creatingSection, setCreatingSection] = useState(false)
  const [extraSections, setExtraSections] = useState([])
  const handleBackdropClick = useBackdropClose(onClose)

  const isSection = form.is_section || field?.kind === 'section'
  const isChild = mode === 'child'

  const sectionList = useMemo(() => {
    const byId = new Map()
    for (const section of [...(sections || []), ...(dependencySections || []), ...extraSections]) {
      if (section?.id) byId.set(section.id, section)
    }
    return [...byId.values()].sort((a, b) => {
      const orderDiff = (a.sort_order ?? 0) - (b.sort_order ?? 0)
      if (orderDiff !== 0) return orderDiff
      return String(a.name || '').localeCompare(String(b.name || ''))
    })
  }, [sections, dependencySections, extraSections])

  const sectionChoices = sectionList
  const canCreateSectionInline = Boolean(
    canManageSchema && (typeof onRequestCreateSection === 'function' || typeof onCreateSection === 'function'),
  )

  const dropdownParents = useMemo(
    () => parents.filter((parent) => (
      parent.kind === 'parent'
      && fieldTypeSupportsOptions(parent.field_type)
      && parent.is_active !== false
    )),
    [parents],
  )

  useEffect(() => {
    hydratedRef.current = false

    if (field) {
      setForm(formFromField(field, parents))
      setIconPreview(field.icon_signed_url || null)
      setIconFile(null)
      setRemoveIcon(false)
      setIconError(null)
      setBulkPasteText('')
      setError(null)
      hydratedRef.current = true
      return
    }

    setIconPreview(null)
    setIconFile(null)
    setRemoveIcon(false)
    setIconError(null)
    setBulkPasteText('')

    const draft = readFormDraft(draftKey)
    if (draft) {
      setForm({
        ...defaultsForMode(mode),
        ...draft,
        dropdown_options: draft.dropdown_options?.length ? draft.dropdown_options : [''],
        depends_on_options: parseDependsOnOptions(
          draft.depends_on_options?.length ? draft.depends_on_options : draft.depends_on_option,
        ),
      })
    } else {
      const defaults = defaultsForMode(mode)
      if (mode === 'section') {
        defaults.sort_order = nextSortOrder(allFields, { kind: 'section' })
      }
      setForm(defaults)
    }
    hydratedRef.current = true
  }, [field, mode, parents, draftKey, allFields])

  useEffect(() => {
    if (!hydratedRef.current || isEdit || !draftKey) return
    writeFormDraft(draftKey, form)
  }, [form, isEdit, draftKey])

  const showFieldType = !form.is_section && !valuesOnly && !isChild
  const showSectionSelect = !form.is_section && !valuesOnly && !isChild
  const fieldSupportsOptions = fieldTypeSupportsOptions(form.field_type)
  const showDropdownOptions = valuesOnly
    || isChild
    || (canManageChildren && showFieldType && fieldSupportsOptions)
  const showSchemaFields = !valuesOnly

  const childParentOptions = useMemo(() => (
    dropdownParents.filter((parent) => (
      !form.section_id || parent.section_id === form.section_id
    ))
  ), [dropdownParents, form.section_id])

  const selectedChildParent = useMemo(
    () => dropdownParents.find((parent) => parent.id === form.parent_id) || null,
    [dropdownParents, form.parent_id],
  )

  const dependencyParentOptions = useMemo(() => (
    parents.filter((parent) => (
      parent.kind === 'parent'
      && parent.section_id === form.dependency_section_id
      && parent.id !== field?.id
      && parent.is_active !== false
    ))
  ), [parents, form.dependency_section_id, field?.id])

  const selectedDependencyParent = useMemo(
    () => parents.find((parent) => parent.id === form.depends_on_parent_id) || null,
    [parents, form.depends_on_parent_id],
  )

  const dependencyChildOptions = selectedDependencyParent?.dropdown_options || []

  const updateForm = (patch) => {
    setForm((prev) => ({ ...prev, ...patch }))
  }

  const handleChildSectionChange = (sectionId) => {
    setForm((prev) => ({
      ...prev,
      section_id: sectionId,
      parent_id: '',
    }))
  }

  const addOption = () => {
    setForm((prev) => ({
      ...prev,
      dropdown_options: [...prev.dropdown_options, ''],
    }))
  }

  const updateOption = (index, value) => {
    setForm((prev) => {
      const dropdown_options = [...prev.dropdown_options]
      dropdown_options[index] = value
      return { ...prev, dropdown_options }
    })
  }

  const removeOption = (index) => {
    setForm((prev) => ({
      ...prev,
      dropdown_options: prev.dropdown_options.filter((_, i) => i !== index),
    }))
  }

  const showBulkOptionPaste = valuesOnly || isChild

  const applyBulkPaste = (replace) => {
    const parsed = parseBulkFieldOptions(bulkPasteText)
    if (!parsed.length) {
      setError('Paste at least one value (one per line, or separated by commas).')
      return
    }
    setError(null)
    setForm((prev) => ({
      ...prev,
      dropdown_options: mergeFieldOptionLists(prev.dropdown_options, parsed, { replace }),
    }))
    if (replace) {
      setBulkPasteText('')
    }
  }

  const handleSectionChange = (sectionId) => {
    setForm((prev) => ({
      ...prev,
      section_id: sectionId,
      sort_order: isEdit
        ? prev.sort_order
        : nextSortOrder(allFields, { kind: 'parent', sectionId }),
    }))
  }

  const sectionOptionLabel = (section) => (
    section.is_active === false ? `${section.name} (inactive)` : section.name
  )

  const createSectionAndSelect = async (selectFn) => {
    if (!canCreateSectionInline) return
    if (typeof onRequestCreateSection === 'function') {
      onRequestCreateSection((created) => {
        if (created?.id) {
          setExtraSections((prev) => [...prev, created])
          selectFn(created.id)
        }
      })
      return
    }
    const name = window.prompt('New section name')
    if (!name?.trim()) return
    setCreatingSection(true)
    setError(null)
    try {
      const created = await onCreateSection(name.trim())
      if (created?.id) {
        setExtraSections((prev) => [...prev, created])
        selectFn(created.id)
      }
    } catch (err) {
      setError(err.message || 'Could not create section')
    } finally {
      setCreatingSection(false)
    }
  }

  const handleInlineCreateSection = () => createSectionAndSelect(
    isChild ? handleChildSectionChange : handleSectionChange,
  )

  const handleInlineCreateSectionForDependency = () => createSectionAndSelect(
    handleDependencySectionChange,
  )

  const handleDependentToggle = (isDependent) => {
    setForm((prev) => ({
      ...prev,
      is_dependent: isDependent,
      dependency_section_id: isDependent ? prev.dependency_section_id : '',
      depends_on_parent_id: isDependent ? prev.depends_on_parent_id : '',
      depends_on_options: isDependent ? prev.depends_on_options : [],
    }))
  }

  const handleDependencySectionChange = (sectionId) => {
    setForm((prev) => ({
      ...prev,
      dependency_section_id: sectionId,
      depends_on_parent_id: '',
      depends_on_options: [],
    }))
  }

  const handleDependencyParentChange = (dependsOnParentId) => {
    setForm((prev) => ({
      ...prev,
      depends_on_parent_id: dependsOnParentId,
      depends_on_options: [],
    }))
  }

  const toggleDependencyOption = (option) => {
    setForm((prev) => {
      const selected = new Set(prev.depends_on_options || [])
      if (selected.has(option)) selected.delete(option)
      else selected.add(option)
      return { ...prev, depends_on_options: [...selected] }
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)

    if (valuesOnly) {
      const options = form.dropdown_options.map((o) => o.trim()).filter(Boolean)
      if (!options.length) {
        setError('Add at least one option value')
        return
      }
      try {
        await onSave({ dropdown_options: options })
        clearFormDraft(draftKey)
      } catch (err) {
        setError(err.message)
      }
      return
    }

    if (isChild) {
      if (!form.section_id) {
        setError('Select a section')
        return
      }
      const selectedParent = childParentOptions.find((parent) => parent.id === form.parent_id)
      if (!selectedParent) {
        setError('Select a parent field that supports option values')
        return
      }
      const options = form.dropdown_options.map((o) => o.trim()).filter(Boolean)
      if (!options.length) {
        setError('Add at least one option value')
        return
      }
      try {
        await onSave({
          kind: 'child',
          parent_id: selectedParent.id,
          dropdown_options: options,
        })
        clearFormDraft(draftKey)
      } catch (err) {
        setError(err.message)
      }
      return
    }
    if (!form.name.trim()) {
      setError('Name is required')
      return
    }
    if (!form.is_section && !form.is_parent) {
      setError('Turn on Parent field or enable Section')
      return
    }
    if (showSectionSelect && !form.section_id) {
      setError('Select a section')
      return
    }
    const sortOrder = Number(form.sort_order)
    if (!Number.isInteger(sortOrder) || sortOrder < 0) {
      setError('Display order must be a whole number of 0 or greater')
      return
    }

    if (form.is_dependent) {
      if (!form.dependency_section_id) {
        setError('Select the section for the dependency')
        return
      }
      if (!form.depends_on_parent_id) {
        setError('Select the parent field this depends on')
        return
      }
      if (!fieldTypeSupportsOptions(selectedDependencyParent?.field_type)) {
        setError('Dependencies require a parent field with option values')
        return
      }
      if (!form.depends_on_options?.length) {
        setError('Select at least one child value that controls when this field is shown')
        return
      }
    }

    const payload = {
      name: form.name.trim(),
      is_section: form.is_section,
      is_parent: !form.is_section,
      section_id: showSectionSelect ? form.section_id : null,
      field_type: showFieldType ? form.field_type : null,
      sort_order: sortOrder,
      is_required: form.is_section ? false : Boolean(form.is_required),
      depends_on_parent_id: form.is_dependent ? form.depends_on_parent_id : null,
      depends_on_option: form.is_dependent ? form.depends_on_options : null,
    }
    if (showDropdownOptions) {
      payload.dropdown_options = form.dropdown_options.map((o) => o.trim()).filter(Boolean)
    }

    try {
      await onSave(payload, { iconFile, removeIcon })
      clearFormDraft(draftKey)
    } catch (err) {
      setError(err.message)
    }
  }

  const handleIconSelect = (file, validationError) => {
    if (validationError) {
      setIconError(validationError)
      return
    }
    setIconError(null)
    setRemoveIcon(false)
    setIconFile(file)
    setIconPreview(file ? URL.createObjectURL(file) : null)
  }

  const handleIconRemove = () => {
    setIconFile(null)
    setIconPreview(null)
    setRemoveIcon(true)
    setIconError(null)
  }

  return (
    <div className="company-modal-overlay" onMouseDown={handleBackdropClick} role="presentation">
      <div className="company-modal company-modal--wide" onClick={(e) => e.stopPropagation()} role="dialog" aria-labelledby="field-modal-title">
        <div className="company-modal__header">
          <div className="modal__header-main">
            <PageBack onClick={onClose} className="page-back--header" />
            <h2 id="field-modal-title">
              {valuesOnly ? 'Edit option values' : isChild ? 'Add Child' : isEdit ? 'Edit Field' : 'Add Field'}
            </h2>
          </div>
          <button type="button" className="company-modal__close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <form className="company-modal__form" onSubmit={handleSubmit}>
          {valuesOnly && (
            <p className="company-employee-photo__login-hint">
              Parent field: <strong>{field?.name}</strong>
              {field?.section_name ? ` (${field.section_name})` : ''}
            </p>
          )}

          {showSchemaFields && !isChild && (
          <label className="company-form__field">
            <span className="company-form__label">Name *</span>
            <input
              className="company-form__input"
              value={form.name}
              onChange={(e) => updateForm({ name: e.target.value })}
              placeholder="Field name"
              required
            />
          </label>
          )}

          {showSchemaFields && isChild && (
            <>
              <p className="company-employee-photo__login-hint">
                Choose a section and parent field, then add option values for that parent.
              </p>
              <CreatableSelect
                label="1. Section"
                required
                value={form.section_id}
                onChange={handleChildSectionChange}
                options={sectionList}
                getOptionValue={(section) => section.id}
                getOptionLabel={sectionOptionLabel}
                placeholder="Select section…"
                onCreate={canCreateSectionInline ? handleInlineCreateSection : undefined}
                createLabel="+ New section"
                disabled={creatingSection || saving}
              />
              {!sectionList.length && (
                <p className="asset-field-dependency__empty">
                  {canCreateSectionInline
                    ? 'No sections yet. Create one to continue.'
                    : 'No sections yet. Ask Super Admin to add sections first.'}
                </p>
              )}

              {form.section_id && (
                <label className="company-form__field">
                  <span className="company-form__label">2. Parent *</span>
                  <FilterableSelect
                    value={form.parent_id}
                    onChange={(parent_id) => updateForm({ parent_id })}
                    options={childParentOptions}
                    getOptionValue={(parent) => parent.id}
                    getOptionLabel={(parent) => `${parent.name} (${fieldTypeLabel(parent.field_type)})`}
                    placeholder="Select parent…"
                    required
                    className="company-form__input--select"
                  />
                  {!childParentOptions.length && (
                    <p className="asset-field-dependency__empty">
                      No Dropdown or Checkbox parents in this section.
                    </p>
                  )}
                </label>
              )}

              {selectedChildParent && (
                <p className="company-employee-photo__login-hint">
                  Parent type: <strong>{fieldTypeLabel(selectedChildParent.field_type)}</strong>
                  {selectedChildParent.dropdown_options?.length
                    ? ` · ${selectedChildParent.dropdown_options.length} existing value(s)`
                    : ''}
                </p>
              )}
            </>
          )}

          {showSchemaFields && !isEdit && !isChild && (
            <div className="asset-field-toggle-row asset-field-toggle-row--compact">
              <div className="asset-field-toggle-item">
                <div className="asset-field-toggle-item__head">
                  <span className="asset-field-toggle-item__label">
                    <span className="company-employee-photo__login-label">Section</span>
                    <button
                      type="button"
                      className="asset-field-info"
                      aria-label="Groups parent fields and option values."
                    >
                      <img
                        src={INFO_BUTTON_ICON_SRC}
                        alt=""
                        className="asset-field-info__icon"
                        width={22}
                        height={22}
                      />
                      <span className="asset-field-info__tooltip" role="tooltip">
                        Groups parent fields and option values.
                      </span>
                    </button>
                  </span>
                  <GooToggle
                    checked={form.is_section}
                    onChange={(checked) => updateForm({
                      is_section: checked,
                      is_parent: checked ? false : true,
                      sort_order: checked
                        ? nextSortOrder(allFields, { kind: 'section' })
                        : nextSortOrder(allFields, {
                          kind: 'parent',
                          sectionId: form.section_id || null,
                        }),
                    })}
                    ariaLabel="Is section"
                  />
                </div>
              </div>

              <div className="asset-field-toggle-item">
                <div className="asset-field-toggle-item__head">
                  <span className="asset-field-toggle-item__label">
                    <span className="company-employee-photo__login-label">Parent field</span>
                    <button
                      type="button"
                      className="asset-field-info"
                      aria-label="Input field under a section. For Dropdown, Radio, or Checkbox, add option values in this form."
                    >
                      <img
                        src={INFO_BUTTON_ICON_SRC}
                        alt=""
                        className="asset-field-info__icon"
                        width={22}
                        height={22}
                      />
                      <span className="asset-field-info__tooltip" role="tooltip">
                        Input field under a section. For Dropdown, Radio, or Checkbox, add option values in this form.
                      </span>
                    </button>
                  </span>
                  <GooToggle
                    checked={form.is_parent}
                    disabled={form.is_section}
                    onChange={(checked) => updateForm({ is_parent: checked, is_section: false })}
                    ariaLabel="Is parent field"
                  />
                </div>
              </div>
            </div>
          )}

          {showSchemaFields && isEdit && (
            <p className="company-employee-photo__login-hint">
              Type: {field.kind === 'section' ? 'Section' : 'Parent field'}
            </p>
          )}

          {showSchemaFields && showSectionSelect && (
            <>
              <CreatableSelect
                label="Section"
                required
                value={form.section_id}
                onChange={handleSectionChange}
                options={sectionList}
                getOptionValue={(section) => section.id}
                getOptionLabel={sectionOptionLabel}
                placeholder="Select section…"
                onCreate={canCreateSectionInline ? handleInlineCreateSection : undefined}
                createLabel="+ New section"
                disabled={creatingSection || saving}
              />
              {!sectionList.length && (
                <p className="asset-field-dependency__empty">
                  {canCreateSectionInline
                    ? 'No sections yet. Create one with + New section, or turn on Section above.'
                    : 'No sections yet. Ask Super Admin to add sections first.'}
                </p>
              )}
            </>
          )}

          {showSchemaFields && (form.is_section || form.is_parent) && (
            <label className="company-form__field">
              <span className="company-form__label">Display order *</span>
              <input
                className="company-form__input"
                type="number"
                min="0"
                step="1"
                value={form.sort_order}
                onChange={(e) => updateForm({ sort_order: e.target.value })}
                required
              />
              <p className="company-employee-photo__login-hint">
                {form.is_section
                  ? 'Lower numbers appear first among sections on asset and work order forms.'
                  : 'Lower numbers appear first among parent fields in the same section.'}
              </p>
            </label>
          )}

          {showSchemaFields && isSection && (
            <SectionIconUpload
              previewUrl={iconPreview}
              uploading={saving}
              disabled={saving}
              error={iconError}
              onSelect={handleIconSelect}
              onRemove={handleIconRemove}
            />
          )}

          {showFieldType && (
            <label className="company-form__field">
              <span className="company-form__label">Field type *</span>
              <FilterableSelect
                value={form.field_type}
                onChange={(nextType) => {
                  updateForm({
                    field_type: nextType,
                    dropdown_options: fieldTypeSupportsOptions(nextType)
                      ? (form.dropdown_options?.length ? form.dropdown_options : [''])
                      : [''],
                  })
                }}
                options={ASSET_FIELD_TYPES}
                getOptionValue={(type) => type.value}
                getOptionLabel={(type) => type.label}
                placeholder="Select type"
                required
                allowEmpty={false}
                className="company-form__input--select"
              />
            </label>
          )}

          {showDropdownOptions && (!isChild || selectedChildParent) && (
            <div className="company-form__field">
              <span className="company-form__label">
                {isChild || valuesOnly ? 'Option values *' : 'Option values'}
              </span>
              <p className="company-employee-photo__login-hint">
                {isChild || valuesOnly
                  ? `Each value is stored as a child option for this ${fieldTypeLabel(selectedChildParent?.field_type || field?.field_type || form.field_type) || 'field'}.`
                  : `Optional. Each value is stored as a child option for this ${fieldTypeLabel(form.field_type) || 'field'}. You can also add values later.`}
              </p>
              {showBulkOptionPaste && (
                <div className="asset-bulk-options-paste">
                  <label className="asset-bulk-options-paste__field">
                    <span className="company-form__label">Paste multiple at once</span>
                    <textarea
                      className="company-form__input company-form__textarea asset-bulk-options-paste__textarea"
                      rows={4}
                      value={bulkPasteText}
                      onChange={(e) => setBulkPasteText(e.target.value)}
                      placeholder={'One value per line\nOr comma-separated: SS, MS, PPFRP'}
                    />
                  </label>
                  <div className="asset-bulk-options-paste__actions">
                    <button
                      type="button"
                      className="company-btn company-btn--secondary"
                      onClick={() => applyBulkPaste(false)}
                      disabled={saving || !bulkPasteText.trim()}
                    >
                      Add to list
                    </button>
                    <button
                      type="button"
                      className="company-btn company-btn--ghost"
                      onClick={() => applyBulkPaste(true)}
                      disabled={saving || !bulkPasteText.trim()}
                    >
                      Replace list
                    </button>
                  </div>
                </div>
              )}
              <div className="asset-dropdown-options">
                {form.dropdown_options.map((opt, index) => (
                  <div key={index} className="asset-dropdown-options__row">
                    <input
                      className="company-form__input"
                      value={opt}
                      onChange={(e) => updateOption(index, e.target.value)}
                      placeholder={`Option ${index + 1}`}
                    />
                    {form.dropdown_options.length > 1 && (
                      <button
                        type="button"
                        className="company-btn company-btn--ghost"
                        onClick={() => removeOption(index)}
                        aria-label="Remove option"
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
                <button type="button" className="company-btn company-btn--secondary" onClick={addOption}>
                  + Add option
                </button>
              </div>
            </div>
          )}

          {showSchemaFields && showFieldType && (
            <div className="asset-field-dependency">
              <div className="asset-field-toggle-row asset-field-toggle-row--compact">
                <div className="asset-field-toggle-item">
                  <div className="asset-field-toggle-item__head">
                    <span className="asset-field-toggle-item__label">
                      <span className="company-form__label">Mandatory field</span>
                      <button
                        type="button"
                        className="asset-field-info"
                        aria-label="Users must fill this field before submitting the form."
                      >
                        <img
                          src={INFO_BUTTON_ICON_SRC}
                          alt=""
                          className="asset-field-info__icon"
                          width={22}
                          height={22}
                        />
                        <span className="asset-field-info__tooltip" role="tooltip">
                          Users must fill this field before submitting the form.
                        </span>
                      </button>
                    </span>
                    <GooToggle
                      checked={form.is_required}
                      onChange={(checked) => updateForm({ is_required: checked })}
                      ariaLabel="Is mandatory"
                    />
                  </div>
                </div>

                <div className="asset-field-toggle-item">
                  <div className="asset-field-toggle-item__head">
                    <span className="asset-field-toggle-item__label">
                      <span className="company-form__label">Dependent field</span>
                      <button
                        type="button"
                        className="asset-field-info"
                        aria-label="Link to any section, parent, and one or more child values. This field appears when any selected value is chosen on the work order form."
                      >
                        <img
                          src={INFO_BUTTON_ICON_SRC}
                          alt=""
                          className="asset-field-info__icon"
                          width={22}
                          height={22}
                        />
                        <span className="asset-field-info__tooltip" role="tooltip">
                          Link to any section, parent, and one or more child values. This field appears when any selected value is chosen on the work order form.
                        </span>
                      </button>
                    </span>
                    <GooToggle
                      checked={form.is_dependent}
                      onChange={handleDependentToggle}
                      ariaLabel="Is dependent on another field"
                    />
                  </div>
                </div>
              </div>

              {form.is_dependent && (
                <div className="asset-field-dependency__steps">
                  <label className="company-form__field">
                    <span className="company-form__label">1. Section *</span>
                    <div className="company-creatable-select">
                      <FilterableSelect
                        value={form.dependency_section_id}
                        onChange={handleDependencySectionChange}
                        options={sectionChoices}
                        getOptionValue={(section) => section.id}
                        getOptionLabel={sectionOptionLabel}
                        placeholder="Select section…"
                        required
                        className="company-form__input--select"
                      />
                      {canCreateSectionInline && (
                        <button
                          type="button"
                          className="company-btn company-btn--secondary company-btn--compact"
                          onClick={handleInlineCreateSectionForDependency}
                          disabled={creatingSection || saving}
                        >
                          + New section
                        </button>
                      )}
                    </div>
                  </label>

                  {form.dependency_section_id && (
                    <label className="company-form__field">
                      <span className="company-form__label">2. Parent *</span>
                      <FilterableSelect
                        value={form.depends_on_parent_id}
                        onChange={handleDependencyParentChange}
                        options={dependencyParentOptions}
                        getOptionValue={(parent) => parent.id}
                        getOptionLabel={(parent) => `${parent.name} (${fieldTypeLabel(parent.field_type)})`}
                        placeholder="Select parent…"
                        required
                        className="company-form__input--select"
                      />
                      {!dependencyParentOptions.length && (
                        <p className="asset-field-dependency__empty">
                          No parent fields in this section yet.
                        </p>
                      )}
                    </label>
                  )}

                  {form.depends_on_parent_id && fieldTypeSupportsOptions(selectedDependencyParent?.field_type) && (
                    <div className="company-form__field">
                      <span className="company-form__label">3. Child values *</span>
                      <p className="company-employee-photo__login-hint">
                        Select one or more values. This field shows when the parent matches any of them.
                      </p>
                      {dependencyChildOptions.length ? (
                        <div
                          className="asset-field-dependency__options"
                          role="group"
                          aria-label="Child values"
                        >
                          {dependencyChildOptions.map((option) => {
                            const checked = (form.depends_on_options || []).includes(option)
                            return (
                              <label key={option} className="asset-field-dependency__option">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggleDependencyOption(option)}
                                />
                                <span>{option}</span>
                              </label>
                            )
                          })}
                        </div>
                      ) : (
                        <p className="asset-field-dependency__empty">
                          {selectedDependencyParent.name} has no child values yet.
                        </p>
                      )}
                    </div>
                  )}

                  {form.depends_on_parent_id && !fieldTypeSupportsOptions(selectedDependencyParent?.field_type) && (
                    <p className="asset-field-dependency__empty">
                      {selectedDependencyParent.name} does not have option values. Pick a Dropdown or Checkbox parent.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {error && <div className="company-alert">{error}</div>}

          <div className="company-modal__actions">
            <button type="button" className="company-btn company-btn--ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="company-btn company-btn--primary" disabled={saving}>
              {saving ? 'Saving…' : valuesOnly ? 'Save values' : isChild ? 'Create child' : isEdit ? 'Save changes' : 'Create field'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
