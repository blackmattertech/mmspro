import { useRef, useState } from 'react'
import { useBackdropClose } from '../../hooks/useBackdropClose'
import NavIcon from '../layout/NavIcon'
import PageBack from '../shared/PageBack'

/**
 * Shared bulk template download + xlsx upload helpers for company masters.
 */
export function useMasterBulkUpload({
  downloadTemplate,
  upload,
  onSuccess,
  defaultFilename = 'template.xlsx',
}) {
  const bulkInputRef = useRef(null)
  const [bulkBusy, setBulkBusy] = useState(false)
  const [bulkError, setBulkError] = useState(null)
  const [bulkResult, setBulkResult] = useState(null)

  const handleDownloadTemplate = async () => {
    setBulkError(null)
    try {
      const { filename, contentType, data } = await downloadTemplate()
      const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0))
      const blob = new Blob([bytes], { type: contentType })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename || defaultFilename
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      setBulkError(err.message)
    }
  }

  const handleBulkFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setBulkBusy(true)
    setBulkError(null)
    setBulkResult(null)
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result)
        reader.onerror = () => reject(new Error('Could not read the file'))
        reader.readAsDataURL(file)
      })
      const base64 = String(dataUrl).split(',').pop()
      const result = await upload(base64)
      setBulkResult(result)
      await onSuccess?.(result)
    } catch (err) {
      setBulkError(err.message)
    } finally {
      setBulkBusy(false)
      if (bulkInputRef.current) bulkInputRef.current.value = ''
    }
  }

  return {
    bulkInputRef,
    bulkBusy,
    bulkError,
    bulkResult,
    setBulkResult,
    handleDownloadTemplate,
    handleBulkFile,
  }
}

export function MasterBulkActions({
  onDownload,
  bulkBusy,
  bulkInputRef,
  onFileChange,
  addLabel,
  onAdd,
  title = 'Bulk upload',
  description = 'Download the template, fill in your rows, then upload the completed Excel file.',
  bulkError,
  bulkResult,
  noun = 'record',
}) {
  const [open, setOpen] = useState(false)
  const handleBackdropClick = useBackdropClose(() => setOpen(false))

  return (
    <>
      <button
        type="button"
        className="company-btn company-btn--secondary equipment-bulk-btn"
        onClick={() => setOpen(true)}
      >
        <span className="equipment-bulk-btn__icon" aria-hidden="true">
          <NavIcon name="upload" />
        </span>
        Bulk
      </button>
      <button type="button" className="company-btn company-btn--primary" onClick={onAdd}>
        {addLabel}
      </button>

      {open && (
        <div
          className="company-modal-overlay company-modal-overlay--popup"
          onMouseDown={handleBackdropClick}
          role="presentation"
        >
          <div
            className="company-modal company-modal--popup master-bulk-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="master-bulk-modal-title"
          >
            <div className="company-modal__header">
              <div className="modal__header-main">
                <PageBack onClick={() => setOpen(false)} className="page-back--header" />
                <h2 id="master-bulk-modal-title">{title}</h2>
              </div>
              <button
                type="button"
                className="company-modal__close"
                onClick={() => setOpen(false)}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div className="company-modal__form master-bulk-modal__body">
              <p className="master-bulk-modal__desc">{description}</p>

              <div className="master-bulk-modal__actions">
                <button
                  type="button"
                  className="company-btn company-btn--secondary equipment-bulk-btn"
                  onClick={onDownload}
                  disabled={bulkBusy}
                >
                  <span className="equipment-bulk-btn__icon" aria-hidden="true">
                    <NavIcon name="download" />
                  </span>
                  Download template
                </button>

                <button
                  type="button"
                  className="company-btn company-btn--primary equipment-bulk-btn"
                  onClick={() => bulkInputRef.current?.click()}
                  disabled={bulkBusy}
                >
                  <span className="equipment-bulk-btn__icon" aria-hidden="true">
                    <NavIcon name="upload" />
                  </span>
                  {bulkBusy ? 'Uploading…' : 'Upload file'}
                </button>
              </div>

              <input
                ref={bulkInputRef}
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                style={{ display: 'none' }}
                onChange={onFileChange}
              />

              <p className="master-bulk-modal__hint">Accepted format: .xlsx</p>

              {bulkError && <div className="company-error">{bulkError}</div>}
              <MasterBulkResult result={bulkResult} noun={noun} />
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export function MasterBulkResult({ result, noun }) {
  if (!result) return null
  const created = result.created || 0
  const updated = result.updated || 0
  const failed = result.failed || 0
  const tone = failed ? 'company-alert--warning' : 'company-alert--success'
  const parts = []
  if (created) parts.push(`${created} ${noun}(s) created`)
  if (updated) parts.push(`${updated} ${noun}(s) updated`)
  if (!created && !updated && !failed) parts.push(`0 ${noun}(s) created`)
  if (failed) parts.push(`${failed} row(s) failed`)
  return (
    <div className={`company-alert ${tone}`}>
      <strong>{parts[0]}</strong>
      {parts.length > 1 ? `, ${parts.slice(1).join(', ')}.` : '.'}
      {result.errors?.length > 0 && (
        <ul className="equipment-bulk-errors">
          {result.errors.slice(0, 10).map((err) => (
            <li key={err.row}>Row {err.row}: {err.message}</li>
          ))}
          {result.errors.length > 10 && (
            <li>…and {result.errors.length - 10} more</li>
          )}
        </ul>
      )}
    </div>
  )
}
