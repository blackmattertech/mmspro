import { useEffect, useMemo, useRef, useState } from 'react'
import { useBackdropClose } from '../../hooks/useBackdropClose'
import { useLocations } from '../../hooks/useLocations'
import { useDepartments } from '../../hooks/useDepartments'
import { useAreas } from '../../hooks/useAreas'
import { downloadBlobFile } from '../../lib/api'
import {
  createEquipmentLabelSize,
  deleteEquipmentLabelSize,
  exportEquipmentQrLabels,
  getEquipmentColumnValues,
  getEquipmentFields,
  getEquipmentIdentityValues,
  getEquipmentLabelSizes,
  previewEquipmentQrLabels,
} from '../../lib/api-equipment'
import '../company/CompanyShared.css'
import './EquipmentQrLabels.css'

const EMPTY_FILTERS = {
  location_ids: [],
  department_ids: [],
  area_ids: [],
  names: [],
  codes: [],
  reading_required: 'all',
  active: 'all',
  fields: {},
}

const SYSTEM_SORT = [
  { value: 'location', label: 'Location' },
  { value: 'department', label: 'Department' },
  { value: 'area', label: 'Area' },
  { value: 'name', label: 'Name' },
  { value: 'code', label: 'Code' },
  { value: 'reading_required', label: 'Reading required' },
  { value: 'active', label: 'Active' },
]

function isFileField(field) {
  const type = String(field?.field_type || '').toLowerCase()
  return type === 'image' || type === 'file'
}

const DEFAULT_PRINT_FIELDS = ['name', 'code', 'location', 'department', 'area']

function fitCount(outer, inner) {
  if (!Number.isFinite(outer) || !Number.isFinite(inner) || inner <= 0) return 0
  return Math.floor((outer + 0.05) / inner)
}

function clampCopies(value) {
  const copies = Math.floor(Number(value))
  if (!Number.isFinite(copies) || copies < 1) return 1
  return Math.min(10, copies)
}

function ValueMultiSelect({ label, options, value, onChange, loading, open, onToggle }) {
  const [query, setQuery] = useState('')
  const selected = Array.isArray(value) ? value : []
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = options || []
    if (!q) return list.slice(0, 150)
    return list.filter((option) => option.label.toLowerCase().includes(q)).slice(0, 150)
  }, [options, query])
  const hidden = (options || []).length > filtered.length

  const toggle = (optionValue) => {
    if (selected.includes(optionValue)) onChange(selected.filter((item) => item !== optionValue))
    else onChange([...selected, optionValue])
  }

  return (
    <div className="qr-labels__field">
      <span className="company-form__label">{label}</span>
      <button
        type="button"
        className="qr-labels__multi-btn"
        aria-expanded={open}
        onClick={onToggle}
      >
        {selected.length ? `${selected.length} selected` : 'All'}
      </button>
      {open && (
        <div className="qr-labels__multi-panel">
          <input
            className="company-form__input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search"
            aria-label={`Search ${label}`}
          />
          <button type="button" className="qr-labels__clear" onClick={() => onChange([])}>
            Use all
          </button>
          {loading ? <p className="qr-labels__hint">Loading values…</p> : null}
          {!loading && !filtered.length ? <p className="qr-labels__hint">No values</p> : null}
          <ul>
            {filtered.map((option) => (
              <li key={option.value}>
                <label>
                  <input
                    type="checkbox"
                    checked={selected.includes(option.value)}
                    onChange={() => toggle(option.value)}
                  />
                  <span>{option.label}</span>
                </label>
              </li>
            ))}
          </ul>
          {hidden ? <p className="qr-labels__hint">Type to narrow this list.</p> : null}
        </div>
      )}
    </div>
  )
}

export default function EquipmentQrLabelsDialog({
  onClose,
  canSaveSizes = false,
  scopedLocationId = '',
}) {
  const onBackdrop = useBackdropClose(onClose)
  const [filters, setFilters] = useState(EMPTY_FILTERS)
  const [openFilter, setOpenFilter] = useState('')
  const [fields, setFields] = useState([])
  const [names, setNames] = useState([])
  const [codes, setCodes] = useState([])
  const [fieldOptions, setFieldOptions] = useState({})
  const [fieldLoading, setFieldLoading] = useState('')
  const [presets, setPresets] = useState([])
  const [sizes, setSizes] = useState([])
  const [paperId, setPaperId] = useState('a4')
  const [labelId, setLabelId] = useState('label-2x1')
  const [printFields, setPrintFields] = useState(DEFAULT_PRINT_FIELDS)
  const [showCustom, setShowCustom] = useState('')
  const [custom, setCustom] = useState({ name: '', width: '', height: '', unit: 'mm' })
  const [sortLevels, setSortLevels] = useState([])
  const [copies, setCopies] = useState(1)
  const [count, setCount] = useState(null)
  const [overCap, setOverCap] = useState(false)
  const [countError, setCountError] = useState('')
  const [counting, setCounting] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const requestRef = useRef(0)

  const { locations } = useLocations({ limit: 200, enabled: !scopedLocationId })
  const { departments } = useDepartments('', { limit: 200 })
  const { areas } = useAreas({ limit: 200 })

  const filterFields = useMemo(
    () => fields.filter((field) => field.kind === 'parent' && field.is_active !== false && !isFileField(field)),
    [fields],
  )

  const sortColumns = useMemo(() => ([
    ...SYSTEM_SORT,
    ...filterFields.map((field) => ({ value: `field:${field.id}`, label: field.name })),
  ]), [filterFields])

  useEffect(() => {
    let cancelled = false
    Promise.all([
      getEquipmentLabelSizes(),
      getEquipmentFields(),
      getEquipmentIdentityValues('name'),
      getEquipmentIdentityValues('code'),
    ]).then(([sizePayload, fieldRows, nameValues, codeValues]) => {
      if (cancelled) return
      setPresets(sizePayload?.presets || [])
      setSizes(sizePayload?.sizes || [])
      setFields(Array.isArray(fieldRows) ? fieldRows : [])
      setNames(nameValues)
      setCodes(codeValues)
    }).catch((err) => {
      if (!cancelled) setError(err.message)
    })
    return () => { cancelled = true }
  }, [])

  const locationOptions = useMemo(
    () => (locations || [])
      .filter((row) => row.is_active !== false)
      .map((row) => ({ value: row.id, label: row.name })),
    [locations],
  )

  const departmentOptions = useMemo(() => {
    const picked = new Set(filters.location_ids)
    return (departments || [])
      .filter((row) => row.is_active !== false)
      .filter((row) => !picked.size || row.all_locations || picked.has(row.location_id))
      .map((row) => ({ value: row.id, label: row.name }))
  }, [departments, filters.location_ids])

  const areaOptions = useMemo(() => {
    const locationsPicked = new Set(filters.location_ids)
    const departmentsPicked = new Set(filters.department_ids)
    return (areas || [])
      .filter((row) => row.is_active !== false)
      .filter((row) => !locationsPicked.size || !row.location_id || locationsPicked.has(row.location_id))
      .filter((row) => !departmentsPicked.size || !row.department_id || departmentsPicked.has(row.department_id))
      .map((row) => ({ value: row.id, label: row.name }))
  }, [areas, filters.location_ids, filters.department_ids])

  useEffect(() => {
    setFilters((current) => {
      const departmentIds = current.department_ids.filter((id) => departmentOptions.some((option) => option.value === id))
      const areaIds = current.area_ids.filter((id) => areaOptions.some((option) => option.value === id))
      if (departmentIds.length === current.department_ids.length && areaIds.length === current.area_ids.length) {
        return current
      }
      return { ...current, department_ids: departmentIds, area_ids: areaIds }
    })
  }, [departmentOptions, areaOptions])

  const requestBody = useMemo(() => ({
    filters,
    sort: sortLevels.filter((level) => level.column),
  }), [filters, sortLevels])

  useEffect(() => {
    const requestId = requestRef.current + 1
    requestRef.current = requestId
    setCounting(true)
    const timer = window.setTimeout(() => {
      previewEquipmentQrLabels(requestBody)
        .then((data) => {
          if (requestRef.current !== requestId) return
          setCount(data.count ?? 0)
          setOverCap(Boolean(data.over_cap))
          setCountError('')
        })
        .catch((err) => {
          if (requestRef.current !== requestId) return
          setCountError(err.message)
        })
        .finally(() => {
          if (requestRef.current === requestId) setCounting(false)
        })
    }, 350)
    return () => window.clearTimeout(timer)
  }, [requestBody])

  const paper = presets.find((item) => item.id === paperId)
    || sizes.find((item) => item.id === paperId)
  const labelSize = presets.find((item) => item.id === labelId)
    || sizes.find((item) => item.id === labelId)
  const smallPaper = labelSize ? Math.min(labelSize.width_mm, labelSize.height_mm) < 16 : false
  const printOptions = useMemo(() => ([
    { value: 'name', label: 'Name' },
    { value: 'code', label: 'Code' },
    { value: 'location', label: 'Location' },
    { value: 'department', label: 'Department' },
    { value: 'area', label: 'Area' },
    { value: 'reading_required', label: 'Reading required' },
    { value: 'active', label: 'Active' },
    ...fields
      .filter((field) => field.kind === 'parent' && field.is_active !== false)
      .map((field) => ({ value: `field:${field.id}`, label: field.name })),
  ]), [fields])
  const labelPresets = presets.filter((item) => item.group === 'label')
  const sheetPresets = presets.filter((item) => item.group !== 'label')

  const setFieldFilter = (fieldId, values) => {
    setFilters((current) => ({
      ...current,
      fields: { ...current.fields, [fieldId]: values },
    }))
  }

  const openField = async (fieldId) => {
    setOpenFilter((current) => (current === fieldId ? '' : fieldId))
    if (fieldOptions[fieldId] || fieldLoading === fieldId) return
    setFieldLoading(fieldId)
    try {
      const values = await getEquipmentColumnValues(fieldId)
      setFieldOptions((current) => ({
        ...current,
        [fieldId]: values.map((value) => ({ value, label: value })),
      }))
    } catch (err) {
      setError(err.message)
    } finally {
      setFieldLoading('')
    }
  }

  const saveCustom = async () => {
    setError('')
    setBusy(true)
    try {
      const row = await createEquipmentLabelSize(custom)
      setSizes((current) => [...current, row].sort((a, b) => a.name.localeCompare(b.name)))
      if (showCustom === 'label') setLabelId(row.id)
      else setPaperId(row.id)
      setShowCustom('')
      setCustom({ name: '', width: '', height: '', unit: 'mm' })
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const removeCustom = async (sizeId) => {
    if (!sizes.some((item) => item.id === sizeId)) return
    setError('')
    setBusy(true)
    try {
      await deleteEquipmentLabelSize(sizeId)
      setSizes((current) => current.filter((item) => item.id !== sizeId))
      if (labelId === sizeId) setLabelId('label-2x1')
      if (paperId === sizeId) setPaperId('a4')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const generate = async () => {
    setError('')
    setBusy(true)
    try {
      const sizeBody = (id, fallback) => (
        sizes.some((item) => item.id === id) ? { custom_id: id } : { preset: id || fallback }
      )
      const { blob, filename } = await exportEquipmentQrLabels({
        ...requestBody,
        paper: sizeBody(paperId, 'a4'),
        label: sizeBody(labelId, 'label-2x1'),
        copies: copyCount,
        print_fields: printFields,
      })
      downloadBlobFile({ blob, filename: filename || 'asset-qr-labels.pdf' })
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const unusedSortColumn = () => {
    const used = new Set(sortLevels.map((level) => level.column))
    return sortColumns.find((column) => !used.has(column.value))?.value || sortColumns[0]?.value || 'name'
  }

  const copyCount = clampCopies(copies)
  const printed = (count || 0) * copyCount
  const across = fitCount(paper?.width_mm, labelSize?.width_mm)
  const down = fitCount(paper?.height_mm, labelSize?.height_mm)
  const labelTooBig = Boolean(paper && labelSize && (across < 1 || down < 1))
  const perSheet = across > 0 && down > 0 ? across * down : 0
  const sheetCount = perSheet ? Math.ceil(printed / perSheet) : printed
  const overPages = printed > 2000
  const countLabel = counting
    ? 'Counting labels…'
    : countError
      ? countError
      : overCap
        ? `${count} labels. Narrow the filters to 500 or fewer.`
        : labelTooBig
          ? 'The label is larger than the paper.'
          : overPages
            ? `${printed} labels is over the 2000 label limit. Reduce copies or narrow the filters.`
            : perSheet
              ? `${printed} label${printed === 1 ? '' : 's'} on about ${sheetCount} sheet${sheetCount === 1 ? '' : 's'}`
              : `${count ?? 0} label${count === 1 ? '' : 's'}`

  const generateDisabled = busy || counting || overCap || overPages || !count || showCustom || !printFields.length || labelTooBig

  return (
    <div className="company-modal-overlay" onMouseDown={onBackdrop}>
      <div className="company-modal qr-labels" role="dialog" aria-labelledby="qr-labels-title">
        <div className="company-modal__header">
          <h2 id="qr-labels-title">Export QR labels</h2>
          <button type="button" className="company-modal__close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="qr-labels__body">
          {error ? <div className="company-error">{error}</div> : null}
          {scopedLocationId ? (
            <p className="qr-labels__note">Labels are limited to your location.</p>
          ) : null}

          <section className="qr-labels__section">
            <h3>Filters</h3>
            <p className="qr-labels__note">Leave a column on All to include every value.</p>
            <div className="qr-labels__grid">
              {!scopedLocationId && (
                <ValueMultiSelect
                  label="Location"
                  options={locationOptions}
                  value={filters.location_ids}
                  onChange={(location_ids) => setFilters((current) => ({ ...current, location_ids }))}
                  open={openFilter === 'location'}
                  onToggle={() => setOpenFilter((current) => (current === 'location' ? '' : 'location'))}
                />
              )}
              <ValueMultiSelect
                label="Department"
                options={departmentOptions}
                value={filters.department_ids}
                onChange={(department_ids) => setFilters((current) => ({ ...current, department_ids }))}
                open={openFilter === 'department'}
                onToggle={() => setOpenFilter((current) => (current === 'department' ? '' : 'department'))}
              />
              <ValueMultiSelect
                label="Area"
                options={areaOptions}
                value={filters.area_ids}
                onChange={(area_ids) => setFilters((current) => ({ ...current, area_ids }))}
                open={openFilter === 'area'}
                onToggle={() => setOpenFilter((current) => (current === 'area' ? '' : 'area'))}
              />
              <ValueMultiSelect
                label="Name"
                options={names.map((value) => ({ value, label: value }))}
                value={filters.names}
                onChange={(next) => setFilters((current) => ({ ...current, names: next }))}
                open={openFilter === 'name'}
                onToggle={() => setOpenFilter((current) => (current === 'name' ? '' : 'name'))}
              />
              <ValueMultiSelect
                label="Code"
                options={codes.map((value) => ({ value, label: value }))}
                value={filters.codes}
                onChange={(next) => setFilters((current) => ({ ...current, codes: next }))}
                open={openFilter === 'code'}
                onToggle={() => setOpenFilter((current) => (current === 'code' ? '' : 'code'))}
              />
              <label className="qr-labels__field">
                <span className="company-form__label">Reading required</span>
                <select
                  className="company-form__input"
                  value={filters.reading_required}
                  onChange={(event) => setFilters((current) => ({ ...current, reading_required: event.target.value }))}
                >
                  <option value="all">All</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </label>
              <label className="qr-labels__field">
                <span className="company-form__label">Active</span>
                <select
                  className="company-form__input"
                  value={filters.active}
                  onChange={(event) => setFilters((current) => ({ ...current, active: event.target.value }))}
                >
                  <option value="all">All</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </label>
              {filterFields.map((field) => (
                <ValueMultiSelect
                  key={field.id}
                  label={field.name}
                  options={fieldOptions[field.id] || []}
                  value={filters.fields[field.id] || []}
                  loading={fieldLoading === field.id}
                  onChange={(values) => setFieldFilter(field.id, values)}
                  open={openFilter === field.id}
                  onToggle={() => openField(field.id)}
                />
              ))}
            </div>
          </section>

          <section className="qr-labels__section">
            <h3>Fields on the label</h3>
            <p className="qr-labels__note">The QR prints on the left. Checked fields, including the code, print on the right.</p>
            <div className="qr-labels__checks">
              {printOptions.map((option) => (
                <label key={option.value} className="qr-labels__check">
                  <input
                    type="checkbox"
                    checked={printFields.includes(option.value)}
                    onChange={() => {
                      setPrintFields((current) => (
                        current.includes(option.value)
                          ? current.filter((value) => value !== option.value)
                          : [...current, option.value]
                      ))
                    }}
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
            {!printFields.length ? (
              <p className="qr-labels__note">Select at least one field.</p>
            ) : null}
          </section>

          <section className="qr-labels__section">
            <h3>Label size</h3>
            <p className="qr-labels__note">Each QR label is this size. Labels are spaced evenly on the paper so they can be cut apart.</p>
            <div className="qr-labels__paper-row">
            <label className="qr-labels__field">
              <span className="company-form__label">Label</span>
              <select
                className="company-form__input"
                value={showCustom === 'label' ? '__custom__' : labelId}
                onChange={(event) => {
                  const next = event.target.value
                  if (next === '__custom__') {
                    setShowCustom('label')
                    return
                  }
                  if (showCustom === 'label') setShowCustom('')
                  setLabelId(next)
                }}
              >
                {labelPresets.length ? (
                  <optgroup label="Label sizes">
                    {labelPresets.map((item) => (
                      <option key={item.id} value={item.id}>{item.label}</option>
                    ))}
                  </optgroup>
                ) : null}
                <optgroup label="Sheets">
                  {sheetPresets.map((item) => (
                    <option key={item.id} value={item.id}>{item.label}</option>
                  ))}
                </optgroup>
                {sizes.length ? (
                  <optgroup label="Saved">
                    {sizes.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} ({item.width_mm} × {item.height_mm} mm)
                      </option>
                    ))}
                  </optgroup>
                ) : null}
                {canSaveSizes ? <option value="__custom__">Custom size…</option> : null}
              </select>
            </label>
            <label className="qr-labels__field">
              <span className="company-form__label">Copies</span>
              <input
                className="company-form__input"
                type="number"
                min="1"
                max="10"
                inputMode="numeric"
                value={copies}
                aria-label="Number of copies"
                onChange={(event) => {
                  const raw = event.target.value
                  if (raw === '') {
                    setCopies('')
                    return
                  }
                  const next = Math.floor(Number(raw))
                  if (Number.isFinite(next)) setCopies(Math.min(10, Math.max(1, next)))
                }}
                onBlur={() => setCopies(clampCopies(copies))}
              />
            </label>
            </div>
            <p className="qr-labels__note">Each selected label is repeated this many times, in the same order.</p>
            {smallPaper ? (
              <p className="qr-labels__note">This label is short. Only a few fields fit beside the QR.</p>
            ) : null}
            {canSaveSizes && sizes.some((item) => item.id === labelId) ? (
              <button type="button" className="company-btn company-btn--secondary company-btn--compact" onClick={() => removeCustom(labelId)} disabled={busy}>
                Delete this size
              </button>
            ) : null}
          </section>

          <section className="qr-labels__section">
            <h3>Paper size</h3>
            <p className="qr-labels__note">Labels keep their size and are placed on this paper. A label printer can use the same size as the label.</p>
            <label className="qr-labels__field">
              <span className="company-form__label">Paper</span>
              <select
                className="company-form__input"
                value={showCustom === 'paper' ? '__custom__' : paperId}
                onChange={(event) => {
                  const next = event.target.value
                  if (next === '__custom__') {
                    setShowCustom('paper')
                    return
                  }
                  if (showCustom === 'paper') setShowCustom('')
                  setPaperId(next)
                }}
              >
                {labelPresets.length ? (
                  <optgroup label="Label printers">
                    {labelPresets.map((item) => (
                      <option key={item.id} value={item.id}>{item.label}</option>
                    ))}
                  </optgroup>
                ) : null}
                <optgroup label="Paper">
                  {sheetPresets.map((item) => (
                    <option key={item.id} value={item.id}>{item.label}</option>
                  ))}
                </optgroup>
                {sizes.length ? (
                  <optgroup label="Saved">
                    {sizes.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} ({item.width_mm} × {item.height_mm} mm)
                      </option>
                    ))}
                  </optgroup>
                ) : null}
                {canSaveSizes ? <option value="__custom__">Custom size…</option> : null}
              </select>
            </label>
            {paper && labelSize && !labelTooBig ? (
              <p className="qr-labels__note">{across} across and {down} down. Labels that do not fit start on the next sheet.</p>
            ) : null}
            {labelTooBig ? (
              <p className="qr-labels__note">The label is larger than the paper. Choose a smaller label or a larger paper.</p>
            ) : null}
            {canSaveSizes && sizes.some((item) => item.id === paperId) ? (
              <button type="button" className="company-btn company-btn--secondary company-btn--compact" onClick={() => removeCustom(paperId)} disabled={busy}>
                Delete this size
              </button>
            ) : null}
            {showCustom && canSaveSizes ? (
              <div className="qr-labels__custom">
                <p className="qr-labels__note">
                  {showCustom === 'label' ? 'Save this size for the label.' : 'Save this size for the paper.'}
                </p>
                <label className="qr-labels__field">
                  <span className="company-form__label">Name</span>
                  <input
                    className="company-form__input"
                    value={custom.name}
                    onChange={(event) => setCustom((current) => ({ ...current, name: event.target.value }))}
                    placeholder="Warehouse printer"
                  />
                </label>
                <label className="qr-labels__field">
                  <span className="company-form__label">Width</span>
                  <input
                    className="company-form__input"
                    inputMode="decimal"
                    value={custom.width}
                    onChange={(event) => setCustom((current) => ({ ...current, width: event.target.value }))}
                  />
                </label>
                <label className="qr-labels__field">
                  <span className="company-form__label">Height</span>
                  <input
                    className="company-form__input"
                    inputMode="decimal"
                    value={custom.height}
                    onChange={(event) => setCustom((current) => ({ ...current, height: event.target.value }))}
                  />
                </label>
                <label className="qr-labels__field">
                  <span className="company-form__label">Unit</span>
                  <select
                    className="company-form__input"
                    value={custom.unit}
                    onChange={(event) => setCustom((current) => ({ ...current, unit: event.target.value }))}
                  >
                    <option value="mm">mm</option>
                    <option value="in">inch</option>
                  </select>
                </label>
                <button type="button" className="company-btn company-btn--secondary" onClick={saveCustom} disabled={busy}>
                  Save size
                </button>
              </div>
            ) : null}
          </section>

          <section className="qr-labels__section">
            <h3>Sort</h3>
            <p className="qr-labels__note">Optional. Each level prints its value above that group, then the labels in the group. With none selected, labels follow name A to Z.</p>
            <div className="qr-labels__sort">
              {sortLevels.map((level, index) => (
                <div className="qr-labels__sort-row" key={`${level.column}-${index}`}>
                  <select
                    className="company-form__input"
                    aria-label={`Sort level ${index + 1}`}
                    value={level.column}
                    onChange={(event) => {
                      const column = event.target.value
                      setSortLevels((current) => current.map((item, itemIndex) => (
                        itemIndex === index ? { ...item, column } : item
                      )))
                    }}
                  >
                    {sortColumns.map((column) => (
                      <option key={column.value} value={column.value}>{column.label}</option>
                    ))}
                  </select>
                  <select
                    className="company-form__input"
                    aria-label={`Direction for sort level ${index + 1}`}
                    value={level.direction}
                    onChange={(event) => {
                      const direction = event.target.value
                      setSortLevels((current) => current.map((item, itemIndex) => (
                        itemIndex === index ? { ...item, direction } : item
                      )))
                    }}
                  >
                    <option value="asc">Ascending</option>
                    <option value="desc">Descending</option>
                  </select>
                  <button
                    type="button"
                    className="company-btn company-btn--secondary company-btn--compact"
                    disabled={index === 0}
                    onClick={() => setSortLevels((current) => {
                      const next = [...current]
                      const [row] = next.splice(index, 1)
                      next.splice(index - 1, 0, row)
                      return next
                    })}
                  >
                    Up
                  </button>
                  <button
                    type="button"
                    className="company-btn company-btn--secondary company-btn--compact"
                    disabled={index === sortLevels.length - 1}
                    onClick={() => setSortLevels((current) => {
                      const next = [...current]
                      const [row] = next.splice(index, 1)
                      next.splice(index + 1, 0, row)
                      return next
                    })}
                  >
                    Down
                  </button>
                  <button
                    type="button"
                    className="company-btn company-btn--secondary company-btn--compact"
                    onClick={() => setSortLevels((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                  >
                    Remove
                  </button>
                </div>
              ))}
              {sortLevels.length < 5 ? (
                <button
                  type="button"
                  className="company-btn company-btn--secondary company-btn--compact"
                  onClick={() => setSortLevels((current) => [...current, { column: unusedSortColumn(), direction: 'asc' }])}
                >
                  Add sort level
                </button>
              ) : null}
            </div>
          </section>
        </div>
        <div className="qr-labels__footer">
          <strong>{countLabel}</strong>
          <div className="qr-labels__footer-actions">
            <button type="button" className="company-btn company-btn--secondary" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button type="button" className="company-btn company-btn--primary" onClick={generate} disabled={generateDisabled}>
              {busy ? 'Preparing…' : 'Download PDF'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
