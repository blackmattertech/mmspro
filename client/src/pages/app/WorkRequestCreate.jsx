import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useOrg } from '../../hooks/useOrg'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import { orgPath } from '../../config/navigation'
import {
  getWorkRequestFormContext,
  getWorkRequestEquipmentCatalog,
  createWorkRequest,
} from '../../lib/api-work-requests'
import { flattenAssetSections } from '../../lib/workRequestAssetPicker'
import WorkRequestAssetFields from '../../components/workrequests/WorkRequestAssetFields'
import WorkRequestSectionHead from '../../components/workrequests/WorkRequestSectionHead'
import WorkRequestBreakdownFields from '../../components/workrequests/WorkRequestBreakdownFields'
import WorkRequestAttachmentsField from '../../components/workrequests/WorkRequestAttachmentsField'
import FilterableSelect from '../../components/ui/FilterableSelect'
import EmployeeAvatar from '../../components/company/EmployeeAvatar'
import PageBack from '../../components/shared/PageBack'
import {
  clearBreakdownFieldValues,
  missingRequiredBreakdownFields,
} from '../../lib/workRequestBreakdownFields'
import { departmentsForEmployeeLocation } from '../../lib/departmentLocation'
import { uploadWorkOrderFile } from '../../lib/workOrderAssets'
import { revokeWorkOrderFilePreviews } from '../../lib/workOrderFileValues'
import { createId } from '../../lib/id'
import '../../components/company/CompanyShared.css'
import '../../components/assets/AssetsFields.css'
import '../../components/workorders/WorkOrdersPage.css'
import '../../components/workorders/ManualWorkOrder.css'
import '../../components/workrequests/WorkRequests.css'

function formatEquipmentLabel(row) {
  return row?.name || row?.id || ''
}

function departmentSearchLabel(department) {
  return [
    department?.name,
    department?.code,
    department?.head?.name,
    department?.location_name,
  ].filter(Boolean).join(' ')
}

function DepartmentOption({ department }) {
  const head = department?.head
  const meta = [head?.name, department?.location_name].filter(Boolean).join(' · ')
  return (
    <span className="wr-dept-option">
      <EmployeeAvatar employee={head || { name: department?.name }} size="sm" />
      <span className="wr-dept-option__copy">
        <span className="wr-dept-option__name">{department?.name}</span>
        {meta ? <span className="wr-dept-option__meta">{meta}</span> : null}
      </span>
    </span>
  )
}

function WorkRequestFormActions({
  saving,
  saveMode,
  canSaveDraft,
  canSubmitAssets,
  onCancel,
  onSaveDraft,
  formId = 'wr-create-form',
}) {
  return (
    <div className="wr-page__header-actions">
      <div className="wr-page__bar-actions">
        <button
          type="button"
          className="company-btn company-btn--secondary"
          onClick={onCancel}
          disabled={saving}
        >
          Cancel
        </button>
        <button
          type="button"
          className="company-btn company-btn--secondary"
          onClick={onSaveDraft}
          disabled={saving || !canSaveDraft}
        >
          {saving && saveMode === 'draft' ? 'Saving…' : 'Save as Draft'}
        </button>
      </div>
      <div className="wr-page__bar-actions">
        <button
          type="submit"
          form={formId}
          className="company-btn company-btn--primary"
          disabled={saving || !canSubmitAssets}
        >
          {saving && saveMode === 'submit' ? 'Submitting…' : 'Submit'}
        </button>
      </div>
    </div>
  )
}

export default function WorkRequestCreate() {
  const navigate = useNavigate()
  const { org } = useOrg()
  const [ctx, setCtx] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveMode, setSaveMode] = useState(null)
  const [error, setError] = useState(null)

  const [requestType, setRequestType] = useState('inter_department')
  const [orderFromId, setOrderFromId] = useState('')
  const [orderToId, setOrderToId] = useState('')
  const [catalogEquipment, setCatalogEquipment] = useState([])
  const [equipmentQuery, setEquipmentQuery] = useState('')
  const debouncedEquipmentQuery = useDebouncedValue(equipmentQuery.trim())
  const [equipmentLoading, setEquipmentLoading] = useState(false)
  const [equipmentEmpty, setEquipmentEmpty] = useState(false)
  const [assetFieldValues, setAssetFieldValues] = useState({})
  const [equipmentId, setEquipmentId] = useState('')
  const [shortDescription, setShortDescription] = useState('')
  const [problem, setProblem] = useState('')
  const [jobNature, setJobNature] = useState('')
  const [maintenanceFieldValues, setMaintenanceFieldValues] = useState({})
  const [priority, setPriority] = useState('medium')
  const [remarks, setRemarks] = useState('')
  const [attachmentFiles, setAttachmentFiles] = useState([])
  const attachmentFilesRef = useRef(attachmentFiles)
  attachmentFilesRef.current = attachmentFiles

  const assetSections = ctx?.asset_sections || []
  const maintenanceSchema = ctx?.maintenance_form_schema || { sections: [] }
  const jobNatureOptions = ctx?.job_natures || []
  const hasAssetFields = assetSections.some((s) => (s.fields || []).length > 0)
  const isBreakdown = String(jobNature || '').trim().toLowerCase() === 'breakdown'

  useEffect(() => {
    if (isBreakdown) return
    setMaintenanceFieldValues((prev) => clearBreakdownFieldValues(maintenanceSchema, prev))
  }, [isBreakdown, maintenanceSchema])

  useEffect(() => () => revokeWorkOrderFilePreviews(attachmentFilesRef.current), [])

  const goBack = useCallback(() => {
    if (org?.slug) {
      navigate(orgPath(org.slug, 'work-request/my'))
    }
  }, [navigate, org?.slug])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const data = await getWorkRequestFormContext()
        if (cancelled) return
        setCtx(data)
        const fromId = data.order_from_department?.id || data.employee?.department_id || ''
        setOrderFromId(fromId)
        if (fromId) {
          setOrderToId(fromId)
          setRequestType('intra_department')
        } else {
          setOrderToId('')
          setRequestType('inter_department')
        }
      } catch (err) {
        if (!cancelled) setError(err.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  const allDepartments = ctx?.departments || []
  const scopeLocationId = ctx?.employee?.location_id || null
  const orderFromSelectable = Boolean(ctx?.order_from_selectable)
  const orderFrom = ctx?.order_from_department

  const orderFromOptions = useMemo(() => {
    const list = (orderFromSelectable || !scopeLocationId)
      ? allDepartments
      : departmentsForEmployeeLocation(allDepartments, scopeLocationId)
    const selected = orderFrom?.id
      ? (list.find((department) => department.id === orderFrom.id) ? null : orderFrom)
      : null
    return selected ? [selected, ...list] : list
  }, [allDepartments, orderFrom, orderFromSelectable, scopeLocationId])

  const effectiveOrderFromId = orderFromId || orderFrom?.id
  const orderToLocationId = useMemo(() => {
    const fromDept = orderFromOptions.find((department) => department.id === effectiveOrderFromId)
      || allDepartments.find((department) => department.id === effectiveOrderFromId)
    if (fromDept?.all_locations) return scopeLocationId
    return fromDept?.location_id || scopeLocationId
  }, [allDepartments, effectiveOrderFromId, orderFromOptions, scopeLocationId])

  const departmentOptions = useMemo(() => {
    if (!orderToLocationId) return allDepartments
    return departmentsForEmployeeLocation(allDepartments, orderToLocationId)
  }, [allDepartments, orderToLocationId])

  const effectiveOrderFromName = useMemo(() => {
    return orderFromOptions.find((d) => d.id === effectiveOrderFromId)?.name
      || orderFrom?.name
      || '—'
  }, [effectiveOrderFromId, orderFrom?.name, orderFromOptions])
  const lockOrderTo = requestType === 'intra_department' || requestType === 'user_self'

  useEffect(() => {
    if (!ctx || !effectiveOrderFromId) return
    if (lockOrderTo) {
      setOrderToId(effectiveOrderFromId)
    }
  }, [ctx, lockOrderTo, effectiveOrderFromId, requestType])

  useEffect(() => {
    if (lockOrderTo || !orderToId || !departmentOptions.length) return
    if (!departmentOptions.some((department) => department.id === orderToId)) {
      setOrderToId('')
    }
  }, [departmentOptions, lockOrderTo, orderToId])

  useEffect(() => {
    setAssetFieldValues({})
    setEquipmentId('')
    setEquipmentQuery('')
    if (!orderToId) {
      setCatalogEquipment([])
      setEquipmentEmpty(false)
    }
  }, [orderToId])

  useEffect(() => {
    if (!orderToId) return undefined

    let cancelled = false
    ;(async () => {
      setEquipmentLoading(true)
      try {
        const catalog = await getWorkRequestEquipmentCatalog(orderToId, {
          search: debouncedEquipmentQuery || undefined,
          limit: 100,
        })
        if (cancelled) return
        setCatalogEquipment(catalog.equipment || [])
        setEquipmentEmpty(!catalog.has_assets)
      } catch (err) {
        if (!cancelled) setError(err.message)
      } finally {
        if (!cancelled) setEquipmentLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [orderToId, debouncedEquipmentQuery])

  const canSubmitAssets = useMemo(() => {
    if (equipmentEmpty) return false
    if (!equipmentId) return false
    return catalogEquipment.some((row) => row.id === equipmentId)
  }, [catalogEquipment, equipmentEmpty, equipmentId])

  const canSaveDraft = Boolean(orderToId && effectiveOrderFromId)

  const buildPayload = useCallback(
    (saveAs, attachments = []) => ({
      save_as: saveAs,
      request_type: requestType,
      order_from_department_id: effectiveOrderFromId || null,
      order_to_department_id: orderToId,
      equipment_id: equipmentId || null,
      short_description: shortDescription,
      problem_description: problem,
      job_nature: jobNature || null,
      is_breakdown: String(jobNature || '').trim().toLowerCase() === 'breakdown',
      priority,
      remarks,
      attachments,
      form_field_values: maintenanceFieldValues,
    }),
    [
      effectiveOrderFromId,
      equipmentId,
      jobNature,
      maintenanceFieldValues,
      orderToId,
      priority,
      problem,
      remarks,
      shortDescription,
      requestType,
    ],
  )

  const persist = useCallback(
    async (saveAs) => {
      if (saveAs === 'submit') {
        if (!shortDescription.trim()) {
          setError('Short description is required.')
          return
        }
        if (!problem.trim()) {
          setError('Problem description is required.')
          return
        }
        if (jobNatureOptions.length && !jobNature) {
          setError('Job nature is required.')
          return
        }
        if (!equipmentId) {
          setError('Select an asset / equipment before submitting.')
          return
        }
        if (requestType === 'inter_department' && orderToId && effectiveOrderFromId && orderToId === effectiveOrderFromId) {
          setError('Inter-department requests must select a different Order To department.')
          return
        }
        const missingBreakdown = missingRequiredBreakdownFields(
          maintenanceSchema,
          isBreakdown,
          maintenanceFieldValues,
        )
        if (missingBreakdown.length) {
          setError(`Complete breakdown fields: ${missingBreakdown.join(', ')}`)
          return
        }
      }
      if (!orderToId) {
        setError('Select an Order to department before saving.')
        return
      }
      if (!effectiveOrderFromId) {
        setError('Select an Order from department before saving.')
        return
      }
      setSaving(true)
      setSaveMode(saveAs)
      setError(null)
      try {
        const draftKey = createId()
        const uploaded = []
        for (const item of attachmentFiles) {
          const file = item?.file instanceof File ? item.file : item
          const meta = await uploadWorkOrderFile(
            org.id,
            `work-requests/${draftKey}`,
            'attachments',
            file,
            'file',
          )
          uploaded.push(meta)
        }
        await createWorkRequest(buildPayload(saveAs, uploaded))
        if (org?.slug) {
          const message = saveAs === 'draft'
            ? 'Work request saved as draft.'
            : 'Work request submitted successfully.'
          navigate(orgPath(org.slug, 'work-request/my'), { state: { success: message } })
        }
      } catch (err) {
        setError(err.message)
      } finally {
        setSaving(false)
        setSaveMode(null)
      }
    },
    [
      attachmentFiles,
      buildPayload,
      effectiveOrderFromId,
      equipmentId,
      isBreakdown,
      navigate,
      orderToId,
      org?.id,
      org?.slug,
      problem,
      shortDescription,
      maintenanceSchema,
      maintenanceFieldValues,
      requestType,
    ],
  )

  const handleSubmit = useCallback(
    (e) => {
      e.preventDefault()
      persist('submit')
    },
    [persist],
  )

  const handleSaveDraft = useCallback(() => {
    persist('draft')
  }, [persist])

  const allAssetFields = useMemo(() => flattenAssetSections(assetSections), [assetSections])

  if (loading) {
    return (
      <div className="company-page wo-page">
        <div className="wo-page__content">
          <div className="company-loading">Loading...</div>
        </div>
      </div>
    )
  }

  if (!ctx) {
    return (
      <div className="company-page wo-page">
        <div className="wo-page__content">
          <div className="wo-alert wo-alert--error">{error || 'Unable to load form.'}</div>
        </div>
      </div>
    )
  }

  return (
    <div className="company-page wo-page">
      <header className="wo-page__top wo-page__top--with-actions">
        <div className="wo-page__top-copy">
          <PageBack
            to={org?.slug ? orgPath(org.slug, 'work-request/my') : '#'}
            label="Work Requests"
          />
          <h1 className="wo-page__title">Create Work Request</h1>
          <p className="wo-page__subtitle">
            Submit a maintenance request for your department or another executing department.
          </p>
        </div>
        <WorkRequestFormActions
          saving={saving}
          saveMode={saveMode}
          canSaveDraft={canSaveDraft}
          canSubmitAssets={canSubmitAssets}
          onCancel={goBack}
          onSaveDraft={handleSaveDraft}
        />
      </header>

      <div className="wo-page__content">
        {error && <div className="wo-alert wo-alert--error" role="alert">{error}</div>}

        <form id="wr-create-form" className="wo-form" onSubmit={handleSubmit}>
          <section className="wo-section" aria-labelledby="wr-section-request">
            <WorkRequestSectionHead
              id="wr-section-request"
              title="Request information"
              description="Type and department routing"
            />
            <div className="wo-section__body">
              <div className="company-form__grid">
                <label className="company-form__field">
                  <span className="company-form__label">Request type</span>
                  <FilterableSelect
                    value={requestType}
                    onChange={setRequestType}
                    options={ctx.request_types || []}
                    getOptionValue={(t) => t.value}
                    getOptionLabel={(t) => t.label}
                    placeholder="Select type"
                    required
                    allowEmpty={false}
                    className="company-form__input--select"
                  />
                </label>
                <label className="company-form__field">
                  <span className="company-form__label">Order from</span>
                  <FilterableSelect
                    value={orderFromId}
                    onChange={(id) => {
                      setOrderFromId(id)
                      if (lockOrderTo) setOrderToId(id)
                      else setOrderToId('')
                    }}
                    options={orderFromOptions}
                    getOptionValue={(d) => d.id}
                    getOptionLabel={(d) => d.name}
                    getOptionSearchLabel={departmentSearchLabel}
                    renderOption={(d) => <DepartmentOption department={d} />}
                    placeholder="Select department"
                    required
                    allowEmpty={false}
                    className="company-form__input--select"
                  />
                </label>
                <label className="company-form__field">
                  <span className="company-form__label">Order to</span>
                  {lockOrderTo ? (
                    <div className="wr-form__input-readonly">{effectiveOrderFromName}</div>
                  ) : (
                    <FilterableSelect
                      value={orderToId}
                      onChange={setOrderToId}
                      options={departmentOptions}
                      getOptionValue={(d) => d.id}
                      getOptionLabel={(d) => d.name}
                      getOptionSearchLabel={departmentSearchLabel}
                      renderOption={(d) => <DepartmentOption department={d} />}
                      placeholder="Select department"
                      required
                      disabled={!effectiveOrderFromId}
                      className="company-form__input--select"
                    />
                  )}
                </label>
              </div>
            </div>
          </section>

          <section className="wo-section" aria-labelledby="wr-section-asset">
            <WorkRequestSectionHead
              id="wr-section-asset"
              title="Asset information"
              description={
                hasAssetFields
                  ? 'Use your configured equipment fields to locate the asset'
                  : 'Equipment owned by the executing department'
              }
            />
            <div className="wo-section__body">
              {equipmentLoading && (
                <p className="wo-manual__intro" style={{ marginTop: 0 }}>Loading assets…</p>
              )}
              {!equipmentLoading && equipmentEmpty && orderToId && (
                <div className="wo-alert wo-alert--error" role="alert">
                  No assets are available for the selected department.
                </div>
              )}
              {!equipmentLoading && !equipmentEmpty && hasAssetFields && (
                <WorkRequestAssetFields
                  sections={assetSections}
                  equipment={catalogEquipment}
                  fieldValues={assetFieldValues}
                  onFieldValuesChange={setAssetFieldValues}
                  equipmentId={equipmentId}
                  onEquipmentIdChange={setEquipmentId}
                  loading={equipmentLoading}
                  disabled={saving}
                />
              )}
              {!equipmentLoading && !equipmentEmpty && !hasAssetFields && (
                <>
                  <label className="company-form__field company-form__field--full">
                    <span className="company-form__label">Equipment / asset</span>
                    <FilterableSelect
                      value={equipmentId}
                      onChange={setEquipmentId}
                      options={catalogEquipment}
                      getOptionValue={(row) => row.id}
                      getOptionLabel={formatEquipmentLabel}
                      placeholder="Select asset"
                      className="company-form__input--select"
                      onQueryChange={setEquipmentQuery}
                    />
                  </label>
                  {equipmentId && (
                    <p className="wr-selected-asset">
                      <strong>Selected:</strong>{' '}
                      {formatEquipmentLabel(catalogEquipment.find((r) => r.id === equipmentId))}
                    </p>
                  )}
                </>
              )}
              {!equipmentLoading && !equipmentEmpty && hasAssetFields && allAssetFields.length > 0 && (
                <p className="wo-manual__note" style={{ marginTop: 16, marginBottom: 0 }}>
                  Fields match your Masters → Equipment configuration. Options are limited to assets in the Order to department.
                </p>
              )}
            </div>
          </section>

          <section className="wo-section" aria-labelledby="wr-section-maintenance">
            <WorkRequestSectionHead
              id="wr-section-maintenance"
              title="Maintenance information"
              description="Short summary, problem details, priority, and notes"
            />
            <div className="wo-section__body">
              <div className="company-form__grid">
                <label className="company-form__field company-form__field--full">
                  <span className="company-form__label">Short description</span>
                  <input
                    className="company-form__input"
                    value={shortDescription}
                    onChange={(e) => setShortDescription(e.target.value)}
                    placeholder="Brief summary shown in lists and tables"
                    maxLength={200}
                  />
                </label>
                <label className="company-form__field company-form__field--full">
                  <span className="company-form__label">Problem description</span>
                  <textarea
                    className="company-form__input company-form__textarea"
                    rows={4}
                    value={problem}
                    onChange={(e) => setProblem(e.target.value)}
                    placeholder="Describe the issue or maintenance need"
                  />
                </label>
                <div className="wr-form__meta-row">
                  <label className="company-form__field">
                    <span className="company-form__label">Job nature</span>
                    <FilterableSelect
                      value={jobNature}
                      onChange={setJobNature}
                      options={jobNatureOptions}
                      getOptionValue={(option) => option.value}
                      getOptionLabel={(option) => option.label}
                      placeholder={jobNatureOptions.length ? 'Select job nature' : 'No job natures configured'}
                      emptyLabel="Select job nature…"
                      allowEmpty
                      disabled={saving || !jobNatureOptions.length}
                      className="company-form__input--select"
                    />
                  </label>
                  <label className="company-form__field">
                    <span className="company-form__label">Priority</span>
                    <FilterableSelect
                      value={priority}
                      onChange={setPriority}
                      options={ctx.priorities || []}
                      getOptionValue={(p) => p.value}
                      getOptionLabel={(p) => p.label}
                      placeholder="Select priority"
                      allowEmpty={false}
                      className="company-form__input--select"
                    />
                  </label>
                  <WorkRequestAttachmentsField
                    files={attachmentFiles}
                    onChange={setAttachmentFiles}
                    disabled={saving}
                  />
                </div>
                <WorkRequestBreakdownFields
                  schema={maintenanceSchema}
                  isBreakdown={isBreakdown}
                  values={maintenanceFieldValues}
                  onChange={setMaintenanceFieldValues}
                  disabled={saving}
                />
                <label className="company-form__field company-form__field--full">
                  <span className="company-form__label">Remarks</span>
                  <textarea
                    className="company-form__input company-form__textarea"
                    rows={3}
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                    placeholder="Optional additional notes"
                  />
                </label>
              </div>
            </div>
          </section>
        </form>
      </div>
    </div>
  )
}
