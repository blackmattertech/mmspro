import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useBackdropClose } from '../../hooks/useBackdropClose'
import { getAdminFormLayout, saveAdminFormLayout } from '../../lib/api-form-layouts'
import { catalogId, defaultColSpanForType } from '../../lib/formLayoutIds'
import GooToggle from '../ui/GooToggle'
import EditIcon from '../ui/EditIcon'
import TrashIcon from '../ui/TrashIcon'
import FilterableSelect from '../ui/FilterableSelect'
import SpellcheckInput from '../shared/SpellcheckInput'
import {
  ASSET_FIELD_TYPES,
  fieldTypeLabel,
  fieldTypeSupportsOptions,
} from '../../lib/assetFieldTypes'
import { hierarchyChainLabel, previousLevelChoices } from '../../lib/assetHierarchy'
import TableEmptyRow from '../shared/TableEmptyRow'
import '../company/CompanyShared.css'
import '../assets/AssetsFields.css'

const EMPTY = {
  name: '',
  field_type: 'text',
  is_required: false,
}

function optionsFromField(field) {
  const bindings = field?.option_bindings
  if (Array.isArray(bindings) && bindings.length) {
    return bindings.map((binding) => ({
      value: String(binding.value || '').trim(),
      parentValue: String(binding.parent_value || '').trim(),
    }))
  }
  const options = (field?.dropdown_options || []).map((value) => String(value).trim()).filter(Boolean)
  return (options.length ? options : ['']).map((value) => ({ value, parentValue: '' }))
}

function withQrField(layout, field) {
  const next = JSON.parse(JSON.stringify(layout))
  const fieldLayoutId = catalogId(field.id)
  const sectionLayoutId = field.section_id ? catalogId(field.section_id) : (next.sections?.[0]?.id || null)
  next.sections = Array.isArray(next.sections) ? next.sections : []
  next.fields = Array.isArray(next.fields) ? next.fields : []
  if (sectionLayoutId && !next.sections.some((section) => section.id === sectionLayoutId)) {
    next.sections.push({ id: sectionLayoutId, order: next.sections.length })
  }
  if (!next.fields.some((item) => item.id === fieldLayoutId)) {
    const sectionId = sectionLayoutId || next.sections[0]?.id
    const orders = next.fields
      .filter((item) => item.sectionId === sectionId)
      .map((item) => item.order ?? 0)
    next.fields.push({
      id: fieldLayoutId,
      sectionId,
      order: orders.length ? Math.max(...orders) + 1 : 0,
      colSpan: defaultColSpanForType(field.field_type),
    })
  }
  next.qrFieldId = fieldLayoutId
  return next
}

export default function EquipmentMasterFields({ orgId, fieldsState }) {
  const { fields, loading, saving, error, create, update, remove, toggleActive } = fieldsState
  const [search, setSearch] = useState('')
  const [modalField, setModalField] = useState(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [actionError, setActionError] = useState(null)
  const [qrFieldId, setQrFieldId] = useState('')
  const [qrSavingId, setQrSavingId] = useState(null)

  useEffect(() => {
    if (!orgId) return undefined
    let cancelled = false
    getAdminFormLayout(orgId, 'equipment.create')
      .then((data) => {
        if (!cancelled) setQrFieldId(data?.layout?.qrFieldId || '')
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [orgId])

  const markQrField = async (field) => {
    const data = await getAdminFormLayout(orgId, 'equipment.create')
    const base = data?.layout || data?.defaultLayout
    if (!base) throw new Error('Assets form is not available yet')
    const saved = await saveAdminFormLayout(orgId, 'equipment.create', withQrField(base, field))
    setQrFieldId(saved?.layout?.qrFieldId || catalogId(field.id))
  }

  const parents = useMemo(
    () => (fields || [])
      .filter((field) => field.kind === 'parent')
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name)),
    [fields],
  )
  const visible = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return parents
    return parents.filter((field) => field.name.toLowerCase().includes(query))
  }, [parents, search])

  const openCreate = () => {
    setActionError(null)
    setModalField(null)
    setModalOpen(true)
  }

  const openEdit = (field) => {
    setActionError(null)
    setModalField(field)
    setModalOpen(true)
  }

  const handleSave = async (payload, { useQr = false } = {}) => {
    const saved = modalField?.id
      ? await update(modalField.id, payload)
      : await create({
        ...payload,
        is_parent: true,
        is_section: false,
      })
    const savedField = saved?.id ? saved : modalField
    setModalOpen(false)
    try {
      if (useQr && savedField?.id) {
        await markQrField(savedField)
      } else if (savedField?.id && qrFieldId === catalogId(savedField.id)) {
        await clearQrField(savedField)
      }
    } catch (err) {
      setActionError(err.message)
    }
  }

  const clearQrField = async (field) => {
    const data = await getAdminFormLayout(orgId, 'equipment.create')
    if (!data?.layout || data.layout.qrFieldId !== catalogId(field.id)) {
      setQrFieldId('')
      return
    }
    const next = JSON.parse(JSON.stringify(data.layout))
    delete next.qrFieldId
    const saved = await saveAdminFormLayout(orgId, 'equipment.create', next)
    setQrFieldId(saved?.layout?.qrFieldId || '')
  }

  const handleMarkQr = async (field) => {
    if (qrFieldId === catalogId(field.id) || qrSavingId) return
    setActionError(null)
    setQrSavingId(field.id)
    try {
      await markQrField(field)
    } catch (err) {
      setActionError(err.message)
    } finally {
      setQrSavingId(null)
    }
  }

  const handleDelete = async (field) => {
    if (!window.confirm(`Delete "${field.name}"? Companies will no longer see this field on assets.`)) return
    setActionError(null)
    try {
      await remove(field.id)
      if (qrFieldId === catalogId(field.id)) setQrFieldId('')
    } catch (err) {
      setActionError(err.message)
    }
  }

  return (
    <div className="company-panel asset-fields-panel--compact">
      <p className="org-configure-equipment__hint">
        These are the only fields on the asset form. Mark QR code on the field that should generate the QR as soon as it is filled in.
      </p>
      <div className="asset-field-filters asset-field-filters--inline">
        <label className="company-filter asset-field-filters__search">
          <span>Search</span>
          <SpellcheckInput
            type="search"
            className="company-form__input"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search fields…"
          />
        </label>
        <button type="button" className="company-btn company-btn--primary" onClick={openCreate}>
          + Add field
        </button>
        <p className="company-panel__count">{visible.length} field{visible.length === 1 ? '' : 's'}</p>
      </div>
      {(error || actionError) && <div className="company-alert">{actionError || error}</div>}
      {loading ? (
        <div className="company-loading">Loading fields…</div>
      ) : (
        <div className="company-table-wrap">
          <table className="company-table master-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Level</th>
                <th>Type</th>
                <th>Required</th>
                <th>QR code</th>
                <th>Options</th>
                <th>Active</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <TableEmptyRow colSpan={8}>
                  {search.trim()
                    ? 'No fields match your search.'
                    : 'No asset fields yet. Add the details this company will fill in for each machine.'}
                </TableEmptyRow>
              ) : visible.map((field) => (
                <tr key={field.id} className={field.is_active === false ? 'company-table__row--inactive' : ''}>
                  <td>{field.name}</td>
                  <td>{hierarchyChainLabel(field, parents)}</td>
                  <td>{fieldTypeLabel(field.field_type)}</td>
                  <td>{field.is_required ? 'Yes' : 'No'}</td>
                  <td>
                    <input
                      type="radio"
                      name="equipment-qr-field"
                      checked={qrFieldId === catalogId(field.id)}
                      disabled={Boolean(qrSavingId)}
                      aria-label={`Use ${field.name} on the QR code`}
                      onChange={() => handleMarkQr(field)}
                    />
                  </td>
                  <td>{fieldTypeSupportsOptions(field.field_type) && field.dropdown_options?.length
                    ? field.dropdown_options.join(', ')
                    : '—'}
                  </td>
                  <td>
                    <GooToggle
                      checked={field.is_active !== false}
                      disabled={saving}
                      onChange={(checked) => toggleActive(field.id, checked)}
                      ariaLabel={`${field.is_active === false ? 'Activate' : 'Deactivate'} ${field.name}`}
                    />
                  </td>
                  <td className="company-table__actions">
                    <button
                      type="button"
                      className="company-btn company-btn--secondary company-btn--compact company-btn--icon"
                      onClick={() => openEdit(field)}
                      aria-label={`Edit ${field.name}`}
                      title="Edit"
                    >
                      <EditIcon />
                    </button>
                    <button
                      type="button"
                      className="company-btn company-btn--danger company-btn--compact company-btn--icon"
                      onClick={() => handleDelete(field)}
                      aria-label={`Delete ${field.name}`}
                      title="Delete"
                    >
                      <TrashIcon />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {modalOpen && (
        <EquipmentFieldModal
          field={modalField}
          parents={parents}
          saving={saving || qrSavingId === modalField?.id}
          useQr={Boolean(modalField?.id && qrFieldId === catalogId(modalField.id))}
          onClose={() => setModalOpen(false)}
          onSave={handleSave}
        />
      )}
    </div>
  )
}

function EquipmentFieldModal({ field, parents = [], saving, useQr = false, onClose, onSave }) {
  const handleBackdropClick = useBackdropClose(onClose)
  const [form, setForm] = useState(() => (
    field
      ? {
        name: field.name || '',
        field_type: field.field_type || 'text',
        is_required: Boolean(field.is_required),
        parent_field_id: field.depends_on_parent_id || '',
        options: optionsFromField(field),
        use_qr: useQr,
      }
      : { ...EMPTY, parent_field_id: '', options: [{ value: '', parentValue: '' }], use_qr: false }
  ))
  const [error, setError] = useState(null)
  const showOptions = fieldTypeSupportsOptions(form.field_type)
  const levelChoices = previousLevelChoices(parents, field?.id)
  const previousField = levelChoices.find((item) => item.id === form.parent_field_id)
    || parents.find((item) => item.id === form.parent_field_id)
    || null
  const previousOptions = (previousField?.field_type === 'dropdown' || previousField?.field_type === 'radio')
    ? (previousField?.dropdown_options || []).map((option) => String(option).trim()).filter(Boolean)
    : []

  const updateOption = (index, patch) => {
    setForm((current) => ({
      ...current,
      options: current.options.map((option, optionIndex) => (
        optionIndex === index ? { ...option, ...patch } : option
      )),
    }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    const name = form.name.trim()
    if (!name) {
      setError('Name is required')
      return
    }
    const options = showOptions
      ? form.options
        .map((option) => ({
          value: String(option.value || '').trim(),
          parentValue: String(option.parentValue || '').trim(),
        }))
        .filter((option) => option.value)
      : []
    setError(null)
    try {
      await onSave({
        name,
        field_type: form.field_type,
        is_required: form.is_required,
        is_parent: true,
        is_section: false,
        depends_on_parent_id: form.parent_field_id || null,
        depends_on_option: null,
        dropdown_options: options.map((option) => option.value),
        option_bindings: options.map((option) => ({
          value: option.value,
          parent_value: previousOptions.length ? option.parentValue : '',
        })),
      }, { useQr: form.use_qr })
    } catch (err) {
      setError(err.message)
    }
  }

  return createPortal(
    <div
      className="company-modal-overlay company-modal-overlay--popup company-modal-overlay--nested"
      onMouseDown={handleBackdropClick}
      role="presentation"
    >
      <div
        className="company-modal company-modal--popup"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="equipment-field-title"
      >
        <div className="company-modal__header">
          <h2 id="equipment-field-title">{field ? 'Edit field' : 'Add field'}</h2>
          <button type="button" className="company-modal__close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <form className="company-modal__form" onSubmit={handleSubmit}>
          {error && <div className="company-alert">{error}</div>}
          <label className="company-form__field">
            <span className="company-form__label">Name *</span>
            <SpellcheckInput
              className="company-form__input"
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              required
            />
          </label>
          <label className="company-form__field">
            <span className="company-form__label">Field type *</span>
            <FilterableSelect
              value={form.field_type}
              onChange={(field_type) => setForm((current) => ({
                ...current,
                field_type,
                options: fieldTypeSupportsOptions(field_type)
                  ? (current.options.length ? current.options : [{ value: '', parentValue: '' }])
                  : [{ value: '', parentValue: '' }],
              }))}
              options={ASSET_FIELD_TYPES}
              getOptionValue={(type) => type.value}
              getOptionLabel={(type) => type.label}
              placeholder="Select type"
              allowEmpty={false}
              className="company-form__input--select"
            />
          </label>
          <div className="equipment-field-flags">
            <div className="company-form__field">
              <span className="company-form__label">Required</span>
              <GooToggle
                checked={form.is_required}
                onChange={(is_required) => setForm((current) => ({ ...current, is_required }))}
                ariaLabel="Required field"
              />
            </div>
            <div className="company-form__field">
              <span className="company-form__label">QR code</span>
              <GooToggle
                checked={form.use_qr}
                onChange={(use_qr) => setForm((current) => ({ ...current, use_qr }))}
                ariaLabel="Show this field on the QR code"
              />
            </div>
          </div>
          <p className="company-employee-photo__login-hint equipment-field-flags__hint">
            The value of this field is printed under the asset QR code.
          </p>
          <label className="company-form__field">
            <span className="company-form__label">Parent</span>
            <FilterableSelect
              value={form.parent_field_id || '__first__'}
              onChange={(parent_field_id) => setForm((current) => ({
                ...current,
                parent_field_id: parent_field_id === '__first__' ? '' : parent_field_id,
                options: current.options.map((option) => ({ ...option, parentValue: '' })),
              }))}
              options={[{ id: '__first__', name: 'First level' }, ...levelChoices]}
              getOptionValue={(item) => item.id}
              getOptionLabel={(item) => (item.id === '__first__' ? item.name : `Next level of ${item.name}`)}
              placeholder="First level"
              allowEmpty={false}
              className="company-form__input--select"
            />
          </label>
          {showOptions && (
            <div className="company-form__field">
              <span className="company-form__label">Options</span>
              <p className="company-employee-photo__login-hint equipment-field-flags__hint">
                Optional. Leave this empty and the company can type the value while creating an asset.
              </p>
              <div className="asset-dropdown-options">
                {form.options.map((option, index) => (
                  <div key={index} className="asset-dropdown-options__row">
                    {previousOptions.length > 0 && (
                      <FilterableSelect
                        value={option.parentValue}
                        onChange={(parentValue) => updateOption(index, { parentValue })}
                        options={previousOptions}
                        getOptionValue={(item) => item}
                        getOptionLabel={(item) => item}
                        placeholder={`When ${previousField.name} is`}
                        className="company-form__input--select"
                      />
                    )}
                    <SpellcheckInput
                      className="company-form__input"
                      value={option.value}
                      onChange={(event) => updateOption(index, { value: event.target.value })}
                      placeholder="Option"
                    />
                    <button
                      type="button"
                      className="company-btn company-btn--ghost company-btn--compact"
                      onClick={() => setForm((current) => ({
                        ...current,
                        options: current.options.filter((_, optionIndex) => optionIndex !== index),
                      }))}
                      disabled={form.options.length === 1}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                className="company-btn company-btn--ghost company-btn--compact"
                onClick={() => setForm((current) => ({
                  ...current,
                  options: [...current.options, { value: '', parentValue: '' }],
                }))}
              >
                + Add option
              </button>
            </div>
          )}
          <div className="company-modal__actions">
            <button type="button" className="company-btn company-btn--ghost" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="company-btn company-btn--primary" disabled={saving}>
              {saving ? 'Saving…' : field ? 'Save field' : 'Create field'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  )
}
