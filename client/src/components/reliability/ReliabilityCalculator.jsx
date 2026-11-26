import { useCallback, useEffect, useMemo, useState } from 'react'
import FilterableSelect from '../ui/FilterableSelect'
import DateField from '../ui/DateField'
import { useLocations } from '../../hooks/useLocations'
import { useDepartments } from '../../hooks/useDepartments'
import { useOrg } from '../../hooks/useOrg'
import { useOrgEquipmentFields } from '../../hooks/useOrgEquipmentFields'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import { downloadBlobFile } from '../../lib/api'
import { getEquipmentList } from '../../lib/api-equipment'
import { exportReliabilityExcel, getReliabilityReport } from '../../lib/api-reliability'
import { orderedHierarchyFields } from '../../lib/assetHierarchy'
import { defaultReliabilityDateRange } from './reliabilityFormat'
import {
  defaultNameFieldId,
  readStoredNameFieldId,
  writeStoredNameFieldId,
} from './nameFieldMapping'
import PlantSummaryTable from './PlantSummaryTable'
import EquipmentDetailsTable from './EquipmentDetailsTable'
import CalculationsPanel from './CalculationsPanel'
import ManualHoursModal from './ManualHoursModal'
import './ReliabilityCalculator.css'

const SUB_TABS = [
  { id: 'plant', label: 'Plant Summary' },
  { id: 'equipment', label: 'Equipment Details' },
  { id: 'calculations', label: 'Calculations' },
]

function monthRange() {
  return defaultReliabilityDateRange()
}

export default function ReliabilityCalculator({
  canManage = false,
  scopedLocationId = '',
  scopedDepartmentId = '',
  canPickLocation = true,
}) {
  const dates = useMemo(() => monthRange(), [])
  const { org } = useOrg()
  const { locations } = useLocations()
  const { departments } = useDepartments()
  const fieldsState = useOrgEquipmentFields()
  const assetMasterFields = useMemo(
    () => orderedHierarchyFields(fieldsState.fields),
    [fieldsState.fields],
  )

  const [subTab, setSubTab] = useState('plant')
  const [locationId, setLocationId] = useState(scopedLocationId || '')
  const [departmentId, setDepartmentId] = useState(scopedDepartmentId || '')
  const [equipmentId, setEquipmentId] = useState('')
  const [dateFrom, setDateFrom] = useState(dates.from)
  const [dateTo, setDateTo] = useState(dates.to)
  const [evaluationHours, setEvaluationHours] = useState('100')
  const [nameFieldId, setNameFieldId] = useState('')
  const [equipmentOptions, setEquipmentOptions] = useState([])
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState(null)
  const [manualOpen, setManualOpen] = useState(false)

  const debouncedEvaluationHours = useDebouncedValue(evaluationHours, 400)

  useEffect(() => {
    const stored = readStoredNameFieldId(org?.id)
    if (stored) {
      setNameFieldId(stored)
      return
    }
    const preferred = defaultNameFieldId(assetMasterFields) || 'asset_name'
    setNameFieldId((current) => current || preferred)
  }, [org?.id, assetMasterFields])

  useEffect(() => {
    if (scopedLocationId) setLocationId(scopedLocationId)
  }, [scopedLocationId])

  useEffect(() => {
    if (scopedDepartmentId) setDepartmentId(scopedDepartmentId)
  }, [scopedDepartmentId])

  const locationOptions = useMemo(() => {
    const rows = (locations || []).filter((row) => row.is_active !== false)
    return [
      ...(canPickLocation ? [{ value: '', label: 'All Plants' }] : []),
      ...rows.map((row) => ({ value: row.id, label: row.name })),
    ]
  }, [locations, canPickLocation])

  const departmentOptions = useMemo(() => {
    const rows = (departments || []).filter((row) => {
      if (row.is_active === false) return false
      if (locationId && row.location_id && row.location_id !== locationId) return false
      return true
    })
    return [
      { value: '', label: 'All Departments' },
      ...rows.map((row) => ({ value: row.id, label: row.name })),
    ]
  }, [departments, locationId])

  useEffect(() => {
    let cancelled = false
    getEquipmentList({
      locationId: locationId || scopedLocationId || undefined,
      departmentId: departmentId || scopedDepartmentId || undefined,
      limit: 500,
      offset: 0,
    })
      .then((page) => {
        if (cancelled) return
        const list = Array.isArray(page) ? page : (page?.items || [])
        setEquipmentOptions(list)
      })
      .catch(() => {
        if (!cancelled) setEquipmentOptions([])
      })
    return () => { cancelled = true }
  }, [locationId, departmentId, scopedLocationId, scopedDepartmentId])

  const equipmentSelectOptions = useMemo(() => ([
    { value: '', label: 'All Equipment' },
    ...equipmentOptions.map((row) => ({
      value: row.id,
      label: row.code ? `${row.name} (${row.code})` : row.name,
    })),
  ]), [equipmentOptions])

  const nonMeteredOptions = useMemo(
    () => equipmentOptions.filter((row) => row.reading_required !== true),
    [equipmentOptions],
  )

  const nameFieldOptions = useMemo(() => {
    const fromReport = Array.isArray(report?.nameFieldOptions) ? report.nameFieldOptions : []
    const source = fromReport.length ? fromReport : assetMasterFields
    return [
      { value: 'asset_name', label: 'Asset register name' },
      ...source.map((field) => ({
        value: field.id,
        label: field.name || field.label || field.id,
      })),
    ]
  }, [report?.nameFieldOptions, assetMasterFields])

  const loadReport = useCallback(async () => {
    setError(null)
    if (!dateFrom || !dateTo) {
      setError('From Date and To Date are required.')
      return
    }
    if (dateTo < dateFrom) {
      setError('To Date must be on or after From Date.')
      return
    }
    const evalHours = Number(debouncedEvaluationHours)
    if (!Number.isFinite(evalHours) || evalHours < 0) {
      setError('Evaluation Period must be a non-negative number of operating hours.')
      return
    }
    setLoading(true)
    try {
      const data = await getReliabilityReport({
        locationId: locationId || undefined,
        departmentId: departmentId || undefined,
        equipmentId: equipmentId || undefined,
        dateFrom,
        dateTo,
        evaluationHours: evalHours,
        nameFieldId: nameFieldId || undefined,
      })
      setReport(data)
    } catch (err) {
      setReport(null)
      setError(err.message || 'Failed to load reliability report.')
    } finally {
      setLoading(false)
    }
  }, [
    locationId,
    departmentId,
    equipmentId,
    dateFrom,
    dateTo,
    debouncedEvaluationHours,
    nameFieldId,
  ])

  useEffect(() => {
    loadReport()
  }, [loadReport])

  const handleExportExcel = useCallback(async () => {
    setError(null)
    if (!dateFrom || !dateTo) {
      setError('From Date and To Date are required.')
      return
    }
    setExporting(true)
    try {
      const file = await exportReliabilityExcel({
        locationId: locationId || undefined,
        departmentId: departmentId || undefined,
        equipmentId: equipmentId || undefined,
        dateFrom,
        dateTo,
        evaluationHours: Number(evaluationHours) || 100,
        nameFieldId: nameFieldId || undefined,
      })
      downloadBlobFile(file)
    } catch (err) {
      setError(err.message || 'Failed to export Excel.')
    } finally {
      setExporting(false)
    }
  }, [locationId, departmentId, equipmentId, dateFrom, dateTo, evaluationHours, nameFieldId])

  const tableActions = {
    exportBusy: exporting || loading,
    onExportExcel: handleExportExcel,
    canManage,
    onAddManualHours: () => setManualOpen(true),
  }

  return (
    <div className="company-panel reliability-calculator">
      <div className="reliability-calculator__filters-row" aria-label="Common report filters">
        <div className="company-form__field">
          <label className="company-form__label" htmlFor="reliability-plant">Plant</label>
          <FilterableSelect
            id="reliability-plant"
            value={locationId}
            onChange={(value) => {
              setLocationId(value)
              setEquipmentId('')
            }}
            options={locationOptions}
            getOptionValue={(opt) => opt.value}
            getOptionLabel={(opt) => opt.label}
            allowEmpty={false}
            disabled={!canPickLocation && Boolean(scopedLocationId)}
          />
        </div>

        <div className="company-form__field">
          <label className="company-form__label" htmlFor="reliability-department">Department</label>
          <FilterableSelect
            id="reliability-department"
            value={departmentId}
            onChange={(value) => {
              setDepartmentId(value)
              setEquipmentId('')
            }}
            options={departmentOptions}
            getOptionValue={(opt) => opt.value}
            getOptionLabel={(opt) => opt.label}
            allowEmpty={false}
            disabled={Boolean(scopedDepartmentId)}
          />
        </div>

        <div className="company-form__field">
          <label className="company-form__label" htmlFor="reliability-equipment">Equipment</label>
          <FilterableSelect
            id="reliability-equipment"
            value={equipmentId}
            onChange={setEquipmentId}
            options={equipmentSelectOptions}
            getOptionValue={(opt) => opt.value}
            getOptionLabel={(opt) => opt.label}
            allowEmpty={false}
          />
        </div>

        <div className="company-form__field">
          <label className="company-form__label" htmlFor="reliability-from">From Date</label>
          <DateField id="reliability-from" value={dateFrom} onChange={setDateFrom} />
        </div>

        <div className="company-form__field">
          <label className="company-form__label" htmlFor="reliability-to">To Date</label>
          <DateField id="reliability-to" value={dateTo} onChange={setDateTo} />
        </div>

        <div className="company-form__field">
          <label className="company-form__label" htmlFor="reliability-eval">Evaluation Period (h)</label>
          <input
            id="reliability-eval"
            className="company-form__input"
            type="number"
            min="0"
            step="1"
            value={evaluationHours}
            onChange={(event) => setEvaluationHours(event.target.value)}
            placeholder="Operating hours"
          />
        </div>

        <div className="company-form__field reliability-calculator__name-map">
          <label className="company-form__label" htmlFor="reliability-name-field">
            Equipment Name from
          </label>
          <FilterableSelect
            id="reliability-name-field"
            value={nameFieldId || 'asset_name'}
            onChange={(value) => {
              const next = value || 'asset_name'
              setNameFieldId(next)
              writeStoredNameFieldId(org?.id, next)
            }}
            options={nameFieldOptions}
            getOptionValue={(opt) => opt.value}
            getOptionLabel={(opt) => opt.label}
            allowEmpty={false}
          />
        </div>
      </div>

      <nav className="company-tabs" aria-label="Reliability views">
        {SUB_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`company-tabs__btn${subTab === tab.id ? ' company-tabs__btn--active' : ''}`}
            onClick={() => setSubTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {error ? <div className="company-error">{error}</div> : null}
      {loading && !report ? <div className="company-loading">Loading reliability report…</div> : null}
      {loading && report ? (
        <div className="reliability-calculator__refreshing" aria-live="polite">Updating…</div>
      ) : null}

      {report && subTab === 'plant' && (
        <PlantSummaryTable
          plantSummary={report.plantSummary}
          evaluationHours={report.evaluationHours}
          terminology={report.terminology}
          {...tableActions}
        />
      )}
      {report && subTab === 'equipment' && (
        <EquipmentDetailsTable
          rows={report.equipmentRows}
          {...tableActions}
        />
      )}
      {report && subTab === 'calculations' && (
        <CalculationsPanel
          calculationExamples={report.calculationExamples}
          {...tableActions}
        />
      )}

      {manualOpen && (
        <ManualHoursModal
          equipmentOptions={nonMeteredOptions}
          defaultFrom={dateFrom}
          defaultTo={dateTo}
          onClose={() => setManualOpen(false)}
          onSaved={() => {
            loadReport()
          }}
        />
      )}
    </div>
  )
}
