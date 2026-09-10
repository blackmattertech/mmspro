import { useEffect, useMemo, useRef, useState } from 'react'
import { useBackdropClose } from '../../hooks/useBackdropClose'
import { useDepartments } from '../../hooks/useDepartments'
import { useLocations } from '../../hooks/useLocations'
import { useAreas } from '../../hooks/useAreas'
import { useEmployees } from '../../hooks/useEmployees'
import { usePermissions } from '../../hooks/usePermissions'
import { useProfile } from '../../hooks/useProfile'
import { getEquipmentList } from '../../lib/api-equipment'
import { getChecklistTemplates, getPmActivityTypes } from '../../lib/api-pm'
import { isMaintenanceDepartment } from '../../lib/departmentLocation'
import { PM_PRIORITIES, PM_SCHEDULE_TYPES, PM_CALENDAR_UNITS, CALENDAR_SCHEDULE_TYPES, normalizeScheduleType, normalizeCalendarUnit } from '../../config/pm'
import DateField from '../ui/DateField'
import FilterableSelect from '../ui/FilterableSelect'
import GooToggle from '../ui/GooToggle'
import TechnicianMultiSelect from '../workrequests/TechnicianMultiSelect'
import PageBack from '../shared/PageBack'
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
  const [equipment, setEquipment] = useState([])
  const formRef = useRef(null)
  const handleBackdropClick = useBackdropClose(onClose)
  const { departments } = useDepartments()
  const { locations } = useLocations()
  const { areas } = useAreas({
    locationId: form.location_id || undefined,
    departmentId: form.department_id || undefined,
  })
  const { employees } = useEmployees({
    locationId: form.location_id || undefined,
    forAssignment: true,
    limit: 200,
    enabled: Boolean(form.location_id),
  })
  const { locationId: scopedLocationId } = usePermissions()
  const { employee } = useProfile()

  useEffect(() => {
    setForm(formFromPlan(plan))
    setStep(1)
    setError(null)
  }, [plan])

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

  useEffect(() => {
    let cancelled = false
    getEquipmentList({
      departmentId: form.department_id || undefined,
      locationId: form.location_id || undefined,
      areaId: form.area_id || undefined,
      limit: 200,
    }).then((rows) => {
      if (!cancelled) setEquipment(rows || [])
    }).catch(() => {
      if (!cancelled) setEquipment([])
    })
    return () => { cancelled = true }
  }, [form.department_id, form.location_id, form.area_id])

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

    if (step < 3) {
      if (step === 1 && !validateDetails()) return
      goToStep(step + 1)
      return
    }

    if (!validateDetails()) return

    try {
      await onSave({
        name: form.name.trim(),
        department_id: form.department_id || null,
        location_id: form.location_id || null,
        area_id: form.area_id || null,
        equipment_id: form.equipment_id || null,
        activity_type_id: form.activity_type_id || null,
        work_center: form.work_center.trim() || 'General',
        priority: form.priority,
        status: form.status,
        schedule_type: form.schedule_type,
        calendar_unit: form.calendar_unit,
        every_n: Number(form.every_n) || 1,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        grace_days: form.grace_days === '' ? null : Number(form.grace_days),
        generate_before_days: Number(form.generate_before_days) || 0,
        last_reading: form.last_reading === '' ? null : Number(form.last_reading),
        last_service_date: form.last_service_date || null,
        reading_interval: form.reading_interval === '' ? null : Number(form.reading_interval),
        whichever_comes_first: form.schedule_type === 'both' ? Boolean(form.whichever_comes_first) : true,
        checklist_template_id: form.checklist_template_id || null,
        contractor_vendor_id: null,
        estimated_labour_hours: null,
        estimated_duration_hours: null,
        required_tools: null,
        required_skills: null,
        allow_multiple_open: false,
        technician_ids: form.technician_ids,
      })
    } catch (err) {
      setError(err.message)
    }
  }

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

        <form className="company-modal__form" ref={formRef} onSubmit={handleSubmit} noValidate>
          {step === 1 && (
          <>
          <section className="pm-section">
            <h3 className="pm-section__title">Section A — General information</h3>
            <div className="company-form__grid company-form__grid--2">
              <label className="company-form__field" id="pm-field-name">
                <span className="company-form__label">PM plan name *</span>
                <input
                  className="company-form__input"
                  value={form.name}
                  onChange={(e) => setField('name', e.target.value)}
                />
              </label>
              <label className="company-form__field" id="pm-field-department">
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
              <label className="company-form__field" id="pm-field-activity">
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
              <label className="company-form__field" id="pm-field-work-center">
                <span className="company-form__label">Work center *</span>
                <input
                  className="company-form__input"
                  value={form.work_center}
                  onChange={(e) => setField('work_center', e.target.value)}
                />
              </label>
              <label className="company-form__field">
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
              <div className="company-form__field">
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
            </div>
          </section>

          <section className="pm-section">
            <h3 className="pm-section__title">Section B — Asset selection</h3>
            <p className="pm-section__hint">Choose the plant, area, and equipment this plan maintains.</p>
            <div className="company-form__grid company-form__grid--2">
              <label className="company-form__field">
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
              <label className="company-form__field">
                <span className="company-form__label">Area</span>
                <FilterableSelect
                  value={form.area_id}
                  onChange={(id) => setField('area_id', id)}
                  options={areas}
                  getOptionValue={(row) => row.id}
                  getOptionLabel={(row) => row.name}
                  placeholder="Select area"
                />
              </label>
              <label className="company-form__field company-form__field--full" id="pm-field-equipment">
                <span className="company-form__label">Equipment *</span>
                <FilterableSelect
                  value={form.equipment_id}
                  onChange={(id) => setField('equipment_id', id)}
                  options={equipment}
                  getOptionValue={(row) => row.id}
                  getOptionLabel={(row) => row.code ? `${row.code} — ${row.name}` : row.name}
                  placeholder="Select equipment"
                />
              </label>
            </div>
          </section>

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
              </div>
            )}

            {usesReading && (
              <div className="pm-schedule-block">
                <h4 className="pm-schedule-block__title">Reading interval</h4>
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
                    <DateField value={form.end_date} onChange={(value) => setField('end_date', value)} />
                  </label>
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
          </>
          )}

          {step === 2 && (
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

          {step === 3 && (
          <section className="pm-section">
            <h3 className="pm-section__title">Checklist</h3>
            <p className="pm-section__hint">
              Attach a checklist template to include inspection items on generated work orders.
            </p>
            <label className="company-form__field">
              <span className="company-form__label">Checklist template</span>
              <FilterableSelect
                value={form.checklist_template_id}
                onChange={(id) => setField('checklist_template_id', id)}
                options={checklists.filter((row) => row.is_active !== false || row.id === form.checklist_template_id)}
                getOptionValue={(row) => row.id}
                getOptionLabel={(row) => `${row.name}${row.version ? ` (v${row.version})` : ''}`}
                placeholder="Select checklist"
              />
            </label>
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
              {step < 3 ? 'Next' : saving ? 'Saving...' : 'Save PM plan'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
