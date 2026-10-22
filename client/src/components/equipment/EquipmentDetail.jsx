import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import PageBack from '../shared/PageBack'
import EquipmentQrCode from './EquipmentQrCode'
import { qrFieldCaption } from '../../lib/equipmentQr'
import { useFormLayout } from '../../hooks/useFormLayout'
import { isAllowedImageFile, resolveImageMime } from '../../lib/imageFiles'
import { readFileAsDataUrl } from '../../config/warrantyDocuments'
import './EquipmentDetail.css'

const HIDDEN_FIELD_NAMES = new Set([
  'name',
  'code',
  'area',
  'image',
  'equipment name',
  'equipment code',
  'equipment image',
])

function fieldText(row) {
  if (!row) return ''
  if (Array.isArray(row.value_json?.values)) {
    return row.value_json.values.map((value) => String(value || '').trim()).filter(Boolean).join(', ')
  }
  return String(row.value_text || '').trim()
}

function formatDate(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function PinIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 20.25C12 20.25 6.75 14.6 6.75 10.75C6.75 7.85 9.1 5.5 12 5.5C14.9 5.5 17.25 7.85 17.25 10.75C17.25 14.6 12 20.25 12 20.25Z" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="12" cy="10.75" r="1.75" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  )
}

function DeptIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4.75 19.25V7.25C4.75 6.15 5.65 5.25 6.75 5.25H12.25V19.25" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12.25 9.25H17.25C18.35 9.25 19.25 10.15 19.25 11.25V19.25" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 9.25H10M8 12.25H10M8 15.25H10M4.75 19.25H19.25" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

function DateIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="4.25" y="5.75" width="15.5" height="13.5" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M4.25 9.75H19.75M8.25 3.75V6.75M15.75 3.75V6.75" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

function CardIcon({ children }) {
  return <span className="equipment-detail__card-icon">{children}</span>
}

function Chevron() {
  return (
    <svg className="equipment-detail__chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M9 6.5L14.5 12L9 17.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function detailFacts(equipment) {
  const facts = [
    { label: 'Name', value: equipment.name },
    { label: 'Code', value: equipment.code },
    { label: 'Location', value: equipment.org_locations?.name || equipment.locations?.name, icon: 'pin' },
    { label: 'Department', value: equipment.departments?.name, icon: 'dept' },
    { label: 'Area', value: equipment.areas?.name },
    { label: 'Status', status: equipment.is_active === false ? 'inactive' : 'active' },
  ]

  for (const field of equipment.field_values || []) {
    const key = String(field.field_name || '').trim().toLowerCase()
    if (!key || HIDDEN_FIELD_NAMES.has(key)) continue
    if (field.field_type === 'image' || field.field_type === 'file') continue
    const raw = fieldText(field)
    const dated = field.field_type === 'date' || field.field_type === 'datetime'
    facts.push({
      label: field.field_name,
      value: dated ? (formatDate(raw) || raw) : raw,
      icon: dated ? 'date' : null,
    })
  }
  return facts
}

function imageSource(equipment) {
  if (equipment.image_signed_url) return equipment.image_signed_url
  const imageField = (equipment.field_values || []).find((field) => (
    field.field_type === 'image'
    || String(field.field_name || '').trim().toLowerCase() === 'equipment image'
  ))
  const text = fieldText(imageField)
  if (/^(https?:|data:image\/)/i.test(text)) return text
  return ''
}

function warrantyCopy(equipment) {
  const activity = equipment.activity?.warranty
  if (activity?.expiresOn) {
    return {
      title: activity.status === 'expired' ? 'Expired' : 'Active',
      tone: activity.status === 'expired' ? 'danger' : 'ok',
      detail: `Expires on ${formatDate(activity.expiresOn)}`,
    }
  }
  const field = (equipment.field_values || []).find((row) => /warranty/i.test(row.field_name || ''))
  const text = fieldText(field)
  if (!text) return { title: 'None', tone: 'muted', detail: 'No warranty on file' }
  const parsed = Date.parse(text)
  if (Number.isNaN(parsed)) return { title: text, tone: 'muted', detail: field.field_name }
  const expires = new Date(parsed)
  const active = expires.getTime() >= Date.now()
  return {
    title: active ? 'Active' : 'Expired',
    tone: active ? 'ok' : 'danger',
    detail: `Expires on ${formatDate(expires.toISOString())}`,
  }
}

function StatCard({ icon, tone, label, value, detail, to, detailTone }) {
  const body = (
    <>
      <span className={`equipment-detail__stat-icon equipment-detail__stat-icon--${tone}`}>{icon}</span>
      <span className="equipment-detail__stat-copy">
        <span className="equipment-detail__stat-label">{label}</span>
        <strong>{value}</strong>
        <span className={detailTone ? `equipment-detail__stat-detail equipment-detail__stat-detail--${detailTone}` : 'equipment-detail__stat-detail'}>
          {detail}
        </span>
      </span>
      <Chevron />
    </>
  )
  if (to) {
    return <Link className="equipment-detail__stat" to={to}>{body}</Link>
  }
  return <div className="equipment-detail__stat">{body}</div>
}

export default function EquipmentDetail({
  equipment,
  canEdit = false,
  onClose,
  onEdit,
  onReplaceImage,
  links = {},
  actions = null,
}) {
  const { layout } = useFormLayout(equipment ? 'equipment.create' : null)
  const fileRef = useRef(null)
  const [imageError, setImageError] = useState(null)
  const [replacing, setReplacing] = useState(false)
  if (!equipment) return null

  const facts = detailFacts(equipment)
  const photo = imageSource(equipment)
  const activity = equipment.activity || {}
  const workOrders = activity.workOrders || { total: 0, open: 0, closed: 0 }
  const pm = activity.pm || { total: 0, upcoming: 0, overdue: 0 }
  const inspection = activity.inspection || {}
  const warranty = warrantyCopy(equipment)
  const caption = qrFieldCaption(equipment, layout)

  const replaceImage = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !onReplaceImage) return
    if (!isAllowedImageFile(file)) {
      setImageError('Image must be PNG, JPG, WebP, or SVG')
      return
    }
    setReplacing(true)
    setImageError(null)
    try {
      const data = await readFileAsDataUrl(file)
      await onReplaceImage({ contentType: resolveImageMime(file), data })
    } catch (err) {
      setImageError(err.message || 'Could not replace the image')
    } finally {
      setReplacing(false)
    }
  }

  return (
    <div className="equipment-detail">
      <header className="equipment-detail__header">
        <div className="equipment-detail__heading">
          <PageBack onClick={onClose} className="page-back--header" />
          <div>
            <h1>{equipment.name || 'Equipment'}</h1>
            <p>{equipment.code ? `Code ${equipment.code}` : 'Equipment record'}</p>
          </div>
        </div>
        <div className="equipment-detail__header-actions">
          {canEdit && onEdit && (
            <button type="button" className="company-btn company-btn--primary" onClick={onEdit}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M4.75 16.75L5.2 14.5L14.7 5L17.5 7.8L8 17.3L5.75 17.75L4.75 16.75Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
                <path d="M13.1 6.6L15.9 9.4" stroke="currentColor" strokeWidth="1.6" />
              </svg>
              Edit
            </button>
          )}
          {onClose && (
            <button type="button" className="equipment-detail__close" onClick={onClose} aria-label="Close">
              ×
            </button>
          )}
        </div>
      </header>

      <div className="equipment-detail__top">
        <section className="equipment-detail__card">
          <h2 className="equipment-detail__card-title">
            <CardIcon>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <rect x="4.75" y="4.75" width="14.5" height="14.5" rx="2" stroke="currentColor" strokeWidth="1.6" />
                <path d="M8 9H16M8 12H16M8 15H13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </CardIcon>
            Equipment details
          </h2>
          <dl className="equipment-detail__facts">
            {facts.map((fact) => (
              <div key={fact.label} className="equipment-detail__fact">
                <dt>{fact.label}</dt>
                <dd>
                  {fact.status ? (
                    <span className={`equipment-detail__status equipment-detail__status--${fact.status}`}>
                      <span className="equipment-detail__status-dot" />
                      {fact.status === 'active' ? 'Active' : 'Inactive'}
                    </span>
                  ) : (
                    <span className="equipment-detail__value">
                      {fact.icon === 'pin' && fact.value && <PinIcon />}
                      {fact.icon === 'dept' && fact.value && <DeptIcon />}
                      {fact.icon === 'date' && fact.value && <DateIcon />}
                      {fact.value || '—'}
                    </span>
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="equipment-detail__card equipment-detail__photo-card">
          <h2 className="equipment-detail__card-title">
            <CardIcon>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <rect x="4.25" y="5.75" width="15.5" height="12.5" rx="2" stroke="currentColor" strokeWidth="1.6" />
                <path d="M4.75 15.25L8.75 11.75L12 14.5L15.25 11.25L19.25 15.25" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
                <circle cx="9" cy="9.25" r="1.15" fill="currentColor" />
              </svg>
            </CardIcon>
            Equipment image
          </h2>
          {photo ? (
            <img className="equipment-detail__photo" src={photo} alt="" />
          ) : (
            <div className="equipment-detail__photo equipment-detail__photo--empty">No image</div>
          )}
          {canEdit && onReplaceImage && (
            <>
              <button
                type="button"
                className="equipment-detail__replace"
                disabled={replacing}
                onClick={() => fileRef.current?.click()}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M12 16.25V6.75M12 6.75L8.25 10.5M12 6.75L15.75 10.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M5.75 16.75V18.25H18.25V16.75" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
                {replacing ? 'Uploading…' : 'Replace image'}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml,.svg"
                hidden
                onChange={replaceImage}
              />
            </>
          )}
          {imageError && <p className="equipment-detail__image-error">{imageError}</p>}
        </section>
      </div>

      <div className="equipment-detail__stats">
        <StatCard
          tone="rose"
          label="Work Orders"
          value={workOrders.total}
          detail={`${workOrders.open} Open · ${workOrders.closed} Closed`}
          to={links.workOrders}
          icon={(
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M7.75 4.75H14.5L18.25 8.5V19.25H7.75V4.75Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
              <path d="M14.25 4.75V8.75H18.25M10 12.25H15.25M10 15.25H15.25" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          )}
        />
        <StatCard
          tone="rose"
          label="PM Schedule"
          value={pm.total}
          detail={`${pm.upcoming} Upcoming · ${pm.overdue} Overdue`}
          detailTone={pm.overdue ? 'danger' : undefined}
          to={links.pm}
          icon={(
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <rect x="4.25" y="5.75" width="15.5" height="13.5" rx="2" stroke="currentColor" strokeWidth="1.6" />
              <path d="M4.25 9.75H19.75M8.25 3.75V6.75M15.75 3.75V6.75" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          )}
        />
        <StatCard
          tone="blue"
          label="Last Inspection"
          value={inspection.lastAt ? formatDate(inspection.lastAt) : '—'}
          detail={inspection.nextDue ? `Next due: ${formatDate(inspection.nextDue)}` : 'No upcoming inspection'}
          to={links.pm}
          icon={(
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 4.75L18.25 7.25V12C18.25 15.4 15.7 18.2 12 19.25C8.3 18.2 5.75 15.4 5.75 12V7.25L12 4.75Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
              <path d="M9.25 12.1L11.1 13.9L14.75 10.25" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        />
        <StatCard
          tone="green"
          label="Warranty Status"
          value={warranty.title}
          detail={warranty.detail}
          detailTone={warranty.tone === 'danger' ? 'danger' : undefined}
          to={links.warranty}
          icon={(
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 4.75L18.25 7.25V12C18.25 15.4 15.7 18.2 12 19.25C8.3 18.2 5.75 15.4 5.75 12V7.25L12 4.75Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
            </svg>
          )}
        />
      </div>

      <EquipmentQrCode
        variant="panel"
        value={equipment.qr_code}
        caption={caption}
        fileName={equipment.code || equipment.name || 'equipment-qr'}
      />
      {actions}
    </div>
  )
}
