import {
  DetailView,
  DetailSection,
  DetailGrid,
  DetailField,
  DetailTable,
} from '../shared/DetailView'
import { warrantyDocumentLabelText } from '../../config/warrantyDocuments'

function formatDate(value) {
  if (!value) return '—'
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString()
}

export function WarrantyDetailContent({ record }) {
  if (!record) return null

  const items = (record.items || []).filter((item) => (
    item.product_name || item.model_part_no || item.value || item.remarks
  ))

  return (
    <DetailView>
      <DetailSection title="Purchase details">
        <DetailGrid>
          <DetailField label="S.No" value={record.serial_number} />
          <DetailField label="Purchase date" value={formatDate(record.purchase_date)} />
          <DetailField label="Make" value={record.make} />
          <DetailField label="PO number" value={record.po_number} />
          <DetailField label="PO date" value={formatDate(record.po_date)} />
          <DetailField label="Invoice number" value={record.invoice_number} />
          <DetailField label="Invoice date" value={formatDate(record.invoice_date)} />
        </DetailGrid>
      </DetailSection>

      <DetailSection title="Warranty">
        <DetailGrid>
          <DetailField label="Warranty start" value={formatDate(record.warranty_start)} />
          <DetailField label="Warranty end" value={formatDate(record.warranty_end)} />
          <DetailField
            label="Warranty period"
            value={record.warranty_period_months != null && record.warranty_period_months !== ''
              ? `${record.warranty_period_months} months`
              : '—'}
          />
          <DetailField
            label="Expiry notification"
            value={record.expiry_notification_days != null && record.expiry_notification_days !== ''
              ? `${record.expiry_notification_days} days before`
              : '—'}
          />
        </DetailGrid>
      </DetailSection>

      <DetailSection title="Vendor & contact">
        <DetailGrid>
          <DetailField label="Vendor" value={record.vendor || record.vendor_record?.name} />
          <DetailField label="Vendor ID" value={record.vendor_record?.vendor_code} />
          <DetailField label="Contact name" value={record.contact_name} />
          <DetailField label="Contact phone" value={record.contact_phone} />
          <DetailField label="Contact email" value={record.contact_email} fullWidth />
        </DetailGrid>
      </DetailSection>

      <DetailSection title="Products / materials">
        <DetailTable
          columns={[
            { id: 'product_name', label: 'Product / material' },
            { id: 'model_part_no', label: 'Model / part no.' },
            { id: 'value', label: 'Value' },
            { id: 'remarks', label: 'Remarks' },
          ]}
          rows={items}
          emptyLabel="No line items recorded."
        />
      </DetailSection>

      {(record.documents || []).length > 0 && (
        <DetailSection title="Documents">
          <div className="warranty-detail-documents">
            {record.documents.map((doc) => {
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
        </DetailSection>
      )}
    </DetailView>
  )
}
