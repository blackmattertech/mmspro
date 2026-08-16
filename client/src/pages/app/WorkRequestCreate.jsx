import { useCallback, useEffect, useMemo, useState } from 'react'
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
import FilterableSelect from '../../components/ui/FilterableSelect'
import PageBack from '../../components/shared/PageBack'
import {
  clearBreakdownFieldValues,
  missingRequiredBreakdownFields,
} from '../../lib/workRequestBreakdownFields'
import { uploadWorkOrderFile } from '../../lib/workOrderAssets'
import { createId } from '../../lib/id'
import '../../components/company/CompanyShared.css'
import '../../components/assets/AssetsFields.css'
import '../../components/workorders/WorkOrdersPage.css'
import '../../components/workorders/ManualWorkOrder.css'
import '../../components/workrequests/WorkRequests.css'

function formatEquipmentLabel(row) {
  const parts = [row.name, row.code].filter(Boolean)
  return parts.join(' · ') || row.id
}

function WorkRequestFormActions({
  inForm = false,
  saving,
  saveMode,
  canSaveDraft,
  canSubmitAssets,
  onCancel,
  onSaveDraft,
  formId = 'wr-create-form',
}) {
  const rootClass = inForm
    ? 'wr-page__bar wr-form__actions wr-form__actions--in-form'
    : 'wo-page__bar wr-page__bar wr-form__actions'

  return (
    <div className={rootClass}>
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
          {...(inForm ? {} : { form: formId })}
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
  const [problem, setProblem] = useState('')
  const [isBreakdown, setIsBreakdown] = useState(false)
  const [maintenanceFieldValues, setMaintenanceFieldValues] = useState({})
  const [priority, setPriority] = useState('medium')
  const [remarks, setRemarks] = useState('')
  const [attachmentFiles, setAttachmentFiles] = useState([])

  const assetSections = ctx?.asset_sections || []
  const maintenanceSchema = ctx?.maintenance_form_schema || { sections: [] }
  const hasAssetFields = assetSections.some((s) => (s.fields || []).length > 0)

  useEffect(() => {
    if (isBreakdown) return
    setMaintenanceFieldValues((prev) => clearBreakdownFieldValues(maintenanceSchema, prev))
  }, [isBreakdown, maintenanceSchema])

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
        if (data.order_from_selectable) {
          setOrderFromId('')
          setOrderToId('')
          setRequestType('inter_department')
        } else {
          const fromId = data.order_from_department?.id
          setOrderFromId(fromId || '')
          setOrderToId(fromId || '')
          setRequestType('intra_department')
        }
      } catch (err) {
        if (!cancelled) setError(err.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  const departmentOptions = useMemo(
    () => ctx?.departments || [],
    [ctx?.departments],
  )

  const orderFromSelectable = Boolean(ctx?.order_from_selectable)
  const orderFrom = ctx?.order_from_department
  const effectiveOrderFromId = orderFromSelectable ? orderFromId : orderFrom?.id
  const effectiveOrderFromName = useMemo(() => {
    if (orderFromSelectable) {
      return departmentOptions.find((d) => d.id === orderFromId)?.name || '—'
    }
    return orderFrom?.name || '—'
  }, [departmentOptions, orderFrom?.name, orderFromId, orderFromSelectable])
  const lockOrderTo = requestType === 'intra_department' || requestType === 'user_self'
  const requestDateLabel = useMemo(
    () => new Date().toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'medium' }),
    [],
  )

  useEffect(() => {
    if (!ctx || !effectiveOrderFromId) return
    if (lockOrderTo) {
      setOrderToId(effectiveOrderFromId)
    }
  }, [ctx, lockOrderTo, effectiveOrderFromId, requestType])

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

  const canSaveDraft = Boolean(orderToId && (!orderFromSelectable || effectiveOrderFromId))

  const buildPayload = useCallback(
    (saveAs, attachments = []) => ({
      save_as: saveAs,
      request_type: requestType,
      ...(orderFromSelectable ? { order_from_department_id: effectiveOrderFromId || null } : {}),
      order_to_department_id: orderToId,
      equipment_id: equipmentId || null,
      problem_description: problem,
      is_breakdown: isBreakdown,
      priority,
      remarks,
      attachments,
      form_field_values: maintenanceFieldValues,
    }),
    [
      effectiveOrderFromId,
      equipmentId,
      isBreakdown,
      maintenanceFieldValues,
      orderFromSelectable,
      orderToId,
      priority,
      problem,
      remarks,
      requestType,
    ],
  )

  const persist = useCallback(
    async (saveAs) => {
      if (saveAs === 'submit') {
        if (!problem.trim()) {
          setError('Problem description is required.')
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
      if (orderFromSelectable && !effectiveOrderFromId) {
        setError('Select an Order from department before saving.')
        return
      }
      setSaving(true)
      setSaveMode(saveAs)
      setError(null)
      try {
        const draftKey = createId()
        const uploaded = []
        for (const file of attachmentFiles) {
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
      orderFromSelectable,
      orderToId,
      org?.id,
      org?.slug,
      problem,
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
      <header className="wo-page__top">
        <PageBack
          to={org?.slug ? orgPath(org.slug, 'work-request/my') : '#'}
          label="Work Requests"
        />
        <h1 className="wo-page__title">Create Work Request</h1>
        <p className="wo-page__subtitle">
          Submit a maintenance request for your department or another executing department.
        </p>
      </header>

      <WorkRequestFormActions
        saving={saving}
        saveMode={saveMode}
        canSaveDraft={canSaveDraft}
        canSubmitAssets={canSubmitAssets}
        onCancel={goBack}
        onSaveDraft={handleSaveDraft}
      />

      <div className="wo-page__content">
        {error && <div className="wo-alert wo-alert--error" role="alert">{error}</div>}

        <form id="wr-create-form" className="wo-form" onSubmit={handleSubmit}>
          <section className="wo-section" aria-labelledby="wr-section-request">
            <WorkRequestSectionHead
              id="wr-section-request"
              title="Request information"
              description="Type, date, and department routing"
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
                <div className="company-form__field">
                  <span className="company-form__label">Request date</span>
                  <div className="wr-form__input-readonly">{requestDateLabel}</div>
                </div>
                {orderFromSelectable ? (
                  <label className="company-form__field">
                    <span className="company-form__label">Order from</span>
                    <FilterableSelect
                      value={orderFromId}
                      onChange={(id) => {
                        setOrderFromId(id)
                        if (lockOrderTo) setOrderToId(id)
                      }}
                      options={departmentOptions}
                      getOptionValue={(d) => d.id}
                      getOptionLabel={(d) => d.name}
                      placeholder="Select department"
                      required
                      className="company-form__input--select"
                    />
                  </label>
                ) : (
                  <div className="company-form__field">
                    <span className="company-form__label">Order from</span>
                    <div className="wr-form__input-readonly">{orderFrom?.name || '—'}</div>
                  </div>
                )}
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
                      placeholder="Select department"
                      required
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
              description="Problem details, priority, and notes"
            />
            <div className="wo-section__body">
              <div className="company-form__grid">
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
                <div className="company-form__field">
                  <span className="company-form__label">Breakdown</span>
                  <div className="wr-radio-options" role="radiogroup" aria-label="Breakdown">
                    <label className="asset-field-dependency__option">
                      <input
                        type="radio"
                        name="breakdown"
                        checked={isBreakdown === true}
                        onChange={() => setIsBreakdown(true)}
                      />
                      <span>Yes</span>
                    </label>
                    <label className="asset-field-dependency__option">
                      <input
                        type="radio"
                        name="breakdown"
                        checked={isBreakdown === false}
                        onChange={() => setIsBreakdown(false)}
                      />
                      <span>No</span>
                    </label>
                  </div>
                </div>
                <WorkRequestBreakdownFields
                  schema={maintenanceSchema}
                  isBreakdown={isBreakdown}
                  values={maintenanceFieldValues}
                  onChange={setMaintenanceFieldValues}
                  disabled={saving}
                />
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
                <label className="company-form__field company-form__field--full">
                  <span className="company-form__label">Attachment</span>
                  <input
                    type="file"
                    className="company-form__input"
                    multiple
                    disabled={saving}
                    onChange={(e) => {
                      const files = Array.from(e.target.files || [])
                      setAttachmentFiles(files)
                    }}
                  />
                  {attachmentFiles.length > 0 && (
                    <p className="wo-manual__note" style={{ marginTop: 8, marginBottom: 0 }}>
                      {attachmentFiles.length} file(s) selected
                    </p>
                  )}
                </label>
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

          <WorkRequestFormActions
            inForm
            saving={saving}
            saveMode={saveMode}
            canSaveDraft={canSaveDraft}
            canSubmitAssets={canSubmitAssets}
            onCancel={goBack}
            onSaveDraft={handleSaveDraft}
          />
        </form>
      </div>
    </div>
  )
}
