import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useOrg } from '../../hooks/useOrg'
import { usePermissions } from '../../hooks/usePermissions'
import { orgPath } from '../../config/navigation'
import { getWarranty, createWarranty, updateWarranty, getWarrantiesTemplate, bulkUploadWarranties, previewWarrantyImport } from '../../lib/api-warranties'
import WarrantyBulkNote from '../../components/warranty/WarrantyBulkNote'
import { collectWarrantyDocuments, syncWarrantyDocuments } from '../../lib/warrantyDocumentSync'
import { useVendors } from '../../hooks/useVendors'
import { useFormFieldValues } from '../../hooks/useFormFieldValues'
import { useFormLayout } from '../../hooks/useFormLayout'
import { splitBoundValues } from '../../lib/formFieldSources'
import PageBack from '../../components/shared/PageBack'
import WarrantyForm, {
  EMPTY_WARRANTY_FORM,
  computeWarrantyPeriodMonths,
  warrantyToForm,
} from '../../components/warranty/WarrantyForm'
import {
  useMasterBulkUpload,
  MasterBulkActions,
} from '../../components/company/MasterBulkUpload'
import '../../components/company/CompanyShared.css'
import '../../components/warranty/WarrantyManager.css'

function warrantySavePayload(values) {
  return {
    ...values,
    documents: undefined,
    removedDocumentIds: undefined,
    items: (values.items || []).map((item) => {
      const { documents, removedDocumentIds, ...fields } = item
      return {
        ...fields,
        keep_line: (documents || []).length > 0,
        warranty_period_months: fields.warranty_period_months
          || computeWarrantyPeriodMonths(fields.warranty_start, fields.warranty_end),
      }
    }),
  }
}

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
  const extras = useFormFieldValues('warranty.warranty', warrantyId)
  const { layout } = useFormLayout('warranty.warranty')

  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [serialNumber, setSerialNumber] = useState(null)
  const [values, setValues] = useState(() => ({
    ...EMPTY_WARRANTY_FORM,
    items: EMPTY_WARRANTY_FORM.items.map((row) => ({ ...row })),
  }))
  const [similarSnapshot, setSimilarSnapshot] = useState(null)
  const {
    bulkInputRef,
    bulkBusy,
    bulkError,
    bulkResult,
    bulkPreview,
    handleDownloadTemplate,
    handleBulkFile,
    confirmBulkImport,
    cancelBulkPreview,
  } = useMasterBulkUpload({
    downloadTemplate: getWarrantiesTemplate,
    upload: bulkUploadWarranties,
    previewUpload: previewWarrantyImport,
    defaultFilename: 'warranties-template.xlsx',
  })

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

    const warrantyPayload = warrantySavePayload(values)
    const { documents, removedDocumentIds } = collectWarrantyDocuments(values)
    const { native, extras: extraValues } = splitBoundValues('warranty.warranty', extras.values, layout)

    setSaving(true)
    setError(null)
    try {
      const saved = isEdit
        ? await updateWarranty(warrantyId, { ...warrantyPayload, vendor_id: warrantyPayload.vendor_id || native.vendor_id || null })
        : await createWarranty({ ...warrantyPayload, vendor_id: warrantyPayload.vendor_id || native.vendor_id || null })

      await syncWarrantyDocuments(saved.id, documents, removedDocumentIds)
      await extras.save(saved.id, extraValues)
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
    const warrantyPayload = warrantySavePayload(values)
    const { documents, removedDocumentIds } = collectWarrantyDocuments(values)
    setSaving(true)
    setError(null)
    try {
      const saved = await createWarranty(warrantyPayload)
      await syncWarrantyDocuments(saved.id, documents, removedDocumentIds)
      await extras.save(saved.id)
      const cleared = {
        ...values,
        documents: [],
        removedDocumentIds: [],
        items: (values.items || []).map((item) => ({
          ...item,
          documents: [],
          removedDocumentIds: [],
        })),
      }
      setSimilarSnapshot(cleared)
      setValues(cleared)
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
        <div className="company-page__header-bar">
          <div className="company-page__header-main">
            <PageBack onClick={goBack} label="Warranty Manager" />
            <h1 className="company-page__title">{pageTitle}</h1>
            <p className="company-page__subtitle">
              Register a warranty and keep every document, date, and vendor detail in one place.
            </p>
          </div>
          {!isEdit && canCreate('warranty_manager') && (
            <div className="company-page__header-actions">
              <MasterBulkActions
                onDownload={handleDownloadTemplate}
                bulkBusy={bulkBusy}
                bulkInputRef={bulkInputRef}
                onFileChange={handleBulkFile}
                title="Import warranties"
                description={<WarrantyBulkNote />}
                noun="warranty"
                bulkError={bulkError}
                bulkResult={bulkResult}
                bulkPreview={bulkPreview}
                onConfirmImport={confirmBulkImport}
                onCancelPreview={cancelBulkPreview}
              />
            </div>
          )}
        </div>
      </header>

      <div className="company-page__content warranty-create-page">
          {error && <div className="company-alert" role="alert">{error}</div>}
          {similarSnapshot && !isEdit && (
            <div className="company-alert company-alert--success" role="status">
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
            onCancel={goBack}
            onAddSimilar={!isEdit ? handleAddSimilar : null}
            vendors={vendors}
            vendorsLoading={vendorsLoading}
            onCreateVendor={createVendor}
            vendorCreateSaving={vendorCreateSaving}
            extraValues={extras.values}
            onExtraChange={extras.setFieldValue}
          />
      </div>
    </div>
  )
}
