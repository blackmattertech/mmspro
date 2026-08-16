import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useOrg } from '../../hooks/useOrg'
import { usePermissions } from '../../hooks/usePermissions'
import { orgPath } from '../../config/navigation'
import { getWarranty, createWarranty, updateWarranty } from '../../lib/api-warranties'
import { syncWarrantyDocuments } from '../../lib/warrantyDocumentSync'
import { useVendors } from '../../hooks/useVendors'
import PageBack from '../../components/shared/PageBack'
import WarrantyForm, {
  EMPTY_WARRANTY_FORM,
  computeWarrantyPeriodMonths,
  warrantyToForm,
} from '../../components/warranty/WarrantyForm'
import '../../components/company/CompanyShared.css'
import '../../components/warranty/WarrantyManager.css'

export default function WarrantyFormPage() {
  const { warrantyId } = useParams()
  const navigate = useNavigate()
  const { org } = useOrg()
  const isEdit = Boolean(warrantyId)
  const { canCreate, canUpdate } = usePermissions()
  const canSave = isEdit
    ? canUpdate('warranty_manager')
    : canCreate('warranty_manager')
  const { items: vendors, loading: vendorsLoading, create: createVendor, saving: vendorCreateSaving } = useVendors()

  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [serialNumber, setSerialNumber] = useState(null)
  const [values, setValues] = useState(() => ({
    ...EMPTY_WARRANTY_FORM,
    items: EMPTY_WARRANTY_FORM.items.map((row) => ({ ...row })),
  }))
  const [similarSnapshot, setSimilarSnapshot] = useState(null)

  const goBack = useCallback(() => {
    if (org?.slug) navigate(orgPath(org.slug, 'warranty-manager'))
  }, [navigate, org?.slug])

  useEffect(() => {
    if (!isEdit) return undefined
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const record = await getWarranty(warrantyId)
        if (cancelled) return
        setSerialNumber(record.serial_number)
        setValues(warrantyToForm(record, vendors))
      } catch (err) {
        if (!cancelled) setError(err.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    if (vendorsLoading) return undefined
    load()
    return () => { cancelled = true }
  }, [isEdit, warrantyId, vendors, vendorsLoading])

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!canSave) return

    const payload = {
      ...values,
      warranty_period_months: values.warranty_period_months
        || computeWarrantyPeriodMonths(values.warranty_start, values.warranty_end),
    }
    const { documents, removedDocumentIds, ...warrantyPayload } = payload

    setSaving(true)
    setError(null)
    try {
      const saved = isEdit
        ? await updateWarranty(warrantyId, warrantyPayload)
        : await createWarranty(warrantyPayload)

      await syncWarrantyDocuments(saved.id, documents, removedDocumentIds)
      goBack()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleClear = () => {
    setValues({
      ...EMPTY_WARRANTY_FORM,
      items: EMPTY_WARRANTY_FORM.items.map((row) => ({ ...row })),
    })
    setSimilarSnapshot(null)
  }

  const handleAddSimilar = async () => {
    if (!canSave) return
    const { documents, removedDocumentIds, ...warrantyPayload } = {
      ...values,
      warranty_period_months: values.warranty_period_months
        || computeWarrantyPeriodMonths(values.warranty_start, values.warranty_end),
    }
    setSaving(true)
    setError(null)
    try {
      const saved = await createWarranty(warrantyPayload)
      await syncWarrantyDocuments(saved.id, documents, removedDocumentIds)
      setSimilarSnapshot({
        ...values,
        documents: [],
        removedDocumentIds: [],
      })
      setValues({
        ...values,
        documents: [],
        removedDocumentIds: [],
      })
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const pageTitle = useMemo(
    () => (isEdit ? `Edit Warranty ${serialNumber ?? ''}` : 'New Warranty'),
    [isEdit, serialNumber],
  )

  if (loading || vendorsLoading) {
    return <div className="company-loading">Loading warranty…</div>
  }

  return (
    <div className="company-page">
      <header className="company-page__header">
        <PageBack onClick={goBack} label="Warranty Manager" />
        <h1 className="company-page__title">{pageTitle}</h1>
        <p className="company-page__subtitle">
          Record purchase details, warranty period, vendor contacts, and product line items.
        </p>
      </header>

      <div className="company-page__content">
        <div className="company-panel">
          {error && <div className="company-alert" role="alert">{error}</div>}
          {similarSnapshot && !isEdit && (
            <div className="company-readonly-note" role="status">
              Record saved. Form kept for a similar entry — update details and submit again.
            </div>
          )}
          <WarrantyForm
            serialNumber={serialNumber}
            values={values}
            onChange={setValues}
            onSubmit={handleSubmit}
            saving={saving}
            canSave={canSave}
            onClear={handleClear}
            onAddSimilar={!isEdit ? handleAddSimilar : null}
            vendors={vendors}
            vendorsLoading={vendorsLoading}
            onCreateVendor={createVendor}
            vendorCreateSaving={vendorCreateSaving}
          />
        </div>
      </div>
    </div>
  )
}
