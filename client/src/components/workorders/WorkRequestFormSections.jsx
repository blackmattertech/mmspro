import { useEffect, useMemo } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useFormFieldValues } from '../../hooks/useFormFieldValues'
import { useFormLayout } from '../../hooks/useFormLayout'
import { usePermissions } from '../../hooks/usePermissions'
import { resolveFormActors } from '../../lib/formFillership'
import { parseLayoutId } from '../../lib/formLayoutIds'
import OrderedFormLayout from '../forms/OrderedFormLayout'
import EquipmentQrCode from '../equipment/EquipmentQrCode'
import { AssetHierarchySummary } from '../workrequests/WorkRequestAssetFields'
import { hierarchyDisplaySteps } from '../../lib/assetHierarchy'
import {
  isAssetLayoutSection,
  isAssetPickerLayoutField,
  renderIncomingRequestInfoField,
  requestTypeLabel,
  seedWorkRequestFormValues,
} from '../workrequests/WorkRequestDetailModal'

export default function WorkRequestFormSections({ workRequest, onHasSections }) {
  const { user } = useAuth()
  const { isOrgAdmin, session, canUpdate } = usePermissions()
  const { layout, catalogFields, hasLayout, loading: layoutLoading } = useFormLayout(
    workRequest?.id ? 'work_request.create' : null,
    { fallbackToDefault: true },
  )
  const extras = useFormFieldValues('work_request.create', workRequest?.id || null)

  const hasAssetSection = useMemo(() => (
    (layout?.sections || []).some((section) => isAssetLayoutSection(section.id, section, layout))
  ), [layout])

  useEffect(() => {
    if (layoutLoading) return
    onHasSections?.(Boolean(hasLayout && hasAssetSection))
  }, [layoutLoading, hasLayout, hasAssetSection, onHasSections])

  useEffect(() => {
    if (!workRequest?.id || extras.loading || !hasLayout || !layout) return
    extras.setValues((prev) => seedWorkRequestFormValues(layout, catalogFields, prev, workRequest) || prev)
  }, [workRequest, extras.loading, extras.setValues, hasLayout, layout, catalogFields])

  const formActors = useMemo(() => resolveFormActors({
    formId: 'work_request.create',
    isOrgAdmin,
    profileId: user?.id,
    employeeId: session?.employee_id,
    isDepartmentHead: session?.is_department_head,
    employeeDepartmentId: session?.department_id,
    canApproveIncoming: canUpdate('work_request_approve') || canUpdate('work_request_incoming'),
    isCreate: false,
    record: workRequest ? {
      requested_by: workRequest.requested_by,
      order_to_department_id: workRequest.order_to_department_id || workRequest.order_to?.id,
      assignees: [],
    } : null,
  }), [
    isOrgAdmin,
    user?.id,
    session?.employee_id,
    session?.is_department_head,
    session?.department_id,
    canUpdate,
    workRequest,
  ])

  const routingValueLabels = useMemo(() => {
    const map = {}
    if (!workRequest) return map
    for (const field of layout?.fields || []) {
      const parsed = parseLayoutId(field.id)
      const key = field.bindKey || (parsed.kind === 'system' ? parsed.value : '')
      const label = String(field.label || '')
      if ((key === 'request_type' || /request\s*type/i.test(label)) && workRequest.request_type) {
        map[field.id] = requestTypeLabel(workRequest.request_type)
      }
      if ((key === 'order_from_department_id' || /order\s*from/i.test(label)) && workRequest.order_from?.name) {
        map[field.id] = workRequest.order_from.name
      }
      if ((key === 'order_to_department_id' || /order\s*to/i.test(label)) && workRequest.order_to?.name) {
        map[field.id] = workRequest.order_to.name
      }
    }
    return map
  }, [workRequest, layout])

  if (!workRequest?.id || !hasLayout) return null

  const hierarchy = workRequest.asset_hierarchy || []
  const equipment = workRequest.equipment
  const qrValue = equipment?.qr_code || equipment?.code || ''

  return (
    <>
      {extras.loading && (
        <div className="wo-received-detail__status">Loading form fields…</div>
      )}
      <OrderedFormLayout
        formId="work_request.create"
        layout={layout}
        catalogLookup={catalogFields}
        catalogValues={extras.values}
        onCatalogChange={extras.setFieldValue}
        masterValues={extras.values}
        onMasterChange={extras.setFieldValue}
        disabled
        actors={formActors}
        valueLabels={routingValueLabels}
        omitField={(item) => isAssetPickerLayoutField(item)}
        renderField={(key, props) => renderIncomingRequestInfoField(workRequest, key, props)}
        renderSection={(id, children, section) => {
          const showAsset = isAssetLayoutSection(id, section, layout)
            && (hierarchyDisplaySteps(hierarchy).length > 0 || Boolean(qrValue))
          const nodes = (Array.isArray(children) ? children : [children]).filter(Boolean)
          if (!showAsset && !nodes.length) return null
          const filledBy = section.filledBy || 'any'
          return (
            <section
              key={id}
              data-section-id={id}
              className={`company-form__layout-section wo-section ${filledBy !== 'any' ? 'is-fillership-locked' : ''}`}
            >
              {section.label || section.badge ? (
                <div className="wo-section__header company-form__layout-section-head">
                  {section.label ? <h3 className="wo-section__title">{section.label}</h3> : null}
                  {section.badge}
                </div>
              ) : null}
              <div className={`wo-section__body company-form__layout-section-body ${section.label || section.badge ? '' : 'company-form__layout-section-body--flush'}`.trim()}>
                {showAsset ? (
                  <div className="wr-detail-equip">
                    <AssetHierarchySummary steps={hierarchy} />
                    {qrValue ? (
                      <EquipmentQrCode
                        value={qrValue}
                        caption={{ label: 'QR code', value: equipment?.code || equipment?.name || qrValue }}
                        fileName={equipment?.code || equipment?.name || 'asset-qr'}
                      />
                    ) : null}
                  </div>
                ) : null}
                {nodes.length > 0 ? (
                  <div className="company-form__grid company-form__grid--12">{children}</div>
                ) : null}
              </div>
            </section>
          )
        }}
      />
    </>
  )
}
