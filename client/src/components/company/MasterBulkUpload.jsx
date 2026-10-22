import { useRef, useState, useEffect } from 'react'
import { useBackdropClose } from '../../hooks/useBackdropClose'
import NavIcon from '../layout/NavIcon'
import PageBack from '../shared/PageBack'
import { ImportGroupList } from './ImportGroupList'

/**
 * Shared bulk template download + xlsx upload helpers for company masters.
 */
export function useMasterBulkUpload({
  downloadTemplate,
  upload,
  previewUpload,
  onSuccess,
  onError,
  defaultFilename = 'template.xlsx',
}) {
  const bulkInputRef = useRef(null)
  const [bulkBusy, setBulkBusy] = useState(false)
  const [bulkError, setBulkError] = useState(null)
  const [bulkResult, setBulkResult] = useState(null)
  const [bulkPreview, setBulkPreview] = useState(null)
  const [pendingFile, setPendingFile] = useState(null)

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
      throw err
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
      if (previewUpload) {
        const preview = await previewUpload(base64)
        setPendingFile(base64)
        setBulkPreview(preview)
        setBulkResult(null)
        return
      }
      const result = await upload(base64)
      setBulkResult(result)
      await onSuccess?.(result)
    } catch (err) {
      if (onError?.(err)) return
      setBulkError(err.message)
    } finally {
      setBulkBusy(false)
      if (bulkInputRef.current) bulkInputRef.current.value = ''
    }
  }

  const confirmBulkImport = async () => {
    if (!pendingFile) return
    setBulkBusy(true)
    setBulkError(null)
    try {
      const result = await upload(pendingFile)
      setBulkResult(result)
      setBulkPreview(null)
      setPendingFile(null)
      await onSuccess?.(result)
    } catch (err) {
      if (onError?.(err)) return
      setBulkError(err.message)
    } finally {
      setBulkBusy(false)
    }
  }

  const cancelBulkPreview = () => {
    setBulkPreview(null)
    setPendingFile(null)
  }

  return {
    bulkInputRef,
    bulkBusy,
    bulkError,
    bulkResult,
    bulkPreview,
    setBulkResult,
    handleDownloadTemplate,
    handleBulkFile,
    confirmBulkImport,
    cancelBulkPreview,
  }
}

export function MasterBulkActions({
  onDownload,
  bulkBusy,
  bulkInputRef,
  onFileChange,
  addLabel,
  onAdd,
  title = 'Import',
  description = 'Download the sample Excel file, replace the example row with your records (or add more rows below), then upload the completed .xlsx file.',
  bulkError,
  bulkResult,
  bulkPreview = null,
  onConfirmImport,
  onCancelPreview,
  noun = 'record',
  closeSignal = false,
  actionLabel = 'Import',
  showToolbarDownload = false,
}) {
  const [open, setOpen] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const handleBackdropClick = useBackdropClose(() => setOpen(false))

  useEffect(() => {
    if (closeSignal) setOpen(false)
  }, [closeSignal])

  const handleDownload = async () => {
    setDownloading(true)
    try {
      await onDownload?.()
    } catch {
      setOpen(true)
    } finally {
      setDownloading(false)
    }
  }

  return (
    <>
      {showToolbarDownload && (
        <button
          type="button"
          className="company-btn company-btn--secondary equipment-bulk-btn"
          onClick={handleDownload}
          disabled={bulkBusy || downloading}
        >
          <span className="equipment-bulk-btn__icon" aria-hidden="true">
            <NavIcon name="download" />
          </span>
          {downloading ? 'Preparing…' : 'Download sample'}
        </button>
      )}
      <button
        type="button"
        className="company-btn company-btn--secondary equipment-bulk-btn"
        onClick={() => setOpen(true)}
      >
        <span className="equipment-bulk-btn__icon" aria-hidden="true">
          <NavIcon name="upload" />
        </span>
        {actionLabel}
      </button>
      {onAdd && (
        <button type="button" className="company-btn company-btn--primary" onClick={onAdd}>
          {addLabel}
        </button>
      )}

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
              <div className="master-bulk-modal__desc">{description}</div>

              <div className="master-bulk-modal__actions">
                <button
                  type="button"
                  className="company-btn company-btn--secondary equipment-bulk-btn"
                  onClick={handleDownload}
                  disabled={bulkBusy || downloading}
                >
                  <span className="equipment-bulk-btn__icon" aria-hidden="true">
                    <NavIcon name="download" />
                  </span>
                  {downloading ? 'Preparing…' : 'Download sample'}
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

              {bulkPreview && (
                <div className="import-groups">
                  <p className="import-groups__heading">{bulkPreview.summary}</p>
                  <ImportGroupList groups={bulkPreview.groups} />
                  {bulkPreview.errors?.length > 0 && (
                    <ul className="equipment-bulk-errors">
                      {bulkPreview.errors.slice(0, 8).map((err) => (
                        <li key={`${err.row}-${err.field}`}>
                          Row {err.row}: {err.message}
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="master-bulk-modal__confirm">
                    <button
                      type="button"
                      className="company-btn company-btn--secondary"
                      onClick={onCancelPreview}
                      disabled={bulkBusy}
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      className="company-btn company-btn--primary"
                      onClick={onConfirmImport}
                      disabled={bulkBusy || ((bulkPreview.created || 0) + (bulkPreview.updated || 0) === 0)}
                    >
                      {bulkBusy ? 'Importing…' : 'Confirm import'}
                    </button>
                  </div>
                </div>
              )}

              {bulkError && <div className="company-error">{bulkError}</div>}
              <MasterBulkResult result={bulkPreview ? null : bulkResult} noun={noun} />
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
      <strong>{result.summary || parts[0]}</strong>
      {!result.summary && (parts.length > 1 ? `, ${parts.slice(1).join(', ')}.` : '.')}
      {result.groups?.length > 0 && <ImportGroupList groups={result.groups} />}
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
