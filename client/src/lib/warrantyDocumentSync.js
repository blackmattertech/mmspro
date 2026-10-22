import {
  uploadWarrantyDocument,
  updateWarrantyDocument,
  deleteWarrantyDocument,
} from './api-warranties'

function itemKeepsALine(item) {
  if ((item?.documents || []).length > 0) return true
  return Boolean(
    item?.product_name
    || item?.model_part_no
    || item?.value
    || item?.remarks
    || item?.purchase_date
    || item?.make
    || item?.po_number
    || item?.po_date
    || item?.invoice_number
    || item?.invoice_date
    || item?.warranty_start
    || item?.warranty_end
    || item?.warranty_period_months
    || item?.expiry_notification_days,
  )
}

/** Files from every product row, numbered the same way the server stores lines. */
export function collectWarrantyDocuments(values) {
  const documents = []
  const removedDocumentIds = [...(values?.removedDocumentIds || [])]
  let line = 0

  for (const item of values?.items || []) {
    if (!itemKeepsALine(item)) {
      for (const doc of item.documents || []) {
        if (doc.id && !doc.isPending) removedDocumentIds.push(doc.id)
      }
      continue
    }
    line += 1
    for (const doc of item.documents || []) {
      documents.push({ ...doc, line_number: line })
    }
    for (const id of item.removedDocumentIds || []) {
      if (id) removedDocumentIds.push(id)
    }
  }

  return { documents, removedDocumentIds }
}

export async function syncWarrantyDocuments(warrantyId, documents = [], removedDocumentIds = []) {
  for (const documentId of removedDocumentIds) {
    await deleteWarrantyDocument(warrantyId, documentId)
  }

  for (const doc of documents) {
    if (doc.isPending && doc.data) {
      await uploadWarrantyDocument(warrantyId, {
        label: doc.label?.trim() || 'Other',
        fileName: doc.file_name,
        contentType: doc.content_type,
        data: doc.data,
        line_number: doc.line_number,
      })
      continue
    }

    const labelChanged = doc.originalLabel != null && doc.label !== doc.originalLabel
    const lineChanged = doc.line_number != null
      && Number(doc.line_number) !== Number(doc.originalLineNumber)
    if (doc.id && (labelChanged || lineChanged)) {
      await updateWarrantyDocument(warrantyId, doc.id, {
        label: doc.label,
        line_number: doc.line_number,
      })
    }
  }
}

export function documentsFromRecord(record) {
  return (record?.documents || []).map((doc) => ({
    id: doc.id,
    label: doc.label || '',
    originalLabel: doc.label || '',
    file_name: doc.file_name,
    content_type: doc.content_type,
    signed_url: doc.signed_url,
    line_number: doc.line_number ?? null,
    originalLineNumber: doc.line_number ?? null,
    isPending: false,
  }))
}
