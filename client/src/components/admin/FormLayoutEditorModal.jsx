import { useEffect, useState } from 'react'
import { getAdminFormLayout, saveAdminFormLayout } from '../../lib/api-form-layouts'
import { useBackdropClose } from '../../hooks/useBackdropClose'
import FormBuilderCanvas from './FormBuilderCanvas'
import './FormBuilderPanel.css'
import '../company/CompanyShared.css'

export default function FormLayoutEditorModal({ orgId, formId, onClose }) {
  const [payload, setPayload] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const handleBackdropClick = useBackdropClose(onClose)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    getAdminFormLayout(orgId, formId)
      .then((data) => { if (!cancelled) setPayload(data) })
      .catch((err) => { if (!cancelled) setError(err.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [orgId, formId])

  const handleSave = async (layout) => {
    setSaving(true)
    setError(null)
    try {
      const saved = await saveAdminFormLayout(orgId, formId, layout)
      setPayload((prev) => ({ ...prev, ...saved }))
      onClose()
    } catch (err) {
      setError(err.message)
      throw err
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="company-modal-overlay" onMouseDown={handleBackdropClick} role="presentation">
      <div
        className="company-modal asset-layout-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <FormBuilderCanvas
          payload={payload}
          loading={loading}
          saving={saving}
          error={error}
          onBack={onClose}
          onSave={handleSave}
        />
      </div>
    </div>
  )
}
