import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useOrg } from '../../hooks/useOrg'
import { usePermissions } from '../../hooks/usePermissions'
import { orgPath } from '../../config/navigation'
import { getVendor, updateVendor } from '../../lib/api-vendors'
import RecordDetailLayout from '../../components/shared/RecordDetailLayout'
import VendorModal from '../../components/vendors/VendorModal'
import { VendorDetailContent } from '../../components/vendors/VendorDetailContent'
import EditIcon from '../../components/ui/EditIcon'
import '../../components/company/CompanyShared.css'

export default function VendorDetailPage() {
  const { vendorId } = useParams()
  const navigate = useNavigate()
  const { org } = useOrg()
  const { canUpdate } = usePermissions()
  const canEdit = canUpdate('vendors')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [vendor, setVendor] = useState(null)
  const [editOpen, setEditOpen] = useState(false)

  const goBack = useCallback(() => {
    if (org?.slug) navigate(orgPath(org.slug, 'masters/vendors'))
  }, [navigate, org?.slug])

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const data = await getVendor(vendorId)
        if (!cancelled) setVendor(data)
      } catch (err) {
        if (!cancelled) setError(err.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [vendorId])

  const handleSave = async (payload) => {
    setSaving(true)
    setError(null)
    try {
      const updated = await updateVendor(vendorId, payload)
      setVendor(updated)
      setEditOpen(false)
      return updated
    } catch (err) {
      setError(err.message)
      throw err
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <RecordDetailLayout
        backLabel="Back to vendors"
        onBack={goBack}
        title={vendor?.name || 'Vendor details'}
        subtitle={vendor?.vendor_code ? `ID ${vendor.vendor_code}` : undefined}
        loading={loading}
        error={error}
        actions={canEdit ? (
          <button
            type="button"
            className="company-btn company-btn--secondary company-btn--compact company-btn--icon"
            onClick={() => setEditOpen(true)}
            aria-label={`Edit ${vendor?.name || 'vendor'}`}
            title="Edit"
          >
            <EditIcon />
          </button>
        ) : null}
      >
        {vendor && <VendorDetailContent vendor={vendor} />}
      </RecordDetailLayout>

      {canEdit && editOpen && vendor && (
        <VendorModal
          vendor={vendor}
          saving={saving}
          onClose={() => setEditOpen(false)}
          onSave={handleSave}
        />
      )}
    </>
  )
}
