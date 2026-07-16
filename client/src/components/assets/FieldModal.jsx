import { useEffect, useMemo, useRef, useState } from 'react'
import { useBackdropClose } from '../../hooks/useBackdropClose'
import { useOrg } from '../../hooks/useOrg'
import GooToggle from '../ui/GooToggle'
import SectionIconUpload from './SectionIconUpload'
import { ASSET_FIELD_TYPES, fieldTypeLabel, nextSortOrder } from '../../lib/assetFieldTypes'
import { parseDependsOnOptions } from '../../lib/assetFieldDependencies'
import {
  assetFieldDraftKey,
  clearFormDraft,
  readFormDraft,
  writeFormDraft,
} from '../../lib/formDraftStorage'
import '../company/CompanyShared.css'
import './AssetsFields.css'

const EMPTY = {
  name: '',
  is_section: false,
  is_parent: true,
  section_id: '',
  field_type: 'text',
  sort_order: 0,
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
  return { ...EMPTY, is_section: false, is_parent: true }
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
    dropdown_options: field.dropdown_options?.length
      ? [...field.dropdown_options]
      : [''],
    is_dependent: Boolean(field.depends_on_parent_id),
    dependency_section_id: depParent?.section_id || '',
    depends_on_parent_id: field.depends_on_parent_id || '',
    depends_on_options: parseDependsOnOptions(field.depends_on_option),
  }
}

export default function FieldModal({
  field,
  mode = 'all',
  valuesOnly = false,
  orgId: orgIdProp,
  sections,
  dependencySections = [],
  parents = [],
  allFields = [],
  saving,
  onClose,
  onSave,
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
  const [iconError, setIconError] = useState(null)
  const handleBackdropClick = useBackdropClose(onClose)

  const isSection = form.is_section || field?.kind === 'section'

  const sectionChoices = dependencySections.length ? dependencySections : sections

  useEffect(() => {
    hydratedRef.current = false

    if (field) {
      setForm(formFromField(field, parents))
      setIconPreview(field.icon_signed_url || null)
      setIconFile(null)
      setRemoveIcon(false)
      setIconError(null)
      hydratedRef.current = true
      return
    }

    setIconPreview(null)
    setIconFile(null)
    setRemoveIcon(false)
    setIconError(null)

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

  const showFieldType = !form.is_section && !valuesOnly
  const showSectionSelect = !form.is_section && !valuesOnly
  const showDropdownOptions = valuesOnly
  const showSchemaFields = !valuesOnly

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

  const handleSectionChange = (sectionId) => {
    setForm((prev) => ({
      ...prev,
      section_id: sectionId,
      sort_order: isEdit
        ? prev.sort_order
        : nextSortOrder(allFields, { kind: 'parent', sectionId }),
    }))
  }

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
        setError('Add at least one dropdown value')
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
    if (showDropdownOptions) {
      const options = form.dropdown_options.map((o) => o.trim()).filter(Boolean)
      if (!options.length) {
        setError('Add at least one dropdown value')
        return
      }
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
      if (selectedDependencyParent?.field_type !== 'dropdown') {
        setError('Dependencies require a dropdown parent field with values')
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
      dropdown_options: showDropdownOptions
        ? form.dropdown_options.map((o) => o.trim()).filter(Boolean)
        : [],
      depends_on_parent_id: form.is_dependent ? form.depends_on_parent_id : null,
      depends_on_option: form.is_dependent ? form.depends_on_options : null,
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
      <div className="company-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-labelledby="field-modal-title">
        <div className="company-modal__header">
          <h2 id="field-modal-title">
            {valuesOnly ? 'Edit dropdown values' : isEdit ? 'Edit Field' : 'Add Field'}
          </h2>
          <button type="button" className="company-modal__close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <form className="company-modal__form" onSubmit={handleSubmit}>
          {valuesOnly && (
            <p className="company-employee-photo__login-hint">
              Parent field: <strong>{field?.name}</strong>
              {field?.section_name ? ` (${field.section_name})` : ''}
            </p>
          )}

          {showSchemaFields && (
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

          {showSchemaFields && !isEdit && (
            <div className="asset-field-toggle-row">
              <div className="asset-field-toggle-item">
                <div className="asset-field-toggle-item__head">
                  <span className="company-employee-photo__login-label">Section</span>
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
                <p className="company-employee-photo__login-hint">
                  Groups parent fields and dropdown values.
                </p>
              </div>

              <div className="asset-field-toggle-item">
                <div className="asset-field-toggle-item__head">
                  <span className="company-employee-photo__login-label">Parent field</span>
                  <GooToggle
                    checked={form.is_parent}
                    disabled={form.is_section}
                    onChange={(checked) => updateForm({ is_parent: checked, is_section: false })}
                    ariaLabel="Is parent field"
                  />
                </div>
                <p className="company-employee-photo__login-hint">
                  Input field under a section. Choose dropdown type to let the company add values later.
                </p>
              </div>
            </div>
          )}

          {showSchemaFields && isEdit && (
            <p className="company-employee-photo__login-hint">
              Type: {field.kind === 'section' ? 'Section' : 'Parent field'}
            </p>
          )}

          {showSchemaFields && showSectionSelect && (
            <label className="company-form__field">
              <span className="company-form__label">Section *</span>
              <select
                className="company-form__input company-form__input--select"
                value={form.section_id}
                onChange={(e) => handleSectionChange(e.target.value)}
                required
              >
                <option value="">Select section…</option>
                {sections.map((section) => (
                  <option key={section.id} value={section.id}>{section.name}</option>
                ))}
              </select>
            </label>
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
              <select
                className="company-form__input company-form__input--select"
                value={form.field_type}
                onChange={(e) => updateForm({
                  field_type: e.target.value,
                  dropdown_options: e.target.value === 'dropdown' && !form.dropdown_options.length
                    ? ['']
                    : form.dropdown_options,
                })}
                required
              >
                {ASSET_FIELD_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>{type.label}</option>
                ))}
              </select>
            </label>
          )}

          {showDropdownOptions && (
            <div className="company-form__field">
              <span className="company-form__label">Dropdown values *</span>
              <p className="company-employee-photo__login-hint">
                Each value is stored as a child option for this field.
              </p>
              <div className="asset-dropdown-options">
                {form.dropdown_options.map((opt, index) => (
                  <div key={index} className="asset-dropdown-options__row">
                    <input
                      className="company-form__input"
                      value={opt}
                      onChange={(e) => updateOption(index, e.target.value)}
                      placeholder={`Value ${index + 1}`}
                    />
                    {form.dropdown_options.length > 1 && (
                      <button
                        type="button"
                        className="company-btn company-btn--ghost"
                        onClick={() => removeOption(index)}
                        aria-label="Remove value"
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
                <button type="button" className="company-btn company-btn--secondary" onClick={addOption}>
                  + Add value
                </button>
              </div>
            </div>
          )}

          {showSchemaFields && showFieldType && (
            <div className="asset-field-dependency">
              <div className="asset-field-dependency__head">
                <span className="company-form__label">Dependent field</span>
                <GooToggle
                  checked={form.is_dependent}
                  onChange={handleDependentToggle}
                  ariaLabel="Is dependent on another field"
                />
              </div>
              <p className="company-employee-photo__login-hint">
                Link to any section, parent, and one or more child values. This field appears when any selected value is chosen on the work order form.
              </p>

              {form.is_dependent && (
                <div className="asset-field-dependency__steps">
                  <label className="company-form__field">
                    <span className="company-form__label">1. Section *</span>
                    <select
                      className="company-form__input company-form__input--select"
                      value={form.dependency_section_id}
                      onChange={(e) => handleDependencySectionChange(e.target.value)}
                      required
                    >
                      <option value="">Select section…</option>
                      {sectionChoices.map((section) => (
                        <option key={section.id} value={section.id}>{section.name}</option>
                      ))}
                    </select>
                  </label>

                  {form.dependency_section_id && (
                    <label className="company-form__field">
                      <span className="company-form__label">2. Parent *</span>
                      <select
                        className="company-form__input company-form__input--select"
                        value={form.depends_on_parent_id}
                        onChange={(e) => handleDependencyParentChange(e.target.value)}
                        required
                      >
                        <option value="">Select parent…</option>
                        {dependencyParentOptions.map((parent) => (
                          <option key={parent.id} value={parent.id}>
                            {parent.name} ({fieldTypeLabel(parent.field_type)})
                          </option>
                        ))}
                      </select>
                      {!dependencyParentOptions.length && (
                        <p className="asset-field-dependency__empty">
                          No parent fields in this section yet.
                        </p>
                      )}
                    </label>
                  )}

                  {form.depends_on_parent_id && selectedDependencyParent?.field_type === 'dropdown' && (
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

                  {form.depends_on_parent_id && selectedDependencyParent?.field_type !== 'dropdown' && (
                    <p className="asset-field-dependency__empty">
                      {selectedDependencyParent.name} is not a dropdown. Pick a dropdown parent to select child values.
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
              {saving ? 'Saving…' : valuesOnly ? 'Save values' : isEdit ? 'Save changes' : 'Create field'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
