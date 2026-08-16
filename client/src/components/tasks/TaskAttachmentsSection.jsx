import { useRef } from 'react'
import {
  inferWarrantyDocumentContentType,
  isWarrantyImageDocument,
  readFileAsDataUrl,
} from '../../config/warrantyDocuments'
import { TASK_ATTACHMENT_ACCEPT } from '../../config/taskAttachments'

function makePendingId() {
  return `pending-${crypto.randomUUID()}`
}

export default function TaskAttachmentsSection({
  attachments = [],
  removedAttachmentIds = [],
  onChange,
  disabled = false,
}) {
  const fileInputRef = useRef(null)

  const updateAttachments = (nextAttachments, nextRemoved = removedAttachmentIds) => {
    onChange({ attachments: nextAttachments, removedAttachmentIds: nextRemoved })
  }

  const handlePickFiles = async (event) => {
    const files = Array.from(event.target.files || [])
    event.target.value = ''
    if (!files.length) return

    const next = [...attachments]
    for (const file of files) {
      const data = await readFileAsDataUrl(file)
      const content_type = inferWarrantyDocumentContentType(file.name, file.type)
      next.push({
        id: makePendingId(),
        file_name: file.name,
        content_type,
        data,
        preview_url: isWarrantyImageDocument(content_type) ? data : null,
        isPending: true,
      })
    }
    updateAttachments(next)
  }

  const removeAttachment = (index) => {
    const file = attachments[index]
    const next = attachments.filter((_, i) => i !== index)
    const nextRemoved = file?.id && !file.isPending
      ? [...removedAttachmentIds, file.id]
      : removedAttachmentIds
    updateAttachments(next, nextRemoved)
  }

  return (
    <div className="task-attachments">
      <div className="task-attachments__header">
        <h3 className="task-attachments__title">Attachments</h3>
        <input
          ref={fileInputRef}
          type="file"
          className="task-attachments__file-input"
          accept={TASK_ATTACHMENT_ACCEPT}
          multiple
          onChange={handlePickFiles}
          disabled={disabled}
        />
      </div>

      <div className="task-attachments__grid">
        {attachments.map((file, index) => {
          const previewUrl = file.preview_url || (
            isWarrantyImageDocument(file.content_type) ? file.signed_url : null
          )

          return (
            <div key={file.id || index} className="task-attachments__card">
              <div className="task-attachments__preview">
                {previewUrl ? (
                  <img src={previewUrl} alt="" className="task-attachments__image" />
                ) : (
                  <div className="task-attachments__file">
                    <span className="task-attachments__ext">
                      {(file.file_name || '').split('.').pop()?.toUpperCase() || 'FILE'}
                    </span>
                  </div>
                )}
              </div>

              <div className="task-attachments__meta">
                <div className="task-attachments__name" title={file.file_name}>
                  {file.file_name}
                </div>

                {!file.isPending && file.signed_url && (
                  <a
                    href={file.signed_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="task-attachments__link"
                  >
                    View file
                  </a>
                )}

                <button
                  type="button"
                  className="task-attachments__remove"
                  onClick={() => removeAttachment(index)}
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
          className="task-attachments__add"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled}
          aria-label="Upload attachment"
          title="Upload attachment"
        >
          <span className="task-attachments__add-icon" aria-hidden="true">+</span>
        </button>
      </div>
    </div>
  )
}
