import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useOrg } from '../../hooks/useOrg'
import { usePermissions } from '../../hooks/usePermissions'
import { getEquipment, updateEquipment } from '../../lib/api-equipment'
import { orgPath } from '../../config/navigation'
import EquipmentDetail from '../../components/equipment/EquipmentDetail'
import MeterReadingModal from '../../components/logbook/MeterReadingModal'
import '../../components/company/CompanyShared.css'

export default function EquipmentScan() {
  const { equipmentId } = useParams()
  const navigate = useNavigate()
  const { org } = useOrg()
  const { canCreate, canUpdate } = usePermissions()
  const [equipment, setEquipment] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [addingReading, setAddingReading] = useState(false)

  useEffect(() => {
    if (!equipmentId) return undefined
    let cancelled = false
    setLoading(true)
    setError(null)
    getEquipment(equipmentId)
      .then((row) => {
        if (!cancelled) setEquipment(row)
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'This code is not an asset record in your organization.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [equipmentId])

  const backTo = orgPath(org?.slug, 'masters/equipment')
  const query = equipment ? `equipment_id=${encodeURIComponent(equipment.id)}` : ''
  const canLogReading = Boolean(equipment?.reading_required) && canCreate('logbook')
  const actions = equipment ? [
    canLogReading && {
      label: 'Add reading',
      onClick: () => setAddingReading(true),
    },
    (canCreate('work_request_create') || canCreate('work_request')) && {
      label: 'Create Work Request',
      to: `${orgPath(org?.slug, 'work-request/create')}?${query}`,
    },
    canCreate('work_orders_manual') && {
      label: 'Create Work Order',
      to: `${orgPath(org?.slug, 'work-orders/manual/create')}?${query}`,
    },
    canCreate('work_orders_scheduled') && {
      label: 'Create PM Schedule',
      to: `${orgPath(org?.slug, 'work-orders/scheduled')}?${query}`,
    },
    canCreate('tasks_followups') && {
      label: 'Create Task',
      to: `${orgPath(org?.slug, 'tasks-and-followups/create')}?${query}`,
    },
  ].filter(Boolean) : []

  return (
    <div className="company-page">
      <div className="company-page__content">
        {loading && <p className="company-empty">Loading asset…</p>}
        {error && <div className="company-alert" role="alert">{error}</div>}
        {equipment && (
          <EquipmentDetail
            equipment={equipment}
            canEdit={canUpdate('equipment')}
            onClose={() => navigate(backTo)}
            onReplaceImage={canUpdate('equipment') ? async (image) => {
              const saved = await updateEquipment(equipment.id, { image })
              setEquipment(saved)
            } : undefined}
            links={{
              workOrders: org?.slug ? orgPath(org.slug, 'work-orders/manual') : undefined,
              pm: org?.slug ? orgPath(org.slug, 'work-orders/scheduled') : undefined,
              warranty: org?.slug ? orgPath(org.slug, 'warranty-manager') : undefined,
            }}
            actions={actions.length ? (
              <div className="equipment-scan__actions">
                {actions.map((action) => (
                  action.to ? (
                    <Link key={action.to} className="company-btn company-btn--primary" to={action.to}>
                      {action.label}
                    </Link>
                  ) : (
                    <button key={action.label} type="button" className="company-btn company-btn--primary" onClick={action.onClick}>
                      {action.label}
                    </button>
                  )
                ))}
              </div>
            ) : null}
          />
        )}
        {addingReading && equipment && (
          <MeterReadingModal
            equipment={equipment}
            lastReading={equipment.last_meter_reading}
            onClose={() => setAddingReading(false)}
            onSaved={(saved) => {
              setEquipment((current) => (current ? {
                ...current,
                last_meter_reading: saved.reading,
                last_meter_reading_at: saved.reading_at,
                last_meter_logged_by_name: saved.logged_by_name,
                last_meter_logged_by_department: saved.logged_by_department,
                last_meter_logged_by_designation: saved.logged_by_designation,
              } : current))
              setAddingReading(false)
            }}
          />
        )}
      </div>
    </div>
  )
}
