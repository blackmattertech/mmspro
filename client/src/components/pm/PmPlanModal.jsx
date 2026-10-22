import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useBackdropClose } from '../../hooks/useBackdropClose'
import { useDepartments } from '../../hooks/useDepartments'
import { useLocations } from '../../hooks/useLocations'
import { useEmployees } from '../../hooks/useEmployees'
import { usePermissions } from '../../hooks/usePermissions'
import { useProfile } from '../../hooks/useProfile'
import { getEquipment, getEquipmentCatalog } from '../../lib/api-equipment'
import { getLatestMeterReading } from '../../lib/api-logbook'
import { formatMeterLogger, formatMeterStamp, formatMeterValue } from '../../lib/meterReading'
import { getChecklistTemplates, getPmActivityTypes } from '../../lib/api-pm'
import { isMaintenanceDepartment } from '../../lib/departmentLocation'
import { PM_PRIORITIES, PM_SCHEDULE_TYPES, PM_CALENDAR_UNITS, CALENDAR_SCHEDULE_TYPES, normalizeScheduleType, normalizeCalendarUnit } from '../../config/pm'
import DateField from '../ui/DateField'
import FilterableSelect from '../ui/FilterableSelect'
import GooToggle from '../ui/GooToggle'
import SpellcheckInput from '../shared/SpellcheckInput'
import TechnicianMultiSelect from '../workrequests/TechnicianMultiSelect'
import PageBack from '../shared/PageBack'
import { useFormLayout } from '../../hooks/useFormLayout'
import { useFormFieldValues } from '../../hooks/useFormFieldValues'
import CatalogExtrasGrid from '../forms/CatalogExtrasGrid'
import OrderedFormLayout from '../forms/OrderedFormLayout'
import ChecklistOptIn from '../forms/ChecklistOptIn'
import { missingRequiredLayoutValues, splitBoundValues } from '../../lib/formFieldSources'
import { masterId } from '../../lib/formLayoutIds'
import { catalogRowFromEquipmentDetail, equipmentCatalogParents, prefillValuesForFields } from '../../lib/equipmentLayoutFields'
import WorkRequestAssetFields from '../workrequests/WorkRequestAssetFields'
import { resolveFormActors, validateRepeatableGroups } from '../../lib/formFillership'
import { useAuth } from '../../hooks/useAuth'
import '../company/CompanyShared.css'
import './Pm.css'

const STEPS = [
  { id: 1, label: 'Plan details' },
  { id: 2, label: 'Technicians' },
  { id: 3, label: 'Checklist' },
]

const EMPTY = {
  name: '',
  department_id: '',
  location_id: '',
  area_id: '',
  equipment_id: '',
  activity_type_id: '',
  work_center: 'General',
  priority: 'medium',
  status: 'inactive',
  schedule_type: 'calendar',
  calendar_unit: 'month',
  every_n: 1,
  weekdays: [],
  custom_interval: 1,
  custom_unit: 'day',
  never_ends: false,
  start_date: '',
  end_date: '',
  grace_days: '',
  generate_before_days: 1,
  last_reading: '',
  last_service_date: '',
  reading_interval: '',
  whichever_comes_first: true,
  checklist_template_id: '',
  technician_ids: [],
}

function pickerSections(sections) {
  if ((sections || []).some((section) => (section.fields || []).length)) return sections
  return [{
    id: 'pm-asset',
    name: 'Asset',
    fields: [{
      id: 'equipment-name',
      name: 'Equipment name',
      field_type: 'dropdown',
      is_required: true,
      sort_order: 0,
    }],
  }]
}

function formFromPlan(plan) {
  if (!plan) return { ...EMPTY }
  const scheduleType = normalizeScheduleType(plan.schedule_type)
  return {
    name: plan.name || '',
    department_id: plan.department_id || '',
    location_id: plan.location_id || '',
    area_id: plan.area_id || '',
    equipment_id: plan.equipment_id || '',
    activity_type_id: plan.activity_type_id || '',
    work_center: plan.work_center || 'General',
    priority: plan.priority || 'medium',
    status: plan.status === 'inactive' ? 'inactive' : 'active',
    schedule_type: scheduleType,
    calendar_unit: normalizeCalendarUnit(plan.calendar_unit, plan.schedule_type),
    every_n: plan.every_n || 1,
    weekdays: Array.isArray(plan.weekdays) ? plan.weekdays : [],
    custom_interval: plan.custom_interval || plan.every_n || 1,
    custom_unit: plan.custom_unit || 'day',
    never_ends: plan.never_ends === true,
    start_date: plan.start_date ? String(plan.start_date).slice(0, 10) : '',
    end_date: plan.end_date ? String(plan.end_date).slice(0, 10) : '',
    grace_days: plan.grace_days ?? '',
    generate_before_days: plan.generate_before_days ?? 1,
    last_reading: plan.last_reading ?? '',
    last_service_date: plan.last_service_date ? String(plan.last_service_date).slice(0, 10) : '',
    reading_interval: plan.reading_interval ?? '',
    whichever_comes_first: plan.whichever_comes_first !== false,
    checklist_template_id: plan.checklist_template_id || '',
    technician_ids: (plan.technicians || []).map((row) => row.id),
  }
}

export default function PmPlanModal({ plan, saving, onClose, onSave }) {
  const [form, setForm] = useState(() => formFromPlan(plan))
  const [step, setStep] = useState(1)
  const [error, setError] = useState(null)
  const [activityTypes, setActivityTypes] = useState([])
  const [checklists, setChecklists] = useState([])
  const [catalogEquipment, setCatalogEquipment] = useState([])
  const [assetSections, setAssetSections] = useState([])
  const [assetFieldValues, setAssetFieldValues] = useState({})
  const [catalogLoading, setCatalogLoading] = useState(false)
  const formRef = useRef(null)
  const handleBackdropClick = useBackdropClose(onClose)
  const { layout, catalogFields, isVisible, fieldClass, hasLayout } = useFormLayout('pm.plan')
  const extras = useFormFieldValues('pm.plan', plan?.id)
  const { departments } = useDepartments()
  const { locations } = useLocations()
  const { employees } = useEmployees({
    locationId: form.location_id || undefined,
    forAssignment: true,
    limit: 50,
    enabled: Boolean(form.location_id),
  })
  const { locationId: scopedLocationId, isOrgAdmin, session, canUpdate } = usePermissions()
  const { employee } = useProfile()
  const { user } = useAuth()
  const formActors = useMemo(() => resolveFormActors({
    formId: 'pm.plan',
    isOrgAdmin,
    profileId: user?.id,
    employeeId: session?.employee_id || employee?.id,
    isDepartmentHead: session?.is_department_head,
    employeeDepartmentId: session?.department_id || employee?.department_id,
    canApproveIncoming: canUpdate('work_request_approve') || canUpdate('work_request_incoming'),
    isCreate: !plan?.id,
    record: plan ? {
      created_by: plan.created_by,
      technician_ids: form.technician_ids,
    } : null,
  }), [
    isOrgAdmin,
    user?.id,
    session?.employee_id,
    session?.is_department_head,
    session?.department_id,
    employee?.id,
    employee?.department_id,
    canUpdate,
    plan,
    form.technician_ids,
  ])

  useEffect(() => {
    setForm(formFromPlan(plan))
    setStep(1)
    setError(null)
    setAssetFieldValues({})
  }, [plan])

  const equipmentSeedKey = useRef('')
  useEffect(() => {
    if (plan?.id || !form.equipment_id) return undefined
    const key = `${form.equipment_id}:${(catalogFields || []).length}`
    if (equipmentSeedKey.current === key) return undefined
    equipmentSeedKey.current = key
    let cancelled = false
    getEquipment(form.equipment_id)
      .then((row) => {
        if (cancelled || !row) return
        const filled = prefillValuesForFields(row, equipmentCatalogParents(catalogFields))
        const seeded = { ...filled }
        if (row.location_id) seeded[masterId('locations')] = row.location_id
        if (row.department_id) seeded[masterId('departments')] = row.department_id
        if (row.area_id) seeded[masterId('areas')] = row.area_id
        seeded[masterId('equipment')] = row.id
        extras.setValues((prev) => {
          const next = { ...prev }
          let changed = false
          for (const [fieldId, value] of Object.entries(seeded)) {
            if (value == null || value === '') continue
            if (next[fieldId] == null || next[fieldId] === '') {
              next[fieldId] = value
              changed = true
            }
          }
          return changed ? next : prev
        })
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [plan?.id, form.equipment_id, catalogFields, extras.setValues])

  useEffect(() => {
    let cancelled = false
    Promise.all([
      getPmActivityTypes(),
      getChecklistTemplates({ includeInactive: true }),
    ]).then(([types, templates]) => {
      if (cancelled) return
      setActivityTypes(types || [])
      setChecklists(templates || [])
    }).catch((err) => {
      if (!cancelled) setError(err.message)
    })
    return () => { cancelled = true }
  }, [])

  const selectedEquipmentRef = useRef(form.equipment_id)
  selectedEquipmentRef.current = form.equipment_id
  const catalogRef = useRef(catalogEquipment)
  catalogRef.current = catalogEquipment
  const qrLoadRef = useRef('')

  useEffect(() => {
    if (!form.location_id && !form.department_id) {
      setCatalogEquipment([])
      setAssetSections([])
      setCatalogLoading(false)
      return undefined
    }
    let cancelled = false
    qrLoadRef.current = ''
    setCatalogLoading(true)
    getEquipmentCatalog({
      departmentId: form.department_id || undefined,
      locationId: form.location_id || undefined,
      limit: 200,
    }).then(async (catalog) => {
      if (cancelled) return
      let list = catalog?.equipment || []
      const selectedId = selectedEquipmentRef.current
      if (selectedId && !list.some((row) => row.id === selectedId)) {
        try {
          const detail = await getEquipment(selectedId)
          const shaped = catalogRowFromEquipmentDetail(detail)
          if (shaped) {
            if (!shaped.area_name) shaped.area_name = detail?.areas?.name || detail?.area_name || null
            if (!shaped.qr_code && detail?.qr_code) shaped.qr_code = detail.qr_code
            list = [shaped, ...list]
          }
        } catch {
          // The saved id still submits even if the picker row is missing.
        }
      }
      if (cancelled) return
      setCatalogEquipment(list)
      setAssetSections(pickerSections(catalog?.sections))
    }).catch(() => {
      if (!cancelled) {
        setCatalogEquipment([])
        setAssetSections(pickerSections([]))
      }
    }).finally(() => {
      if (!cancelled) setCatalogLoading(false)
    })
    return () => { cancelled = true }
  }, [form.department_id, form.location_id])

  useEffect(() => {
    const id = form.equipment_id
    if (!id || catalogLoading) return undefined
    const row = catalogEquipment.find((item) => item.id === id)
    if (!row || row.qr_code || qrLoadRef.current === id) return undefined
    qrLoadRef.current = id
    let cancelled = false
    getEquipment(id)
      .then((detail) => {
        if (cancelled || !detail?.qr_code) return
        setCatalogEquipment((prev) => prev.map((item) => (
          item.id === id ? { ...item, qr_code: detail.qr_code } : item
        )))
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [form.equipment_id, catalogEquipment, catalogLoading])

  const handleAssetValuesChange = useCallback((next) => {
    setAssetFieldValues(next || {})
  }, [])

  const handleAssetEquipmentChange = useCallback((id) => {
    const row = catalogRef.current.find((item) => item.id === id)
    setForm((prev) => {
      const nextId = id || ''
      const nextArea = row?.area_id || (nextId ? prev.area_id : '')
      if (prev.equipment_id === nextId && prev.area_id === nextArea) return prev
      return { ...prev, equipment_id: nextId, area_id: nextArea }
    })
  }, [])

  const locationOptions = useMemo(
    () => (locations || []).filter((row) => row.is_active !== false),
    [locations],
  )

  const pickLocationId = (departmentId, currentLocationId = '') => {
    const dept = departments.find((row) => row.id === departmentId)
    if (dept?.location_id) return dept.location_id
    const allowed = new Set(locationOptions.map((row) => row.id))
    if (currentLocationId && allowed.has(currentLocationId)) return currentLocationId
    if (scopedLocationId && allowed.has(scopedLocationId)) return scopedLocationId
    if (employee?.location_id && allowed.has(employee.location_id)) return employee.location_id
    if (locationOptions.length === 1) return locationOptions[0].id
    return currentLocationId || ''
  }

  useEffect(() => {
    if (!locationOptions.length) return
    setForm((prev) => {
      const nextLocationId = pickLocationId(prev.department_id, prev.location_id)
      if (!nextLocationId || nextLocationId === prev.location_id) return prev
      return {
        ...prev,
        location_id: nextLocationId,
        area_id: prev.location_id && prev.location_id !== nextLocationId ? '' : prev.area_id,
        equipment_id: prev.location_id && prev.location_id !== nextLocationId ? '' : prev.equipment_id,
      }
    })
  }, [locationOptions, departments, scopedLocationId, employee?.location_id])

  const setField = (key, value) => {
    setForm((prev) => {
      const next = { ...prev, [key]: value }
      if (key === 'department_id') {
        next.location_id = pickLocationId(value, prev.location_id)
        next.area_id = ''
        next.equipment_id = ''
        next.technician_ids = []
      }
      if (key === 'location_id' || key === 'area_id') {
        next.equipment_id = ''
      }
      if (key === 'location_id') {
        next.technician_ids = []
      }
      return next
    })
  }

  const usesCalendar = CALENDAR_SCHEDULE_TYPES.has(form.schedule_type)
  const usesReading = form.schedule_type === 'reading' || form.schedule_type === 'both'
  const [latestReading, setLatestReading] = useState(null)
  const [latestLoading, setLatestLoading] = useState(false)
  const filledReadingFor = useRef(null)

  useEffect(() => {
    filledReadingFor.current = null
  }, [plan])

  useEffect(() => {
    if (!usesReading || !form.equipment_id) {
      setLatestReading(null)
      setLatestLoading(false)
      return undefined
    }
    const equipmentId = form.equipment_id
    const equipmentChanged = filledReadingFor.current != null && filledReadingFor.current !== equipmentId
    let cancelled = false
    setLatestLoading(true)
    getLatestMeterReading(equipmentId)
      .then((row) => {
        if (cancelled) return
        setLatestReading(row)
        const nextValue = row?.reading == null || row.reading === '' ? '' : String(row.reading)
        setForm((prev) => {
          if (prev.equipment_id !== equipmentId) return prev
          const hasValue = String(prev.last_reading ?? '') !== ''
          if (hasValue && !equipmentChanged) return prev
          if (String(prev.last_reading ?? '') === nextValue) return prev
          return { ...prev, last_reading: nextValue }
        })
        filledReadingFor.current = equipmentId
      })
      .catch(() => {
        if (!cancelled) setLatestReading(null)
      })
      .finally(() => {
        if (!cancelled) setLatestLoading(false)
      })
    return () => { cancelled = true }
  }, [usesReading, form.equipment_id])

  const renderLatestReading = () => {
    if (!form.equipment_id) {
      return <p className="pm-section__hint">Select equipment to show the latest meter reading.</p>
    }
    if (latestLoading) {
      return <p className="pm-section__hint">Loading the latest meter reading…</p>
    }
    if (latestReading?.reading == null) {
      return <p className="pm-section__hint">No meter reading has been logged for this equipment yet.</p>
    }
    return (
      <p className="pm-section__hint">
        Latest meter reading: <strong>{formatMeterValue(latestReading.reading)}</strong>
        {latestReading.reading_at ? ` · ${formatMeterStamp(latestReading.reading_at)}` : ''}
        {formatMeterLogger(latestReading) ? ` · ${formatMeterLogger(latestReading)}` : ''}
      </p>
    )
  }

  const technicians = useMemo(() => {
    const selected = new Set(form.technician_ids)
    return (employees || []).filter((employee) => {
      if (selected.has(employee.id)) return true
      if (employee.is_active === false) return false
      return isMaintenanceDepartment(employee.departments)
    })
  }, [employees, form.technician_ids])

  const goToStep = (nextStep) => {
    setError(null)
    setStep(nextStep)
    formRef.current?.scrollTo?.({ top: 0 })
  }

  const validateDetails = () => {
    if (hasLayout) {
      const missing = missingRequiredLayoutValues(layout, {
        systemValues: {
          ...form,
          schedule: form.schedule_type && (!usesCalendar || form.start_date) ? form.schedule_type : '',
        },
        masterValues: extras.values,
        catalogValues: extras.values,
      })
      if (missing.length) {
        setError(`Please fill in: ${missing.join(', ')}`)
        return false
      }
      const groupErrors = validateRepeatableGroups(layout, extras.values, { actors: formActors })
      if (groupErrors.length) {
        setError(groupErrors[0])
        return false
      }
      return true
    }
    const requiredChecks = [
      { ok: Boolean(form.name.trim()), id: 'pm-field-name', label: 'PM plan name' },
      { ok: Boolean(form.department_id), id: 'pm-field-department', label: 'Department' },
      { ok: Boolean(form.activity_type_id), id: 'pm-field-activity', label: 'Maintenance activity type' },
      { ok: Boolean(form.work_center.trim()), id: 'pm-field-work-center', label: 'Work center' },
      { ok: Boolean(form.equipment_id), id: 'pm-field-equipment', label: 'Equipment' },
      { ok: !usesCalendar || Boolean(form.start_date), id: 'pm-field-start-date', label: 'Start date' },
      { ok: !usesCalendar || Boolean(form.calendar_unit), id: 'pm-field-calendar-unit', label: 'Interval type' },
      { ok: !usesCalendar || Boolean(form.every_n), id: 'pm-field-every', label: 'Interval value' },
      { ok: !usesReading || Boolean(form.reading_interval), id: 'pm-field-reading-interval', label: 'Reading value' },
      { ok: form.generate_before_days !== '' && form.generate_before_days != null, id: 'pm-field-generate-before', label: 'Generate before due' },
    ]
    const missing = requiredChecks.find((row) => !row.ok)
    if (!missing) return true
    setError(`Please fill in ${missing.label}.`)
    setStep(1)
    requestAnimationFrame(() => {
      const el = document.getElementById(missing.id)
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el?.querySelector('input:not([disabled]), textarea, button')?.focus()
    })
    return false
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError(null)

    if (hasLayout) {
      if (!validateDetails()) return
    } else if (step < 3) {
      if (step === 1 && !validateDetails()) return
      goToStep(step + 1)
      return
    }

    if (!hasLayout && !validateDetails()) return

    try {
      const { native, extras: extraValues } = splitBoundValues('pm.plan', extras.values, layout)
      const saved = await onSave({
        name: form.name.trim() || 'Untitled plan',
        department_id: form.department_id || native.department_id || null,
        location_id: form.location_id || native.location_id || null,
        area_id: form.area_id || native.area_id || null,
        equipment_id: form.equipment_id || native.equipment_id || null,
        activity_type_id: form.activity_type_id || native.activity_type_id || null,
        work_center: form.work_center.trim() || 'General',
        priority: form.priority,
        status: form.status,
        schedule_type: form.schedule_type,
        calendar_unit: form.calendar_unit,
        every_n: Number(form.every_n) || 1,
        weekdays: form.weekdays,
        custom_interval: Number(form.custom_interval) || 1,
        custom_unit: form.custom_unit,
        never_ends: Boolean(form.never_ends),
        start_date: form.start_date || null,
        end_date: form.never_ends ? null : (form.end_date || null),
        grace_days: form.grace_days === '' ? null : Number(form.grace_days),
        generate_before_days: Number(form.generate_before_days) || 0,
        last_reading: form.last_reading === '' ? null : Number(form.last_reading),
        last_service_date: form.last_service_date || null,
        reading_interval: form.reading_interval === '' ? null : Number(form.reading_interval),
        whichever_comes_first: form.schedule_type === 'both' ? Boolean(form.whichever_comes_first) : true,
        checklist_template_id: form.checklist_template_id || native.checklist_template_id || null,
        contractor_vendor_id: null,
        estimated_labour_hours: null,
        estimated_duration_hours: null,
        required_tools: null,
        required_skills: null,
        allow_multiple_open: false,
        technician_ids: form.technician_ids?.length
          ? form.technician_ids
          : (Array.isArray(native.technician_ids) ? native.technician_ids : []),
      })
      const recordId = saved?.id || plan?.id
      if (recordId) await extras.save(recordId, extraValues)
    } catch (err) {
      setError(err.message)
    }
  }

  let assetPickerShown = false
  const renderAssetPicker = (className = 'company-form__field company-form__field--full') => (
    <div className={className} id="pm-field-equipment">
      {!form.location_id && !form.department_id ? (
        <p className="pm-section__hint">Select a plant to choose area and equipment.</p>
      ) : (
        <WorkRequestAssetFields
          key={`${plan?.id || 'new'}:${form.location_id}:${form.department_id}`}
          sections={pickerSections(assetSections)}
          equipment={catalogEquipment}
          fieldValues={assetFieldValues}
          onFieldValuesChange={handleAssetValuesChange}
          equipmentId={form.equipment_id}
          onEquipmentIdChange={handleAssetEquipmentChange}
          seedAreaId={form.area_id}
          loading={catalogLoading}
          disabled={saving}
        />
      )}
    </div>
  )

  return (
    <div
      className="company-modal-overlay company-modal-overlay--popup pm-modal-overlay"
      onMouseDown={handleBackdropClick}
      role="presentation"
    >
      <div className="company-modal company-modal--popup pm-modal" role="dialog" aria-labelledby="pm-plan-title">
        <div className="company-modal__header">
          <PageBack onClick={onClose} label="Back" />
          <h2 id="pm-plan-title">{plan ? 'Edit PM plan' : 'Create PM plan'}</h2>
          <button type="button" className="company-modal__close" onClick={onClose} aria-label="Close">×</button>
        </div>

        {!hasLayout && (
        <nav className="pm-steps" aria-label="PM plan steps">
          {STEPS.flatMap((item, index) => [
            index > 0 ? (
              <span key={`div-${item.id}`} className="pm-steps__divider" aria-hidden="true" />
            ) : null,
            <button
              key={item.id}
              type="button"
              className={[
                'pm-steps__item',
                step === item.id ? 'pm-steps__item--active' : '',
                step > item.id ? 'pm-steps__item--complete' : '',
              ].filter(Boolean).join(' ')}
              aria-current={step === item.id ? 'step' : undefined}
              onClick={() => {
                if (item.id > 1 && !validateDetails()) return
                goToStep(item.id)
              }}
            >
              <span className="pm-steps__num">{item.id}</span>
              <span className="pm-steps__label">{item.label}</span>
            </button>,
          ])}
        </nav>
        )}

        <form className="company-modal__form" ref={formRef} onSubmit={handleSubmit} noValidate>
          {hasLayout && (
            <OrderedFormLayout
              formId="pm.plan"
              layout={layout}
              catalogLookup={catalogFields}
              catalogValues={extras.values}
              onCatalogChange={extras.setFieldValue}
              masterValues={extras.values}
              onMasterChange={(id, value) => {
                extras.setFieldValue(id, value)
                if (String(id).includes('locations')) setField('location_id', value || '')
                if (String(id).includes('departments') && !String(id).includes('employees')) setField('department_id', value || '')
                if (String(id).includes('areas')) setField('area_id', value || '')
                if (String(id).includes('equipment')) setField('equipment_id', value || '')
                if (String(id).includes('activity_types')) setField('activity_type_id', value || '')
                if (String(id).includes('checklists')) setField('checklist_template_id', value || '')
                if (String(id).includes('employees_multi')) setField('technician_ids', value || [])
              }}
              disabled={saving}
              actors={formActors}
              renderField={(key, meta) => {
                const className = meta.className || fieldClass(key)
                if (key === 'name') {
                  return (
                    <label key={key} className={className} id="pm-field-name">
                      <span className="company-form__label">PM plan name</span>
                      <SpellcheckInput className="company-form__input" value={form.name} onChange={(e) => setField('name', e.target.value)} />
                    </label>
                  )
                }
                if (key === 'department_id') {
                  return (
                    <label key={key} className={className}>
                      <span className="company-form__label">Department</span>
                      <FilterableSelect value={form.department_id} onChange={(id) => setField('department_id', id)} options={departments} getOptionValue={(row) => row.id} getOptionLabel={(row) => row.name} placeholder="Select department" />
                    </label>
                  )
                }
                if (key === 'activity_type_id') {
                  return (
                    <label key={key} className={className}>
                      <span className="company-form__label">Maintenance activity type</span>
                      <FilterableSelect value={form.activity_type_id} onChange={(id) => setField('activity_type_id', id)} options={activityTypes} getOptionValue={(row) => row.id} getOptionLabel={(row) => row.name} placeholder="Select activity" />
                    </label>
                  )
                }
                if (key === 'work_center') {
                  return (
                    <label key={key} className={className}>
                      <span className="company-form__label">Work center</span>
                      <SpellcheckInput className="company-form__input" value={form.work_center} onChange={(e) => setField('work_center', e.target.value)} />
                    </label>
                  )
                }
                if (key === 'priority') {
                  return (
                    <label key={key} className={className}>
                      <span className="company-form__label">Priority</span>
                      <FilterableSelect value={form.priority} onChange={(id) => setField('priority', id)} options={PM_PRIORITIES} getOptionValue={(row) => row.value} getOptionLabel={(row) => row.label} allowEmpty={false} />
                    </label>
                  )
                }
                if (key === 'status') {
                  return (
                    <div key={key} className={className}>
                      <span className="company-form__label">Status</span>
                      <div className="pm-radio-row">
                        {['active', 'inactive'].map((status) => (
                          <label key={status} className="pm-radio">
                            <input type="radio" name="pm-status-layout" checked={form.status === status} onChange={() => setField('status', status)} />
                            {status === 'active' ? 'Active' : 'Inactive'}
                          </label>
                        ))}
                      </div>
                    </div>
                  )
                }
                if (key === 'location_id') {
                  return (
                    <label key={key} className={className}>
                      <span className="company-form__label">Plant / Facility</span>
                      <FilterableSelect value={form.location_id} onChange={(id) => setField('location_id', id)} options={locations} getOptionValue={(row) => row.id} getOptionLabel={(row) => row.name} placeholder="Select location" />
                    </label>
                  )
                }
                if (key === 'area_id' || key === 'equipment_id') {
                  if (assetPickerShown) return null
                  assetPickerShown = true
                  return renderAssetPicker(className.includes('company-form__field--full') ? className : `${className} company-form__field--full`)
                }
                if (key === 'schedule') {
                  return (
                    <div key={key} className={className}>
                      <label className="company-form__field">
                        <span className="company-form__label">Schedule type</span>
                        <FilterableSelect value={form.schedule_type} onChange={(id) => setField('schedule_type', id)} options={PM_SCHEDULE_TYPES} getOptionValue={(row) => row.value} getOptionLabel={(row) => row.label} allowEmpty={false} />
                      </label>
                    </div>
                  )
                }
                if (key === 'technician_ids') {
                  return (
                    <div key={key} className={className}>
                      <span className="company-form__label">Technicians</span>
                      <TechnicianMultiSelect employees={technicians} value={form.technician_ids} onChange={(ids) => setField('technician_ids', ids)} disabled={saving} placeholder="Select technicians…" />
                    </div>
                  )
                }
                if (key === 'checklist_template_id') {
                  return (
                    <div key={key} className={className}>
                      <ChecklistOptIn
                        embedded
                        formId="pm.plan"
                        moduleKey="pm_plan"
                        enabled={Boolean(form.checklist_template_id)}
                        onEnabledChange={(checked) => { if (!checked) setField('checklist_template_id', '') }}
                        templateId={form.checklist_template_id}
                        onTemplateChange={(id) => setField('checklist_template_id', id || '')}
                        disabled={saving}
                      />
                    </div>
                  )
                }
                return null
              }}
            />
          )}
          {hasLayout && usesReading && (
            <div className="pm-schedule-block">
              <h4 className="pm-schedule-block__title">Meter reading</h4>
              {renderLatestReading()}
              <label className="company-form__field">
                <span className="company-form__label">Last reading</span>
                <input
                  className="company-form__input"
                  type="number"
                  min="0"
                  step="any"
                  value={form.last_reading}
                  onChange={(e) => setField('last_reading', e.target.value)}
                  placeholder="From the logbook"
                />
              </label>
            </div>
          )}
          {!hasLayout && step === 1 && (
          <>
          <section className="pm-section">
            <h3 className="pm-section__title">Section A — General information</h3>
            <div className="company-form__grid company-form__grid--2">
              {isVisible('name') && (
              <label className={fieldClass('name')} id="pm-field-name">
                <span className="company-form__label">PM plan name *</span>
                <SpellcheckInput
                  className="company-form__input"
                  value={form.name}
                  onChange={(e) => setField('name', e.target.value)}
                />
              </label>
              )}
              {isVisible('department_id') && (
              <label className={fieldClass('department_id')} id="pm-field-department">
                <span className="company-form__label">Department *</span>
                <FilterableSelect
                  value={form.department_id}
                  onChange={(id) => setField('department_id', id)}
                  options={departments}
                  getOptionValue={(row) => row.id}
                  getOptionLabel={(row) => row.name}
                  placeholder="Select department"
                />
              </label>
              )}
              {isVisible('activity_type_id') && (
              <label className={fieldClass('activity_type_id')} id="pm-field-activity">
                <span className="company-form__label">Maintenance activity type *</span>
                <FilterableSelect
                  value={form.activity_type_id}
                  onChange={(id) => setField('activity_type_id', id)}
                  options={activityTypes}
                  getOptionValue={(row) => row.id}
                  getOptionLabel={(row) => row.name}
                  placeholder="Select activity"
                />
              </label>
              )}
              {isVisible('work_center') && (
              <label className={fieldClass('work_center')} id="pm-field-work-center">
                <span className="company-form__label">Work center *</span>
                <SpellcheckInput
                  className="company-form__input"
                  value={form.work_center}
                  onChange={(e) => setField('work_center', e.target.value)}
                />
              </label>
              )}
              {isVisible('priority') && (
              <label className={fieldClass('priority')}>
                <span className="company-form__label">Priority *</span>
                <FilterableSelect
                  value={form.priority}
                  onChange={(id) => setField('priority', id)}
                  options={PM_PRIORITIES}
                  getOptionValue={(row) => row.value}
                  getOptionLabel={(row) => row.label}
                  allowEmpty={false}
                />
              </label>
              )}
              {isVisible('status') && (
              <div className={fieldClass('status')}>
                <span className="company-form__label">Status *</span>
                <div className="pm-radio-row">
                  {['active', 'inactive'].map((status) => (
                    <label key={status} className="pm-radio">
                      <input
                        type="radio"
                        name="pm-status"
                        checked={form.status === status}
                        onChange={() => setField('status', status)}
                      />
                      {status === 'active' ? 'Active' : 'Inactive'}
                    </label>
                  ))}
                </div>
              </div>
              )}
            </div>
          </section>

          <section className="pm-section">
            <h3 className="pm-section__title">Section B — Asset selection</h3>
            <p className="pm-section__hint">Choose the plant, area, and equipment this plan maintains.</p>
            <div className="company-form__grid company-form__grid--2">
              {isVisible('location_id') && (
              <label className={fieldClass('location_id')}>
                <span className="company-form__label">Plant / Facility</span>
                <FilterableSelect
                  value={form.location_id}
                  onChange={(id) => setField('location_id', id)}
                  options={locationOptions}
                  getOptionValue={(row) => row.id}
                  getOptionLabel={(row) => row.name}
                  placeholder="Select location"
                  allowEmpty={false}
                />
              </label>
              )}
              {(isVisible('area_id') || isVisible('equipment_id')) && renderAssetPicker(fieldClass('equipment_id', 'company-form__field--full'))}
            </div>
          </section>

          {isVisible('schedule') && (
          <section className="pm-section">
            <h3 className="pm-section__title">Section C — Schedule</h3>
            <div className="company-form__grid company-form__grid--2">
              <label className="company-form__field">
                <span className="company-form__label">Schedule type *</span>
                <FilterableSelect
                  value={form.schedule_type}
                  onChange={(id) => setField('schedule_type', id)}
                  options={PM_SCHEDULE_TYPES}
                  getOptionValue={(row) => row.value}
                  getOptionLabel={(row) => row.label}
                  allowEmpty={false}
                />
              </label>
            </div>

            {usesCalendar && (
              <div className="pm-schedule-block">
                <h4 className="pm-schedule-block__title">Calendar interval</h4>
                <div className="company-form__grid company-form__grid--2">
                  <label className="company-form__field" id="pm-field-calendar-unit">
                    <span className="company-form__label">Interval type *</span>
                    <FilterableSelect
                      value={form.calendar_unit}
                      onChange={(id) => setField('calendar_unit', id)}
                      options={PM_CALENDAR_UNITS}
                      getOptionValue={(row) => row.value}
                      getOptionLabel={(row) => row.label}
                      allowEmpty={false}
                    />
                  </label>
                  <label className="company-form__field" id="pm-field-every">
                    <span className="company-form__label">Interval value *</span>
                    <input
                      className="company-form__input"
                      type="number"
                      min="1"
                      value={form.every_n}
                      onChange={(e) => setField('every_n', e.target.value)}
                    />
                  </label>
                </div>
                {form.calendar_unit === 'week' && (
                  <div className="company-form__field">
                    <span className="company-form__label">Weekdays</span>
                    <div className="company-form__checks">
                      {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((label, day) => (
                        <label key={label} className="company-form__check">
                          <input
                            type="checkbox"
                            checked={form.weekdays.includes(day)}
                            onChange={(event) => {
                              const next = event.target.checked
                                ? [...form.weekdays, day]
                                : form.weekdays.filter((value) => value !== day)
                              setField('weekdays', next.sort((a, b) => a - b))
                            }}
                          />
                          {label}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
                {form.calendar_unit === 'custom' && (
                  <div className="company-form__grid company-form__grid--2">
                    <label className="company-form__field">
                      <span className="company-form__label">Custom interval</span>
                      <input
                        className="company-form__input"
                        type="number"
                        min="1"
                        value={form.custom_interval}
                        onChange={(e) => setField('custom_interval', e.target.value)}
                      />
                    </label>
                    <label className="company-form__field">
                      <span className="company-form__label">Custom unit</span>
                      <select
                        className="company-form__input"
                        value={form.custom_unit}
                        onChange={(e) => setField('custom_unit', e.target.value)}
                      >
                        <option value="day">Day</option>
                        <option value="week">Week</option>
                        <option value="month">Month</option>
                        <option value="year">Year</option>
                      </select>
                    </label>
                  </div>
                )}
              </div>
            )}

            {usesReading && (
              <div className="pm-schedule-block">
                <h4 className="pm-schedule-block__title">Reading interval</h4>
                {renderLatestReading()}
                <div className="company-form__grid company-form__grid--2">
                  <label className="company-form__field">
                    <span className="company-form__label">Last reading</span>
                    <input
                      className="company-form__input"
                      type="number"
                      min="0"
                      step="any"
                      value={form.last_reading}
                      onChange={(e) => setField('last_reading', e.target.value)}
                      placeholder="Optional"
                    />
                  </label>
                  <label className="company-form__field">
                    <span className="company-form__label">Last service date</span>
                    <DateField
                      value={form.last_service_date}
                      onChange={(value) => setField('last_service_date', value)}
                    />
                  </label>
                  <label className="company-form__field" id="pm-field-reading-interval">
                    <span className="company-form__label">Reading value *</span>
                    <input
                      className="company-form__input"
                      type="number"
                      min="0"
                      step="any"
                      value={form.reading_interval}
                      onChange={(e) => setField('reading_interval', e.target.value)}
                      placeholder="Trigger after this reading"
                    />
                  </label>
                </div>
              </div>
            )}

            {form.schedule_type === 'both' && (
              <div className="pm-schedule-block pm-schedule-block--trigger">
                <div className="company-form__field">
                  <span className="company-form__label">Whichever comes first</span>
                  <GooToggle
                    checked={form.whichever_comes_first}
                    onChange={(checked) => setField('whichever_comes_first', checked)}
                    ariaLabel="Whichever comes first"
                  />
                  <p className="pm-section__hint">
                    When enabled, a work order is triggered by the calendar due date or the reading
                    threshold — whichever is reached first.
                  </p>
                </div>
              </div>
            )}

            <div className="company-form__grid company-form__grid--2">
              {usesCalendar && (
                <>
                  <label className="company-form__field" id="pm-field-start-date">
                    <span className="company-form__label">Start date *</span>
                    <DateField value={form.start_date} onChange={(value) => setField('start_date', value)} />
                  </label>
                  <label className="company-form__field">
                    <span className="company-form__label">End date</span>
                    <DateField
                      value={form.never_ends ? '' : form.end_date}
                      onChange={(value) => setField('end_date', value)}
                      disabled={form.never_ends}
                    />
                  </label>
                  <div className="company-form__field">
                    <span className="company-form__label">Never ends</span>
                    <GooToggle
                      checked={form.never_ends}
                      onChange={(checked) => setField('never_ends', checked)}
                      ariaLabel="Never ends"
                    />
                  </div>
                </>
              )}
              <label className="company-form__field">
                <span className="company-form__label">Grace period (days)</span>
                <input
                  className="company-form__input"
                  type="number"
                  min="0"
                  value={form.grace_days}
                  onChange={(e) => setField('grace_days', e.target.value)}
                />
              </label>
              <label className="company-form__field" id="pm-field-generate-before">
                <span className="company-form__label">Generate before due (days) *</span>
                <input
                  className="company-form__input"
                  type="number"
                  min="0"
                  value={form.generate_before_days}
                  onChange={(e) => setField('generate_before_days', e.target.value)}
                />
              </label>
            </div>
          </section>
          )}
          </>
          )}

          {!hasLayout && step === 2 && isVisible('technician_ids') && (
          <section className="pm-section">
            <h3 className="pm-section__title">Default technician(s)</h3>
            <p className="pm-section__hint">
              Assign the maintenance team that should receive work orders generated from this plan.
            </p>
            {!form.location_id ? (
              <p className="pm-section__hint">Select a plant / facility in plan details to see the maintenance team for that location.</p>
            ) : (
              <div className="company-form__field company-form__field--full">
                <span className="company-form__label">
                  Technicians
                  {form.technician_ids.length > 0 ? ` (${form.technician_ids.length} selected)` : ''}
                </span>
                <TechnicianMultiSelect
                  employees={technicians}
                  value={form.technician_ids}
                  onChange={(ids) => setField('technician_ids', ids)}
                  disabled={saving}
                  placeholder="Select technicians…"
                />
              </div>
            )}
          </section>
          )}

          {!hasLayout && step === 3 && (
          <section className="pm-section">
            <h3 className="pm-section__title">Checklist</h3>
            <p className="pm-section__hint">
              Attach a checklist template to include inspection items on generated work orders.
            </p>
            {isVisible('checklist_template_id') && (
            <ChecklistOptIn
              embedded
              formId="pm.plan"
              moduleKey="pm_plan"
              enabled={Boolean(form.checklist_template_id)}
              onEnabledChange={(checked) => { if (!checked) setField('checklist_template_id', '') }}
              templateId={form.checklist_template_id}
              onTemplateChange={(id) => setField('checklist_template_id', id || '')}
              disabled={saving}
            />
            )}
            <CatalogExtrasGrid
              layout={layout}
              catalogFields={catalogFields}
              values={extras.values}
              onChange={extras.setFieldValue}
              disabled={saving}
            />
          </section>
          )}

          {error && <p className="company-alert">{error}</p>}
          <div className="company-modal__actions">
            {step === 1 ? (
              <button type="button" className="company-btn company-btn--secondary" onClick={onClose}>Cancel</button>
            ) : (
              <button type="button" className="company-btn company-btn--secondary" onClick={() => goToStep(step - 1)}>
                Back
              </button>
            )}
            <button type="submit" className="company-btn company-btn--primary" disabled={saving}>
              {hasLayout || step >= 3 ? (saving ? 'Saving...' : 'Save PM plan') : 'Next'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
