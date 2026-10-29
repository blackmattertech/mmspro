import { useEffect, useMemo, useRef, useState } from 'react'
import WorkRequestAssetFields from '../workrequests/WorkRequestAssetFields'
import FilterableSelect from '../ui/FilterableSelect'
import { getEquipment, getEquipmentCatalog } from '../../lib/api-equipment'
import { catalogRowFromEquipmentDetail } from '../../lib/equipmentLayoutFields'

function formatEquipmentLabel(row) {
  return [row?.name, row?.code].filter(Boolean).join(' · ') || row?.id || ''
}

export default function WorkOrderAssetPicker({
  departmentId = '',
  requireDepartment = true,
  equipmentId = '',
  onEquipmentIdChange,
  fieldValues = {},
  onFieldValuesChange,
  disabled = false,
}) {
  const [equipment, setEquipment] = useState([])
  const [sections, setSections] = useState([])
  const [loading, setLoading] = useState(false)
  const [empty, setEmpty] = useState(false)
  const [pinned, setPinned] = useState(null)
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
    getEquipmentCatalog({
      departmentId: departmentId || undefined,
      limit: 500,
    })
      .then((catalog) => {
        if (cancelled) return
        const rows = (catalog.equipment || []).filter((row) => (
          !departmentId
          || !row.department_id
          || String(row.department_id) === String(departmentId)
        ))
        setEquipment(rows)
        setSections(Array.isArray(catalog.sections) ? catalog.sections : [])
        setEmpty(!rows.length)
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
  }, [departmentId, requireDepartment])

  const equipmentOptions = useMemo(() => {
    if (!pinned) return equipment
    const shaped = catalogRowFromEquipmentDetail(pinned)
    if (equipment.some((row) => row.id === pinned.id)) return equipment
    return shaped ? [shaped, ...equipment] : equipment
  }, [equipment, pinned])

  const hasAssetFields = sections.some((section) => (section.fields || []).length > 0)
  const hasPinnedEquipment = pinned?.id && pinned.id === equipmentId

  if (requireDepartment && !departmentId) {
    return (
      <p className="wo-manual__intro" style={{ margin: 0 }}>
        Select Order To to see assets for that department.
      </p>
    )
  }

  return (
    <>
      {loading && (
        <p className="wo-manual__intro" style={{ marginTop: 0 }}>Loading assets…</p>
      )}
      {!loading && empty && !hasPinnedEquipment && (
        <div className="wo-alert wo-alert--error" role="alert">
          No assets are available for the selected department.
        </div>
      )}
      {hasAssetFields ? (
        <WorkRequestAssetFields
          sections={sections}
          equipment={equipmentOptions}
          fieldValues={fieldValues}
          onFieldValuesChange={onFieldValuesChange}
          equipmentId={equipmentId}
          onEquipmentIdChange={onEquipmentIdChange}
          loading={loading}
          disabled={disabled}
        />
      ) : (
        <label className="company-form__field company-form__field--full">
          <span className="company-form__label">Asset</span>
          <FilterableSelect
            value={equipmentId}
            onChange={onEquipmentIdChange}
            options={equipmentOptions}
            getOptionValue={(row) => row.id}
            getOptionLabel={formatEquipmentLabel}
            placeholder={loading ? 'Loading assets…' : 'Select asset'}
            className="company-form__input--select"
            disabled={disabled || loading}
          />
        </label>
      )}
    </>
  )
}
