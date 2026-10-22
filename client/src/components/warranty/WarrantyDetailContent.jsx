import {
  DetailView,
  DetailSection,
  DetailGrid,
  DetailField,
} from '../shared/DetailView'
import { warrantyDocumentLabelText } from '../../config/warrantyDocuments'

function formatDate(value) {
  if (!value) return '—'
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString()
}

function formatPeriodMonths(value) {
  if (value == null || value === '') return '—'
  return `${value} months`
}

function formatNotifyDays(value) {
  if (value == null || value === '') return '—'
  return `${value} days before`
}

function DocumentCards({ documents }) {
  if (!documents?.length) return null
  return (
    <div className="warranty-detail-documents">
      {documents.map((doc) => {
        const isImage = String(doc.content_type || '').startsWith('image/')
        return (
          <div key={doc.id} className="warranty-detail-documents__card">
            {isImage && doc.signed_url ? (
              <a href={doc.signed_url} target="_blank" rel="noopener noreferrer">
                <img src={doc.signed_url} alt="" className="warranty-detail-documents__image" />
              </a>
            ) : (
              <div className="warranty-detail-documents__file">
                {(doc.file_name || '').split('.').pop()?.toUpperCase() || 'FILE'}
              </div>
            )}
            <div className="warranty-detail-documents__meta">
              <div className="warranty-detail-documents__label">
                {warrantyDocumentLabelText(doc.label)}
              </div>
              {doc.signed_url && (
                <a
                  href={doc.signed_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="warranty-detail-documents__name"
                >
                  View file
                </a>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function itemHasContent(item) {
  return Boolean(
    item.product_name
    || item.model_part_no
    || item.value
    || item.remarks
    || item.purchase_date
    || item.make
    || item.po_number
    || item.invoice_number
    || item.warranty_start
    || item.warranty_end,
  )
}

export function WarrantyDetailContent({ record }) {
  if (!record) return null

  const documents = record.documents || []
  const items = (record.items || []).filter((item) => (
    itemHasContent(item)
    || documents.some((doc) => Number(doc.line_number) === Number(item.line_number))
  ))
  const usedDocumentIds = new Set()

  return (
    <DetailView>
      <DetailSection title="Vendor & contact">
        <DetailGrid>
          <DetailField label="S.No" value={record.serial_number} />
          <DetailField label="Vendor" value={record.vendor || record.vendor_record?.name} />
          <DetailField label="Vendor ID" value={record.vendor_record?.vendor_code} />
          <DetailField label="Contact name" value={record.contact_name} />
          <DetailField label="Contact phone" value={record.contact_phone} />
          <DetailField label="Contact email" value={record.contact_email} fullWidth />
        </DetailGrid>
      </DetailSection>

      <DetailSection title="Products / materials">
        {items.length === 0 ? (
          <p className="company-empty">No line items recorded.</p>
        ) : items.map((item, index) => {
          const line = Number(item.line_number)
          const itemDocuments = documents.filter((doc) => Number(doc.line_number) === line)
          itemDocuments.forEach((doc) => usedDocumentIds.add(doc.id))
          return (
          <div key={item.id || index} className="warranty-detail-item">
            <h4 className="warranty-detail-item__title">
              Item {item.line_number || index + 1}
              {item.product_name ? ` — ${item.product_name}` : ''}
            </h4>
            <DetailGrid>
              <DetailField label="Product / material" value={item.product_name} />
              <DetailField label="Model / part no." value={item.model_part_no} />
              <DetailField label="Value" value={item.value} />
              <DetailField label="Make" value={item.make} />
              <DetailField label="Purchase date" value={formatDate(item.purchase_date)} />
              <DetailField label="PO number" value={item.po_number} />
              <DetailField label="PO date" value={formatDate(item.po_date)} />
              <DetailField label="Invoice number" value={item.invoice_number} />
              <DetailField label="Invoice date" value={formatDate(item.invoice_date)} />
              <DetailField label="Warranty start" value={formatDate(item.warranty_start)} />
              <DetailField label="Warranty end" value={formatDate(item.warranty_end)} />
              <DetailField label="Warranty period" value={formatPeriodMonths(item.warranty_period_months)} />
              <DetailField label="Expiry notification" value={formatNotifyDays(item.expiry_notification_days)} />
              <DetailField label="Remarks" value={item.remarks} fullWidth />
            </DetailGrid>
            {itemDocuments.length > 0 && (
              <div className="warranty-detail-item__documents">
                <h5 className="warranty-detail-item__documents-title">Images / documents</h5>
                <DocumentCards documents={itemDocuments} />
              </div>
            )}
          </div>
          )
        })}
      </DetailSection>

      {documents.some((doc) => !usedDocumentIds.has(doc.id)) && (
        <DetailSection title="Documents">
          <DocumentCards documents={documents.filter((doc) => !usedDocumentIds.has(doc.id))} />
        </DetailSection>
      )}
    </DetailView>
  )
}
