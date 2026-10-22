import { useRef, useState } from 'react'
import SpellcheckInput from '../shared/SpellcheckInput'
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
  title = 'Documents',
  compact = false,
}) {
  const fileInputRef = useRef(null)
  const [dragOver, setDragOver] = useState(false)

  const updateDocuments = (nextDocuments, nextRemoved = removedDocumentIds) => {
    onChange({ documents: nextDocuments, removedDocumentIds: nextRemoved })
  }

  const addFiles = async (files) => {
    if (!files.length || disabled) return
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

  const handlePickFiles = async (event) => {
    const files = Array.from(event.target.files || [])
    event.target.value = ''
    await addFiles(files)
  }

  const handleDrop = async (event) => {
    event.preventDefault()
    setDragOver(false)
    await addFiles(Array.from(event.dataTransfer?.files || []))
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
    <div className={`warranty-docs${compact ? ' warranty-docs--compact' : ''}`}>
      <div className="warranty-docs__head">
        <h3 className="warranty-docs__title">{title}</h3>
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

      <div
        className={`warranty-docs__drop${dragOver ? ' is-over' : ''}`}
        onDragEnter={(event) => {
          event.preventDefault()
          if (!disabled) setDragOver(true)
        }}
        onDragOver={(event) => {
          event.preventDefault()
          if (!disabled) setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        <span className="warranty-docs__cloud" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M7 18h10a4 4 0 0 0 .4-8 5.5 5.5 0 0 0-10.6-1.5A3.5 3.5 0 0 0 7 18Z" strokeLinejoin="round" />
            <path d="M12 12v6M9.5 14.5 12 12l2.5 2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <p>Drop product images or documents here</p>
        <button
          type="button"
          className="warranty-docs__browse"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled}
        >
          Browse files
        </button>
        <span className="warranty-docs__hint">PNG, JPG, PDF up to 25 MB each</span>
      </div>

      {documents.length > 0 && (
        <ul className="warranty-docs__list">
          {documents.map((doc, index) => {
            const previewUrl = doc.preview_url || (
              isWarrantyImageDocument(doc.content_type) ? doc.signed_url : null
            )
            const ext = (doc.file_name || '').split('.').pop()?.toUpperCase() || 'FILE'

            return (
              <li key={doc.id || index} className="warranty-docs__file">
                <div className="warranty-docs__thumb">
                  {previewUrl ? (
                    <img src={previewUrl} alt="" />
                  ) : (
                    <span>{ext.slice(0, 4)}</span>
                  )}
                </div>
                <div className="warranty-docs__meta">
                  <span className="warranty-docs__name" title={doc.file_name}>{doc.file_name || 'File'}</span>
                  <SpellcheckInput
                    type="text"
                    className="company-form__input warranty-docs__label"
                    value={doc.label ?? ''}
                    placeholder="Label"
                    disabled={disabled}
                    onChange={(e) => setDocumentLabel(index, e.target.value)}
                  />
                  {!doc.isPending && doc.signed_url && (
                    <a
                      href={doc.signed_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="warranty-form__document-link"
                    >
                      View
                    </a>
                  )}
                </div>
                <button
                  type="button"
                  className="warranty-docs__remove"
                  onClick={() => removeDocument(index)}
                  disabled={disabled}
                  aria-label={`Remove ${doc.file_name || 'file'}`}
                >
                  ×
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
