import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react'
import WorkRequestAssetFields from '../workrequests/WorkRequestAssetFields'
import { getEquipment, getEquipmentCatalog, lookupEquipment } from '../../lib/api-equipment'
import { getWorkRequestEquipmentCatalog } from '../../lib/api-work-requests'
import { catalogRowFromEquipmentDetail } from '../../lib/equipmentLayoutFields'
import { parseEquipmentScan } from '../../lib/equipmentQr'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import NavIcon from '../layout/NavIcon'
import './AssetPickerField.css'

const EquipmentScanner = lazy(() => import('../equipment/EquipmentScanner'))

const NAME_FIELD_ID = 'equipment-name'

function pickerSections(sections) {
  if ((sections || []).some((section) => (section.fields || []).length > 0)) return sections
  return [{
    id: 'wo-asset',
    name: 'Asset',
    fields: [{
      id: NAME_FIELD_ID,
      name: 'Asset',
      field_type: 'dropdown',
      is_required: true,
      sort_order: 0,
    }],
  }]
}

function withNameValue(row) {
  if (!row) return row
  const label = [row.name, row.code].filter(Boolean).join(' · ') || row.id || ''
  if (!label) return row
  return {
    ...row,
    values: { ...(row.values || {}), [NAME_FIELD_ID]: row.values?.[NAME_FIELD_ID] || label },
  }
}

/**
 * Canonical Asset picker used by every form that includes system:asset_picker.
 * Owns catalog loading, empty/loading states, and pinned equipment.
 */
export default function AssetPickerField({
  departmentId = '',
  locationId = '',
  requireDepartment = true,
  equipmentId = '',
  onEquipmentIdChange,
  fieldValues = {},
  onFieldValuesChange,
  disabled = false,
  required = false,
  readOnly = false,
  searchEnabled = true,
  /** 'equipment' | 'work_request' */
  catalogSource = 'equipment',
  className = '',
  domId = '',
  emptyDepartmentMessage = 'Select Order to to see assets for that department.',
  readOnlySummary = null,
}) {
  const [equipment, setEquipment] = useState([])
  const [sections, setSections] = useState([])
  const [loading, setLoading] = useState(false)
  const [empty, setEmpty] = useState(false)
  const [pinned, setPinned] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [scannerOpen, setScannerOpen] = useState(false)
  const [scanSession, setScanSession] = useState(0)
  const [scanNotice, setScanNotice] = useState(null)
  const debouncedSearch = useDebouncedValue(searchEnabled ? searchQuery.trim() : '')
  const prevDeptRef = useRef(departmentId)
  const onEquipmentIdChangeRef = useRef(onEquipmentIdChange)
  const onFieldValuesChangeRef = useRef(onFieldValuesChange)
  onEquipmentIdChangeRef.current = onEquipmentIdChange
  onFieldValuesChangeRef.current = onFieldValuesChange

  useEffect(() => {
    const previous = prevDeptRef.current
    prevDeptRef.current = departmentId
    if (!previous || previous === departmentId) return
    onFieldValuesChangeRef.current?.({})
    onEquipmentIdChangeRef.current?.('')
  }, [departmentId])

  useEffect(() => {
    if (!equipmentId) {
      setPinned(null)
      return undefined
    }
    let cancelled = false
    getEquipment(equipmentId)
      .then((row) => {
        if (!cancelled && row) setPinned(row)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [equipmentId])

  useEffect(() => {
    if (requireDepartment && !departmentId) {
      setEquipment([])
      setSections([])
      setEmpty(false)
      setLoading(false)
      return undefined
    }

    let cancelled = false
    setLoading(true)

    const load = catalogSource === 'work_request' && departmentId
      ? getWorkRequestEquipmentCatalog(departmentId, {
        search: debouncedSearch || undefined,
        limit: 500,
      })
      : getEquipmentCatalog({
        departmentId: departmentId || undefined,
        locationId: locationId || undefined,
        search: debouncedSearch || undefined,
        limit: 500,
      })

    load
      .then((catalog) => {
        if (cancelled) return
        const rows = (catalog.equipment || []).filter((row) => (
          !departmentId
          || !row.department_id
          || String(row.department_id) === String(departmentId)
        ))
        setEquipment(rows)
        setSections(Array.isArray(catalog.sections) ? catalog.sections : [])
        setEmpty(catalog.has_assets === false || !rows.length)
      })
      .catch(() => {
        if (cancelled) return
        setEquipment([])
        setSections([])
        setEmpty(true)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [catalogSource, departmentId, locationId, requireDepartment, debouncedSearch])

  const equipmentOptions = useMemo(() => {
    const rows = (() => {
      if (!pinned) return equipment
      const shaped = catalogRowFromEquipmentDetail(pinned)
      if (equipment.some((row) => row.id === pinned.id)) return equipment
      return shaped ? [shaped, ...equipment] : equipment
    })()
    if (sections.some((section) => (section.fields || []).length > 0)) return rows
    return rows.map(withNameValue)
  }, [equipment, pinned, sections])

  const assetSections = useMemo(() => pickerSections(sections), [sections])
  const hasPinnedEquipment = pinned?.id && pinned.id === equipmentId

  const openScanner = () => {
    if (disabled || (requireDepartment && !departmentId)) return
    setScanNotice(null)
    setScannerOpen(true)
  }

  const handleScan = async (text) => {
    const parsed = parseEquipmentScan(text)
    try {
      const row = parsed.equipmentId
        ? await getEquipment(parsed.equipmentId)
        : await lookupEquipment(text)
      if (!row?.id) {
        throw new Error('This code is not an asset record in your organization.')
      }
      if (
        departmentId
        && row.department_id
        && String(row.department_id) !== String(departmentId)
      ) {
        throw new Error('That asset belongs to a different department than Order to.')
      }
      setPinned(row)
      onEquipmentIdChangeRef.current?.(row.id)
      setScannerOpen(false)
      setScanNotice(null)
      setSearchQuery('')
    } catch (err) {
      setScanNotice(err.message || 'This code is not an asset record in your organization.')
      setScanSession((value) => value + 1)
      throw err
    }
  }

  const scanButton = (
    <button
      type="button"
      className="asset-picker-search__scan"
      onClick={openScanner}
      disabled={disabled || loading || (requireDepartment && !departmentId)}
      aria-label="Scan asset QR code"
    >
      <NavIcon name="scan" />
      <span>Scan</span>
    </button>
  )

  const rootClass = `wr-asset-picker company-form__field company-form__field--full ${className}`.trim()

  if (readOnly) {
    return (
      <div id={domId || undefined} className={rootClass}>
        {readOnlySummary}
      </div>
    )
  }

  if (requireDepartment && !departmentId) {
    return (
      <div id={domId || undefined} className={rootClass}>
        <p className="wo-manual__intro" style={{ margin: 0 }}>
          {emptyDepartmentMessage}
        </p>
      </div>
    )
  }

  return (
    <div id={domId || undefined} className={rootClass}>
      {!departmentId && !requireDepartment ? (
        <p className="wo-manual__intro" style={{ margin: 0 }}>
          Showing all assets. Select Order To to filter by attending department.
        </p>
      ) : null}
      {searchEnabled ? (
        <div className="asset-picker-search">
          <label className="company-form__field asset-picker-search__field">
            <span className="company-form__label">Search assets</span>
            <input
              className="company-form__input"
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name or code"
              disabled={disabled || loading}
            />
          </label>
          {scanButton}
        </div>
      ) : (
        <div className="asset-picker-search asset-picker-search__scan-only">
          {scanButton}
        </div>
      )}
      {loading && (
        <p className="wo-manual__intro" style={{ marginTop: 0 }}>Loading assets…</p>
      )}
      {!loading && empty && !hasPinnedEquipment && (
        <div className="wo-alert wo-alert--error" role="alert">
          {departmentId
            ? 'No assets are available for the selected department.'
            : 'No assets are available.'}
        </div>
      )}
      <WorkRequestAssetFields
        sections={assetSections}
        equipment={equipmentOptions}
        fieldValues={fieldValues}
        onFieldValuesChange={onFieldValuesChange}
        equipmentId={equipmentId}
        onEquipmentIdChange={onEquipmentIdChange}
        loading={loading}
        disabled={disabled}
        required={required}
      />
      {scannerOpen ? (
        <Suspense fallback={null}>
          <EquipmentScanner
            key={scanSession}
            notice={scanNotice}
            onClose={() => setScannerOpen(false)}
            onResult={handleScan}
          />
        </Suspense>
      ) : null}
    </div>
  )
}
