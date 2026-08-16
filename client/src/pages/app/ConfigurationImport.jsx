import { useMemo, useRef, useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useOrg } from '../../hooks/useOrg'
import { usePermissions } from '../../hooks/usePermissions'
import { useImportJobs } from '../../hooks/useImportJobs'
import { useTablePagination } from '../../hooks/useTablePagination'
import { orgPath } from '../../config/navigation'
import PageBack from '../../components/shared/PageBack'
import NavIcon from '../../components/layout/NavIcon'
import FilterableSelect from '../../components/ui/FilterableSelect'
import TablePagination from '../../components/shared/TablePagination'
import { IMPORT_TEMPLATES, IMPORT_PREVIEW_COLUMNS } from '../../config/importTemplates'
import { downloadBase64File, readFileAsBase64 } from '../../lib/fileDownload'
import './Company.css'
import '../../components/company/CompanyShared.css'
import './ConfigurationImport.css'

function ImportPreviewTable({ templateId, preview }) {
  const columns = IMPORT_PREVIEW_COLUMNS[templateId] || []
  const pagination = useTablePagination(preview.length)
  const rows = pagination.paginate(preview)

  if (!preview.length || !columns.length) return null

  return (
    <section className="import-preview" aria-labelledby="import-preview-title">
      <div className="import-preview__header">
        <h2 id="import-preview-title" className="import-preview__title">
          Imported records preview
        </h2>
        <p className="import-preview__subtitle">
          Showing up to {preview.length} successfully imported row(s) from this file.
        </p>
      </div>
      <div className="company-table-wrap">
        <table className="company-table master-table">
          <thead>
            <tr>
              <th>Row</th>
              {columns.map((col) => (
                <th key={col.key}>{col.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.row}-${row.name}`}>
                <td>{row.row}</td>
                {columns.map((col) => (
                  <td key={col.key}>{row[col.key] || '—'}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <TablePagination
          page={pagination.page}
          totalPages={pagination.totalPages}
          pageSize={pagination.pageSize}
          pageSizeOptions={pagination.pageSizeOptions}
          totalCount={preview.length}
          rangeStart={pagination.rangeStart}
          rangeEnd={pagination.rangeEnd}
          onPageChange={pagination.setPage}
          onPageSizeChange={pagination.setPageSize}
        />
      </div>
    </section>
  )
}

function ImportStatusPanel({ job, onDownloadFailed, onUploadAgain }) {
  if (!job) return null

  if (job.status === 'running') {
    return (
      <div className="import-status import-status--processing" role="status">
        <p className="import-status__title">Import in progress</p>
        <p className="import-status__meta">
          Processing <strong>{job.fileName}</strong> in the background. You can leave this page or
          continue working — we will update this section when the import finishes.
        </p>
      </div>
    )
  }

  if (job.status === 'error') {
    return (
      <div className="import-status import-status--failed" role="alert">
        <p className="import-status__title">Import failed</p>
        <p className="import-status__meta">{job.error}</p>
        <div className="import-status__actions">
          <button type="button" className="company-btn company-btn--primary" onClick={onUploadAgain}>
            Try again
          </button>
        </div>
      </div>
    )
  }

  const result = job.result
  if (!result) return null

  const failedFile = job.failedFile

  if (job.status === 'success') {
    return (
      <>
        <div className="import-status import-status--success" role="status">
          <p className="import-status__title">Import completed</p>
          <p className="import-status__meta">
            <strong>{result.created}</strong> row(s) imported successfully from{' '}
            <strong>{job.fileName}</strong>.
          </p>
          <div className="import-status__actions">
            <button type="button" className="company-btn company-btn--secondary" onClick={onUploadAgain}>
              Import another file
            </button>
          </div>
        </div>
        <ImportPreviewTable templateId={job.templateId} preview={result.preview || []} />
      </>
    )
  }

  if (job.status === 'partial') {
    return (
      <>
        <div className="import-status import-status--partial" role="status">
          <p className="import-status__title">Import completed with errors</p>
          <p className="import-status__meta">
            <strong>{result.created}</strong> row(s) imported, <strong>{result.failed}</strong> failed.
            Download the failed-rows file, fix issues, remove the Import errors column, and upload again.
          </p>
          {result.errors?.length > 0 && (
            <ul className="import-status__errors">
              {result.errors.slice(0, 8).map((err) => (
                <li key={err.row}>
                  Row {err.row}: {err.message}
                </li>
              ))}
              {result.errors.length > 8 && (
                <li>…and {result.errors.length - 8} more (see failed-rows file)</li>
              )}
            </ul>
          )}
          <div className="import-status__actions">
            {failedFile && (
              <button
                type="button"
                className="company-btn company-btn--secondary equipment-bulk-btn"
                onClick={onDownloadFailed}
              >
                <span className="equipment-bulk-btn__icon" aria-hidden="true">
                  <NavIcon name="download" />
                </span>
                Download failed rows
              </button>
            )}
            <button type="button" className="company-btn company-btn--primary" onClick={onUploadAgain}>
              Re-upload corrected file
            </button>
          </div>
        </div>
        {(result.preview?.length ?? 0) > 0 && (
          <ImportPreviewTable templateId={job.templateId} preview={result.preview} />
        )}
      </>
    )
  }

  return (
    <div className="import-status import-status--failed" role="status">
      <p className="import-status__title">
        {result.created === 0 && result.failed === 0 ? 'Nothing to import' : 'Import failed'}
      </p>
      <p className="import-status__meta">
        {result.created === 0 && result.failed === 0 ? (
          <>The file had no data rows. Add rows on the Template sheet and try again.</>
        ) : (
          <>No rows were imported. <strong>{result.failed}</strong> row(s) had errors.</>
        )}
      </p>
      {result.errors?.length > 0 && (
        <ul className="import-status__errors">
          {result.errors.slice(0, 8).map((err) => (
            <li key={err.row}>
              Row {err.row}: {err.message}
            </li>
          ))}
        </ul>
      )}
      <div className="import-status__actions">
        {failedFile && (
          <button
            type="button"
            className="company-btn company-btn--secondary equipment-bulk-btn"
            onClick={onDownloadFailed}
          >
            <span className="equipment-bulk-btn__icon" aria-hidden="true">
              <NavIcon name="download" />
            </span>
            Download failed rows
          </button>
        )}
        <button type="button" className="company-btn company-btn--primary" onClick={onUploadAgain}>
          Try again
        </button>
      </div>
    </div>
  )
}

export default function ConfigurationImport() {
  const { org } = useOrg()
  const { loading, canCreate } = usePermissions()
  const { jobs, runImport } = useImportJobs()
  const fileInputRef = useRef(null)
  const [searchParams] = useSearchParams()
  const templateFromUrl = searchParams.get('template')

  const availableTemplates = useMemo(
    () => IMPORT_TEMPLATES.filter((t) => t.showWithoutPermission || canCreate(t.moduleKey)),
    [canCreate],
  )

  const [templateId, setTemplateId] = useState('')
  const template = useMemo(
    () => availableTemplates.find((t) => t.id === templateId) || availableTemplates[0] || null,
    [availableTemplates, templateId],
  )

  useEffect(() => {
    if (!availableTemplates.length) {
      setTemplateId('')
      return
    }
    if (templateFromUrl && availableTemplates.some((t) => t.id === templateFromUrl)) {
      setTemplateId(templateFromUrl)
      return
    }
    setTemplateId((current) => (
      current && availableTemplates.some((t) => t.id === current)
        ? current
        : availableTemplates[0].id
    ))
  }, [availableTemplates, templateFromUrl])

  const [downloadBusy, setDownloadBusy] = useState(false)
  const [fileReading, setFileReading] = useState(false)
  const [uploadError, setUploadError] = useState(null)

  const latestJob = useMemo(
    () => jobs.find((job) => job.templateId === template?.id) || null,
    [jobs, template?.id],
  )

  const isRunning = latestJob?.status === 'running'

  const handleTemplateChange = (nextId) => {
    setTemplateId(nextId)
    setUploadError(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleDownloadTemplate = async () => {
    if (!template) return
    setDownloadBusy(true)
    setUploadError(null)
    try {
      const file = await template.downloadTemplate()
      downloadBase64File(file)
    } catch (err) {
      setUploadError(err.message)
    } finally {
      setDownloadBusy(false)
    }
  }

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file || !template) return
    setUploadError(null)
    setFileReading(true)
    try {
      const base64 = await readFileAsBase64(file)
      await runImport({
        templateId: template.id,
        templateLabel: template.label,
        fileName: file.name,
        upload: () => template.upload(base64),
      })
    } catch (err) {
      setUploadError(err.message)
    } finally {
      setFileReading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleDownloadFailed = () => {
    if (latestJob?.failedFile) downloadBase64File(latestJob.failedFile)
  }

  const handleUploadAgain = () => {
    setUploadError(null)
    fileInputRef.current?.click()
  }

  const backLink = useMemo(() => {
    if (templateFromUrl === 'vendors' && org?.slug) {
      return { to: orgPath(org.slug, 'masters/vendors'), label: 'Vendors' }
    }
    return { to: org?.slug ? orgPath(org.slug, 'dashboard') : '#', label: 'Dashboard' }
  }, [org?.slug, templateFromUrl])

  if (loading) {
    return (
      <div className="company-page import-page">
        <div className="company-loading">Loading…</div>
      </div>
    )
  }

  if (!availableTemplates.length) {
    return (
      <div className="company-page import-page">
        <header className="company-page__header">
          <PageBack
            to={backLink.to}
            label={backLink.label}
          />
          <h1 className="company-page__title">Import</h1>
          <p className="company-page__subtitle">Bulk import data from Excel templates</p>
        </header>
        <div className="company-page__content import-page__content">
          <div className="company-empty">
            You do not have permission to import data. Contact an administrator if you need access.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="company-page import-page">
      <header className="company-page__header">
        <PageBack
          to={backLink.to}
          label={backLink.label}
        />
        <h1 className="company-page__title">Import</h1>
        <p className="company-page__subtitle">
          Download a template, fill in your data, and upload to import in bulk
        </p>
      </header>

      <div className="company-page__content import-page__content">
        <div className="import-page__layout">
          <div className="company-panel import-page__setup">
            <div className="import-template-field">
              <label className="import-template-field__label" htmlFor="import-template-select">
                What do you want to import?
              </label>
              <FilterableSelect
                id="import-template-select"
                inputClassName="import-template-field__select"
                value={template?.id || ''}
                onChange={handleTemplateChange}
                options={availableTemplates}
                getOptionValue={(t) => t.id}
                getOptionLabel={(t) => t.label}
                disabled={isRunning}
                allowEmpty={false}
              />
              {template?.description && (
                <p className="import-template-field__hint">{template.description}</p>
              )}
            </div>

            {template && (
              <section className="import-instructions" aria-labelledby="import-instructions-title">
                <h2 id="import-instructions-title" className="import-instructions__title">
                  Instructions
                </h2>
                <ol className="import-instructions__list">
                  {template.instructions.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
              </section>
            )}

            <div className="import-actions">
              <button
                type="button"
                className="company-btn company-btn--secondary equipment-bulk-btn"
                onClick={handleDownloadTemplate}
                disabled={!template || downloadBusy || isRunning}
              >
                <span className="equipment-bulk-btn__icon" aria-hidden="true">
                  <NavIcon name="download" />
                </span>
                {downloadBusy ? 'Preparing…' : 'Download template'}
              </button>
            </div>

            <div className="import-upload-zone">
              <p className="import-upload-zone__text">
                Upload your completed Excel file (.xlsx). Imports run in the background so you can
                keep using the app.
              </p>
              {latestJob?.fileName && (
                <p className="import-upload-zone__filename">Last file: {latestJob.fileName}</p>
              )}
              <button
                type="button"
                className="company-btn company-btn--primary equipment-bulk-btn"
                onClick={() => fileInputRef.current?.click()}
                disabled={!template || fileReading || isRunning}
              >
                <span className="equipment-bulk-btn__icon" aria-hidden="true">
                  <NavIcon name="upload" />
                </span>
                {fileReading ? 'Reading file…' : isRunning ? 'Import running…' : 'Upload and import'}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                style={{ display: 'none' }}
                onChange={handleFileChange}
              />
            </div>

            {uploadError && <div className="company-error">{uploadError}</div>}
          </div>

          <div className="import-page__results">
            <ImportStatusPanel
              job={latestJob}
              onDownloadFailed={handleDownloadFailed}
              onUploadAgain={handleUploadAgain}
            />
            {!latestJob && (
              <div className="import-page__placeholder">
                <p>Status and a preview of imported rows will appear here after you upload a file.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
