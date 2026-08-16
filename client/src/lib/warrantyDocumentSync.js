import {
  uploadWarrantyDocument,
  updateWarrantyDocumentLabel,
  deleteWarrantyDocument,
} from './api-warranties'

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
      })
      continue
    }

    if (doc.id && doc.originalLabel && doc.label !== doc.originalLabel) {
      await updateWarrantyDocumentLabel(warrantyId, doc.id, doc.label)
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
    isPending: false,
  }))
}
