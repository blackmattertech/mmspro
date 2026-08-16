import { useRef } from 'react'
import {
  WARRANTY_DOCUMENT_ACCEPT,
  inferWarrantyDocumentContentType,
  isWarrantyImageDocument,
  readFileAsDataUrl,
} from '../../config/warrantyDocuments'

function makePendingId() {
  return `pending-${crypto.randomUUID()}`
}

export default function WarrantyDocumentsSection({
  documents = [],
  removedDocumentIds = [],
  onChange,
  disabled = false,
}) {
  const fileInputRef = useRef(null)

  const updateDocuments = (nextDocuments, nextRemoved = removedDocumentIds) => {
    onChange({ documents: nextDocuments, removedDocumentIds: nextRemoved })
  }

  const handlePickFiles = async (event) => {
    const files = Array.from(event.target.files || [])
    event.target.value = ''
    if (!files.length) return

    const next = [...documents]
    for (const file of files) {
      const data = await readFileAsDataUrl(file)
      next.push({
        id: makePendingId(),
        label: '',
        file_name: file.name,
        content_type: inferWarrantyDocumentContentType(file.name, file.type),
        data,
        preview_url: isWarrantyImageDocument(file.type) ? data : null,
        isPending: true,
      })
    }
    updateDocuments(next)
  }

  const setDocumentLabel = (index, label) => {
    const next = documents.map((doc, i) => (
      i === index ? { ...doc, label } : doc
    ))
    updateDocuments(next)
  }

  const removeDocument = (index) => {
    const doc = documents[index]
    const next = documents.filter((_, i) => i !== index)
    const nextRemoved = doc?.id && !doc.isPending
      ? [...removedDocumentIds, doc.id]
      : removedDocumentIds
    updateDocuments(next, nextRemoved)
  }

  return (
    <div className="warranty-form__documents">
      <div className="warranty-form__items-header">
        <h3 className="warranty-form__items-title">Documents</h3>
        <input
          ref={fileInputRef}
          type="file"
          className="warranty-form__file-input"
          accept={WARRANTY_DOCUMENT_ACCEPT}
          multiple
          onChange={handlePickFiles}
          disabled={disabled}
        />
      </div>

      <div className="warranty-form__documents-grid">
        {documents.map((doc, index) => {
          const previewUrl = doc.preview_url || (
            isWarrantyImageDocument(doc.content_type) ? doc.signed_url : null
          )

          return (
            <div key={doc.id || index} className="warranty-form__document-card">
              <div className="warranty-form__document-preview">
                {previewUrl ? (
                  <img src={previewUrl} alt="" className="warranty-form__document-image" />
                ) : (
                  <div className="warranty-form__document-file">
                    <span className="warranty-form__document-ext">
                      {(doc.file_name || '').split('.').pop()?.toUpperCase() || 'FILE'}
                    </span>
                  </div>
                )}
              </div>

              <div className="warranty-form__document-meta">
                <label className="company-form__field warranty-form__document-label-field">
                  <span className="company-form__label">Label</span>
                  <input
                    type="text"
                    className="company-form__input"
                    value={doc.label ?? ''}
                    placeholder="e.g. Invoice"
                    disabled={disabled}
                    onChange={(e) => setDocumentLabel(index, e.target.value)}
                  />
                </label>

                {!doc.isPending && doc.signed_url && (
                  <a
                    href={doc.signed_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="warranty-form__document-link"
                  >
                    View file
                  </a>
                )}

                <button
                  type="button"
                  className="warranty-form__remove-row"
                  onClick={() => removeDocument(index)}
                  disabled={disabled}
                >
                  Remove
                </button>
              </div>
            </div>
          )
        })}

        <button
          type="button"
          className="warranty-form__document-add"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled}
          aria-label="Upload document"
          title="Upload document"
        >
          <span className="warranty-form__document-add-icon" aria-hidden="true">+</span>
        </button>
      </div>
    </div>
  )
}
