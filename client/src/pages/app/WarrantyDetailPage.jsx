import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useOrg } from '../../hooks/useOrg'
import { usePermissions } from '../../hooks/usePermissions'
import { orgPath } from '../../config/navigation'
import { deleteWarranty, getWarranty } from '../../lib/api-warranties'
import RecordDetailLayout from '../../components/shared/RecordDetailLayout'
import EditIcon from '../../components/ui/EditIcon'
import TrashIcon from '../../components/ui/TrashIcon'
import { WarrantyDetailContent } from '../../components/warranty/WarrantyDetailContent'
import '../../components/company/CompanyShared.css'
import '../../components/warranty/WarrantyManager.css'

export default function WarrantyDetailPage() {
  const { warrantyId } = useParams()
  const navigate = useNavigate()
  const { org } = useOrg()
  const { canUpdate, canDelete } = usePermissions()
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState(null)
  const [record, setRecord] = useState(null)

  const goBack = useCallback(() => {
    if (org?.slug) navigate(orgPath(org.slug, 'warranty-manager'))
  }, [navigate, org?.slug])

  const openEdit = useCallback(() => {
    if (!org?.slug || !warrantyId) return
    navigate(orgPath(org.slug, `warranty-manager/${warrantyId}/edit`))
  }, [navigate, org?.slug, warrantyId])

  const handleDelete = useCallback(async () => {
    if (!record) return
    const label = record.serial_number != null ? record.serial_number : 'this warranty'
    if (!window.confirm(`Delete warranty ${label}?`)) return

    setDeleting(true)
    setError(null)
    try {
      await deleteWarranty(warrantyId)
      goBack()
    } catch (err) {
      setError(err.message)
    } finally {
      setDeleting(false)
    }
  }, [goBack, record, warrantyId])

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const data = await getWarranty(warrantyId)
        if (!cancelled) setRecord(data)
      } catch (err) {
        if (!cancelled) setError(err.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [warrantyId])

  const title = record?.serial_number != null
    ? `Warranty ${record.serial_number}`
    : 'Warranty details'

  const subtitle = [record?.make, record?.vendor].filter(Boolean).join(' · ') || undefined

  return (
    <RecordDetailLayout
      backLabel="Back to warranties"
      onBack={goBack}
      title={title}
      subtitle={subtitle}
      loading={loading}
      error={error}
      actions={(canUpdate('warranty_manager') || canDelete('warranty_manager')) && (
        <div className="company-table__actions">
          {canUpdate('warranty_manager') && (
            <button
              type="button"
              className="company-btn company-btn--secondary company-btn--compact company-btn--icon"
              onClick={openEdit}
              aria-label={`Edit warranty ${record?.serial_number ?? ''}`}
              title="Edit"
            >
              <EditIcon />
            </button>
          )}
          {canDelete('warranty_manager') && (
            <button
              type="button"
              className="company-btn company-btn--secondary company-btn--compact company-btn--icon company-btn--danger"
              onClick={handleDelete}
              disabled={deleting}
              aria-label={`Delete warranty ${record?.serial_number ?? ''}`}
              title="Delete"
            >
              <TrashIcon />
            </button>
          )}
        </div>
      )}
    >
      {record && <WarrantyDetailContent record={record} />}
    </RecordDetailLayout>
  )
}
