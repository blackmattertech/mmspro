import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useFormLayout } from '../../hooks/useFormLayout'
import { useFormFieldValues } from '../../hooks/useFormFieldValues'
import { useEmployees } from '../../hooks/useEmployees'
import { useOrg } from '../../hooks/useOrg'
import { usePermissions } from '../../hooks/usePermissions'
import { getWorkRequestFormContext } from '../../lib/api-work-requests'
import { missingRequiredLayoutValues } from '../../lib/formFieldSources'
import { layoutRequiresChecklist } from '../../lib/formSkips'
import { validateRepeatableGroups } from '../../lib/formFillership'
import { persistFormFileValues } from '../../lib/workOrderFileValues'
import { parseLayoutId } from '../../lib/formLayoutIds'
import {
  canonicalPriority,
  findLayoutFieldByHint,
  isAssetPickerLayoutField,
  prepareManualLayout,
  readFieldValue,
} from '../../lib/manualWorkOrderWizard'
import OrderedFormLayout from '../forms/OrderedFormLayout'
import AssetPickerField from '../forms/AssetPickerField'
import ChecklistOptIn from '../forms/ChecklistOptIn'
import WorkOrderOrderToField from './WorkOrderOrderToField'
import WorkOrderMaterialRowsTable, { normalizeMaterialRows } from './WorkOrderMaterialRowsTable'
import TechnicianMultiSelect from '../workrequests/TechnicianMultiSelect'
import FilterableSelect from '../ui/FilterableSelect'
import DateField from '../ui/DateField'
import '../workrequests/WorkRequests.css'

const PERMIT_LABELS = {
  hot_work: 'Hot work',
  height: 'Work at height',
  confined_space: 'Confined space',
  electrical: 'Electrical',
  excavation: 'Excavation',
  other: 'Other',
}

function emptyPermitRow() {
  return { type: '', number: '', issue_at: '', expiry_at: '' }
}

function serializeMaterialConsumed(rows) {
  const filled = (rows || []).filter((row) => (
    String(row.code || '').trim()
    || String(row.description || '').trim()
    || String(row.uom || '').trim()
    || String(row.qty || '').trim()
  )).map((row) => ({
    code: String(row.code || '').trim(),
    description: String(row.description || '').trim(),
    uom: String(row.uom || '').trim(),
    qty: String(row.qty || '').trim(),
  }))
  return filled.length ? JSON.stringify(filled) : ''
}

function withJobNatureOptions(layout, jobNatures = []) {
  if (!layout || !jobNatures.length) return layout
  const options = jobNatures.map((row) => ({
    value: row.value || row.label || row.id,
    label: row.label || row.value || row.name,
  }))
  return {
    ...layout,
    fields: (layout.fields || []).map((field) => {
      const label = String(field.label || '').toLowerCase()
      if (!/job\s*nature/.test(label)) return field
      if ((field.options || []).length) return field
      return { ...field, options, fieldType: field.fieldType || 'dropdown' }
    }),
  }
}

function withPriorityOptions(layout) {
  if (!layout) return layout
  const options = [
    { value: 'high', label: 'High' },
    { value: 'medium', label: 'Medium' },
    { value: 'low', label: 'Low' },
  ]
  return {
    ...layout,
    fields: (layout.fields || []).map((field) => {
      const label = String(field.label || '').toLowerCase()
      if (!/priority/.test(label)) return field
      if ((field.options || []).length) return field
      return { ...field, options, fieldType: field.fieldType || 'dropdown' }
    }),
  }
}

function layoutHasSystemKey(layout, key) {
  return (layout?.fields || []).some((field) => {
    const parsed = parseLayoutId(field.id)
    return (parsed.kind === 'system' && parsed.value === key)
      || field.bindKey === key
  })
}

export default function ManualWorkOrderWizard({
  draftRef,
  saving = false,
  record = null,
  initialEquipmentId = '',
  initialAssigneeIds = [],
  onAssigneeIdsChange,
  onSaveCompleted,
}) {
  const { org } = useOrg()
  const { session } = usePermissions()
  const form = useFormLayout('work_orders.manual', { fallbackToDefault: true })
  const extras = useFormFieldValues('work_orders.manual', record?.id || null)

  const [ctx, setCtx] = useState(null)
  const [equipmentId, setEquipmentId] = useState(initialEquipmentId || record?.equipment_id || '')
  const [assetFieldValues, setAssetFieldValues] = useState({})
  const [assignedDepartmentId, setAssignedDepartmentId] = useState(record?.assigned_department_id || '')
  const [assignedDepartment, setAssignedDepartment] = useState(record?.assigned_department || null)
  const [assignedLocationId, setAssignedLocationId] = useState(record?.assigned_location_id || null)
  const [assigneeIds, setAssigneeIds] = useState(
    () => (initialAssigneeIds || []).map((id) => String(id)).filter(Boolean),
  )
  const [materialRows, setMaterialRows] = useState(() => normalizeMaterialRows([]))
  const [permitRequired, setPermitRequired] = useState(Boolean(record?.permit_required))
  const [permitRows, setPermitRows] = useState([emptyPermitRow()])
  const [checklistOn, setChecklistOn] = useState(Boolean(record?.checklist_template_id))
  const [checklistId, setChecklistId] = useState(record?.checklist_template_id || '')
  const [workStartAt, setWorkStartAt] = useState(record?.work_start_at || '')
  const [workEndAt, setWorkEndAt] = useState(record?.work_end_at || '')
  const seededRef = useRef(false)

  const displayLayout = useMemo(() => {
    const prepared = prepareManualLayout(form.layout)
    return withPriorityOptions(withJobNatureOptions(prepared, ctx?.job_natures || []))
  }, [form.layout, form.catalogFields, ctx?.job_natures])

  const hasOrderToField = layoutHasSystemKey(displayLayout, 'order_to_department_id')
  const checklistRequired = layoutRequiresChecklist(displayLayout)

  useEffect(() => {
    let cancelled = false
    getWorkRequestFormContext()
      .then((data) => { if (!cancelled) setCtx(data) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!record || seededRef.current || extras.loading) return
    seededRef.current = true
    if (record.equipment_id) setEquipmentId(record.equipment_id)
    if (record.assigned_department_id) setAssignedDepartmentId(record.assigned_department_id)
    if (record.assigned_department) setAssignedDepartment(record.assigned_department)
    if (record.assigned_location_id) setAssignedLocationId(record.assigned_location_id)
    const people = (record.assignees || []).map((row) => String(row.id)).filter(Boolean)
    if (people.length) setAssigneeIds(people)
    if (record.material_consumed) {
      try {
        const parsed = JSON.parse(record.material_consumed)
        if (Array.isArray(parsed)) setMaterialRows(normalizeMaterialRows(parsed))
      } catch {
        setMaterialRows(normalizeMaterialRows([{ description: record.material_consumed }]))
      }
    }
    if (record.permit_required) {
      setPermitRequired(true)
      const types = Array.isArray(record.permit_types) ? record.permit_types : []
      if (types.length) {
        setPermitRows(types.map((type) => ({
          type,
          number: record.permit_number || '',
          issue_at: record.permit_issue_at || '',
          expiry_at: record.permit_expiry_at || '',
        })))
      }
    }
    if (record.checklist_template_id) {
      setChecklistId(record.checklist_template_id)
      setChecklistOn(true)
    }
    if (record.work_start_at) setWorkStartAt(record.work_start_at)
    if (record.work_end_at) setWorkEndAt(record.work_end_at)
  }, [record, extras.loading])

  const orderToFromLayout = readFieldValue(displayLayout, extras.values, ['order_to_department_id', 'orderto'])
  useEffect(() => {
    if (!orderToFromLayout || assignedDepartmentId) return
    setAssignedDepartmentId(orderToFromLayout)
  }, [orderToFromLayout, assignedDepartmentId])

  const departmentIdForAssets = assignedDepartmentId || orderToFromLayout || ''
  const { employees, loading: employeesLoading } = useEmployees({
    departmentId: departmentIdForAssets || undefined,
    locationId: assignedLocationId || undefined,
    forAssignment: true,
    enabled: Boolean(departmentIdForAssets),
  })

  const updateAssigneeIds = useCallback((ids) => {
    const next = (ids || []).map((id) => String(id)).filter(Boolean)
    setAssigneeIds(next)
    onAssigneeIdsChange?.(next)
  }, [onAssigneeIdsChange])

  const setDepartmentTarget = useCallback(({ departmentId, locationId, department = null }) => {
    setAssignedDepartmentId(departmentId || '')
    setAssignedLocationId(locationId || null)
    setAssignedDepartment(department?.id ? department : null)
    const orderToField = findLayoutFieldByHint(displayLayout, ['order_to_department_id', 'orderto'])
    if (orderToField) extras.setFieldValue(orderToField.id, departmentId || '')
  }, [displayLayout, extras])

  const nativePayload = useCallback(() => {
    const values = extras.values || {}
    const shortDescription = readFieldValue(displayLayout, values, ['short_description', 'shortdescription'])
    const problemDescription = readFieldValue(displayLayout, values, [
      'problem_description',
      'detaileddescription',
    ]) || shortDescription
    const priority = canonicalPriority(
      readFieldValue(displayLayout, values, ['priority', 'jobpriority']),
    ) || 'medium'
    const layoutStart = readFieldValue(displayLayout, values, ['work_start_at', 'startdatetime', 'startdate'])
    const layoutEnd = readFieldValue(displayLayout, values, ['work_end_at', 'enddatetime', 'enddate'])
    return {
      shortDescription,
      problemDescription,
      priority,
      equipmentId: equipmentId || null,
      assignedDepartmentId: departmentIdForAssets || null,
      assignedLocationId: assignedLocationId || null,
      assignedEmployeeIds: assigneeIds,
      vendorId: readFieldValue(displayLayout, values, ['vendor_id', 'vendor']) || null,
      vendorExpense: readFieldValue(displayLayout, values, ['vendor_expense', 'vendorexpences', 'vendorexpenses']) || null,
      labourCount: readFieldValue(displayLayout, values, ['labour_count', 'labourcount']) || null,
      workStartAt: workStartAt || layoutStart || null,
      workEndAt: workEndAt || layoutEnd || null,
      jobDescription: readFieldValue(displayLayout, values, ['job_description', 'detailedjobdescription']) || null,
      rootCause: readFieldValue(displayLayout, values, ['root_cause', 'rootcauseanalysis']) || null,
      actionTaken: readFieldValue(displayLayout, values, ['action_taken', 'actiontaken']) || null,
      specialToolsUsed: readFieldValue(displayLayout, values, ['special_tools_used', 'specialtoolsused']) || null,
      safetyPrecautions: readFieldValue(displayLayout, values, ['safety_precautions', 'safetyprecautiontaken']) || null,
      lessonsLearned: readFieldValue(displayLayout, values, ['lessons_learned', 'specialnotes']) || null,
      executionRemarks: readFieldValue(displayLayout, values, ['execution_remarks', 'remarks', 'remark']) || null,
      materialConsumed: serializeMaterialConsumed(materialRows) || null,
      permitRequired,
      permitTypes: permitRequired ? permitRows.map((row) => row.type).filter(Boolean) : [],
      permitNumber: permitRequired ? (permitRows.find((row) => row.number)?.number || null) : null,
      permitIssueAt: permitRequired ? (permitRows.find((row) => row.issue_at)?.issue_at || null) : null,
      permitExpiryAt: permitRequired ? (permitRows.find((row) => row.expiry_at)?.expiry_at || null) : null,
      isBreakdown: /breakdown/i.test(String(readFieldValue(displayLayout, values, ['job_nature', 'jobnature']) || '')),
      checklistId,
      checklistOn,
      checklistRequired,
    }
  }, [
    assigneeIds,
    assignedLocationId,
    checklistId,
    checklistOn,
    checklistRequired,
    departmentIdForAssets,
    displayLayout,
    equipmentId,
    extras.values,
    materialRows,
    permitRequired,
    permitRows,
    workEndAt,
    workStartAt,
  ])

  const validate = useCallback((status) => {
    if (status === 'draft') return null
    if (!departmentIdForAssets) return 'Select the Order to / attending department.'
    if (!equipmentId) {
      const assetRequired = (displayLayout?.fields || []).some((field) => (
        isAssetPickerLayoutField(field) && field.required
      ))
      if (assetRequired) return 'Select an asset.'
    }
    const missing = missingRequiredLayoutValues(displayLayout, {
      systemValues: {
        asset_picker: equipmentId,
        equipment_id: equipmentId,
        assignment: departmentIdForAssets,
        order_to_department_id: departmentIdForAssets,
        work_stamps: workStartAt || workEndAt || 'ok',
        material_consumed: serializeMaterialConsumed(materialRows) || 'ok',
        permit_details: permitRequired ? 'ok' : 'skip',
      },
      masterValues: extras.values,
      catalogValues: extras.values,
    })
    if (missing.length) {
      const labels = missing.map((key) => {
        if (key === 'asset_picker' || key === 'equipment_id') return 'Asset'
        if (key === 'assignment') return 'Order to department'
        if (key === 'work_stamps') return 'Work start / end'
        return key
      })
      return `Fill the mandatory fields: ${[...new Set(labels)].join(', ')}`
    }
    const groupErrors = validateRepeatableGroups(displayLayout, extras.values)
    if (groupErrors.length) return groupErrors[0]
    if (checklistRequired && !checklistId) return 'Select a checklist.'
    return null
  }, [
    checklistId,
    checklistRequired,
    departmentIdForAssets,
    displayLayout,
    equipmentId,
    extras.values,
    materialRows,
    permitRequired,
    workEndAt,
    workStartAt,
  ])

  const saveExtras = useCallback(async (recordId) => {
    if (!recordId || !org?.id) return
    const uploaded = await persistFormFileValues(org.id, recordId, extras.values, 'manual-work-orders')
    await extras.save(recordId, uploaded)
  }, [extras, org?.id])

  if (draftRef) {
    draftRef.current = {
      validate,
      saveExtras,
      ...nativePayload(),
    }
  }

  if (form.loading || (record && extras.loading)) {
    return <div className="company-loading">Loading form…</div>
  }

  if (!form.hasLayout || !(displayLayout?.sections || []).length) {
    return (
      <div className="company-empty">
        Configure the Manual work order form in Form Builder to create work orders here.
      </div>
    )
  }

  const mountAssetPicker = ({ className = '', required = false, field } = {}) => (
    <AssetPickerField
      key={field?.id || 'asset_picker'}
      className={className}
      departmentId={departmentIdForAssets}
      requireDepartment={false}
      equipmentId={equipmentId}
      onEquipmentIdChange={setEquipmentId}
      fieldValues={assetFieldValues}
      onFieldValuesChange={setAssetFieldValues}
      disabled={saving}
      required={required}
    />
  )

  const renderOrderTo = (key, className) => (
    <div key={key} className={className}>
      <WorkOrderOrderToField
        embedded
        value={assignedDepartmentId}
        selected={assignedDepartment}
        onChange={setDepartmentTarget}
        disabled={saving}
      />
    </div>
  )

  const renderAttendedBy = (key, className, { includeOrderTo = false } = {}) => {
    const techDisabled = saving || (employeesLoading && !(employees || []).length)
    return (
      <div key={key} className={className}>
        {includeOrderTo ? (
          <WorkOrderOrderToField
            embedded
            value={assignedDepartmentId}
            selected={assignedDepartment}
            onChange={setDepartmentTarget}
            disabled={saving}
          />
        ) : null}
        <div
          className="company-form__field company-form__field--full"
          style={{ marginTop: includeOrderTo ? 12 : 0 }}
        >
          <span className="company-form__label">Attended by</span>
          <p className="company-form__hint">People who already completed this work.</p>
          {!departmentIdForAssets ? (
            <p className="company-form__hint">Select the Order to department first.</p>
          ) : (
            <TechnicianMultiSelect
              employees={employees || []}
              value={assigneeIds}
              onChange={updateAssigneeIds}
              disabled={techDisabled}
              placeholder={employeesLoading && !(employees || []).length
                ? 'Loading…'
                : 'Select people who attended…'}
            />
          )}
        </div>
        {onSaveCompleted ? (
          <div className="company-form__field company-form__field--full" style={{ marginTop: 16 }}>
            <button
              type="button"
              className="company-btn company-btn--primary"
              onClick={() => onSaveCompleted()}
              disabled={saving}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <p className="company-form__hint">Saves this manual work order as completed.</p>
          </div>
        ) : null}
      </div>
    )
  }

  const renderField = (key, props = {}) => {
    const className = props.className || 'company-form__field'
    if (key === 'asset_picker' || key === 'area_id' || key === 'equipment_id') {
      return mountAssetPicker({
        className,
        required: Boolean(props.required),
        field: props.field,
      })
    }
    if (key === 'order_to_department_id') {
      return renderOrderTo(key, className)
    }
    if (key === 'assignment') {
      return renderAttendedBy(key, className, { includeOrderTo: !hasOrderToField })
    }
    if (key === 'work_stamps') {
      return (
        <div key={key} className={className} style={{ gridColumn: '1 / -1' }}>
          <div className="company-form__grid">
            <label className="company-form__field">
              <span className="company-form__label">Work start{props.required ? ' *' : ''}</span>
              <DateField
                value={workStartAt}
                onChange={setWorkStartAt}
                withTime
                disabled={saving}
              />
            </label>
            <label className="company-form__field">
              <span className="company-form__label">Work end{props.required ? ' *' : ''}</span>
              <DateField
                value={workEndAt}
                onChange={setWorkEndAt}
                withTime
                disabled={saving}
              />
            </label>
          </div>
        </div>
      )
    }
    if (key === 'permit_details') {
      return (
        <div key={key} className={[className, 'wo-permit'].filter(Boolean).join(' ')}>
          <div className="company-form__field">
            <span className="company-form__label">Permit required</span>
            <FilterableSelect
              value={permitRequired ? 'yes' : 'no'}
              onChange={(next) => setPermitRequired(next === 'yes')}
              options={[
                { value: 'yes', label: 'Yes' },
                { value: 'no', label: 'No' },
              ]}
              getOptionValue={(opt) => opt.value}
              getOptionLabel={(opt) => opt.label}
              allowEmpty={false}
              className="company-form__input--select"
              disabled={saving}
            />
          </div>
          {permitRequired && (
            <div className="wo-permit__entries">
              {permitRows.map((row, index) => (
                <div key={`permit-${index}`} className="wo-permit__entry">
                  <div className="wo-permit__row">
                    <div className="wo-permit__cell wo-permit__cell--type">
                      <span className="company-form__label">Permit type</span>
                      <FilterableSelect
                        value={row.type}
                        onChange={(type) => setPermitRows((prev) => prev.map((item, i) => (
                          i === index ? { ...item, type } : item
                        )))}
                        options={Object.keys(PERMIT_LABELS)}
                        getOptionValue={(type) => type}
                        getOptionLabel={(type) => PERMIT_LABELS[type] || type}
                        placeholder="Select permit type"
                        className="company-form__input--select"
                        disabled={saving}
                      />
                    </div>
                    {row.type ? (
                      <>
                        <label className="wo-permit__cell wo-permit__cell--number">
                          <span className="company-form__label">Permit number</span>
                          <input
                            className="company-form__input"
                            value={row.number}
                            onChange={(e) => setPermitRows((prev) => prev.map((item, i) => (
                              i === index ? { ...item, number: e.target.value } : item
                            )))}
                            disabled={saving}
                          />
                        </label>
                        <label className="wo-permit__cell wo-permit__cell--date">
                          <span className="company-form__label">Issue date &amp; time</span>
                          <DateField
                            value={row.issue_at}
                            onChange={(value) => setPermitRows((prev) => prev.map((item, i) => (
                              i === index ? { ...item, issue_at: value } : item
                            )))}
                            withTime
                            disabled={saving}
                          />
                        </label>
                        <label className="wo-permit__cell wo-permit__cell--date">
                          <span className="company-form__label">Expiry date &amp; time</span>
                          <DateField
                            value={row.expiry_at}
                            onChange={(value) => setPermitRows((prev) => prev.map((item, i) => (
                              i === index ? { ...item, expiry_at: value } : item
                            )))}
                            withTime
                            disabled={saving}
                          />
                        </label>
                      </>
                    ) : null}
                  </div>
                </div>
              ))}
              <button
                type="button"
                className="wo-permit__add"
                onClick={() => setPermitRows((prev) => [...prev, emptyPermitRow()])}
                disabled={saving}
              >
                + Add permit
              </button>
            </div>
          )}
        </div>
      )
    }
    if (key === 'material_consumed') {
      return (
        <div key={key} className={className}>
          <span className="company-form__label">Material consumed</span>
          <WorkOrderMaterialRowsTable
            rows={materialRows}
            onChange={setMaterialRows}
            disabled={saving}
          />
        </div>
      )
    }
    return null
  }

  return (
    <div className="wo-form wr-create-form wo-manual-form">
      <OrderedFormLayout
        formId="work_orders.manual"
        layout={displayLayout}
        catalogLookup={form.catalogFields}
        catalogValues={extras.values}
        onCatalogChange={extras.setFieldValue}
        masterValues={extras.values}
        onMasterChange={(id, value) => {
          extras.setFieldValue(id, value)
          const field = (displayLayout?.fields || []).find((row) => row.id === id)
          const label = String(field?.label || '').toLowerCase()
          if (field?.bindKey === 'order_to_department_id' || /order\s*to/.test(label)) {
            setAssignedDepartmentId(value || '')
          }
          if (field?.bindKey === 'equipment_id') setEquipmentId(value || '')
        }}
        disabled={saving}
        actors={null}
        omitFillershipBadge
        currentEmployeeId={!record?.id ? (session?.employee_id || null) : null}
        renderField={renderField}
        assetPicker={({ className, field, required }) => (
          mountAssetPicker({ className, required: Boolean(required), field })
        )}
        renderSection={(id, children, section) => {
          const rest = (children || []).filter(Boolean)
          if (!rest.length) return null
          return (
            <section key={id} className="wr-form-section" aria-labelledby={`${id}-title`}>
              {section.label ? (
                <header className="wr-form-section__head" id={`${id}-title`}>
                  <h3 className="wr-form-section__title">{section.label}</h3>
                </header>
              ) : null}
              <div className="wr-form-section__body">
                <div className="company-form__grid company-form__grid--12">{rest}</div>
              </div>
            </section>
          )
        }}
      />

      <ChecklistOptIn
        formId="work_orders.manual"
        moduleKey="work_order"
        required={checklistRequired}
        enabled={checklistRequired || checklistOn}
        onEnabledChange={setChecklistOn}
        templateId={checklistId}
        onTemplateChange={setChecklistId}
        disabled={saving}
      />
    </div>
  )
}
