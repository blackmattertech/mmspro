import { useEffect, useState } from 'react'
import FilterableSelect from '../ui/FilterableSelect'
import TableFilterToolbar from '../shared/TableFilterToolbar'
import SpellcheckInput from '../shared/SpellcheckInput'
import PageBreadcrumbs from '../shared/PageBreadcrumbs'
import '../company/CompanyShared.css'
import '../shared/TableFilterToolbar.css'
import '../workorders/WorkOrdersPage.css'
import './ReportsLayout.css'

function TextButton({
  label,
  title,
  onClick,
  disabled,
  variant = 'secondary',
}) {
  return (
    <button
      type="button"
      className={`company-btn company-btn--${variant} company-btn--compact`}
      onClick={onClick}
      disabled={disabled}
      title={title || label}
    >
      {label}
    </button>
  )
}

function ReportToolbarControls({
  reportKey,
  reportTypeOptions,
  onReportKeyChange,
  selectedCustomId,
  onSelectCustom,
  customReports,
  canManageCustom,
  customName,
  onCustomNameChange,
  customDirty,
  savingCustom,
  hasColumns,
  onSaveCustom,
  onSaveAsCustom,
  onDeleteCustom,
  canSchedule,
  onSchedule,
  canSendNow,
  onSendNow,
  downloadHint,
  downloadDisabled,
  downloading,
  canDownload,
  onDownloadCsv,
  onDownloadPdf,
}) {
  return (
    <>
      <div className="reports-toolbar__group">
        {reportTypeOptions.length > 0 && (
          <div className="reports-toolbar__control reports-toolbar__control--select">
            <FilterableSelect
              value={reportKey}
              onChange={onReportKeyChange}
              options={reportTypeOptions}
              getOptionValue={(opt) => opt.value}
              getOptionLabel={(opt) => opt.label}
              allowEmpty={false}
              aria-label="Report type"
            />
          </div>
        )}
        <div className="reports-toolbar__control reports-toolbar__control--select">
          <FilterableSelect
            value={selectedCustomId}
            onChange={onSelectCustom}
            options={[
              { value: '', label: 'New custom report' },
              ...customReports.map((item) => ({ value: item.id, label: item.name })),
            ]}
            getOptionValue={(opt) => opt.value}
            getOptionLabel={(opt) => opt.label}
            allowEmpty={false}
            aria-label="Custom report"
          />
        </div>
        {canManageCustom && (
          <SpellcheckInput
            wrapperClassName="reports-toolbar__name"
            className="company-form__input"
            type="text"
            value={customName}
            onChange={(event) => onCustomNameChange(event.target.value)}
            placeholder="Report name"
            maxLength={80}
            aria-label="Custom report name"
          />
        )}
        {customDirty ? <span className="reports-page__dirty">Unsaved</span> : null}
        {canManageCustom && (
          <>
            <TextButton
              label={savingCustom ? 'Saving…' : 'Save'}
              onClick={onSaveCustom}
              disabled={savingCustom || !customName.trim() || !hasColumns}
            />
            <TextButton
              label="Save as"
              onClick={onSaveAsCustom}
              disabled={savingCustom || !customName.trim() || !hasColumns}
            />
            <TextButton
              label="Delete"
              variant="danger"
              onClick={onDeleteCustom}
              disabled={savingCustom || !selectedCustomId}
            />
          </>
        )}
      </div>
      <div className="reports-toolbar__group reports-toolbar__group--actions">
        {canSchedule && (
          <TextButton label="Schedule" onClick={onSchedule} />
        )}
        {canSendNow && (
          <TextButton
            label="Send now"
            title={downloadHint || 'Send now'}
            onClick={onSendNow}
            disabled={downloadDisabled}
          />
        )}
        <TextButton
          label={downloading ? 'Preparing CSV…' : 'Download CSV'}
          onClick={onDownloadCsv}
          disabled={downloadDisabled || downloading || !canDownload}
        />
        <TextButton
          label={downloading ? 'Preparing PDF…' : 'Download PDF'}
          onClick={onDownloadPdf}
          variant="primary"
          disabled={downloadDisabled || downloading || !canDownload}
        />
      </div>
    </>
  )
}

export default function ReportsLayout({
  title,
  subtitle,
  search,
  onSearchChange,
  reportKey = 'logs',
  reportTypeOptions = [],
  onReportKeyChange,
  customReports = [],
  selectedCustomId = '',
  onSelectCustom,
  customName = '',
  onCustomNameChange,
  canManageCustom = false,
  onSaveCustom,
  onSaveAsCustom,
  onDeleteCustom,
  savingCustom = false,
  customDirty = false,
  hasColumns = true,
  onDownloadPdf,
  downloading = false,
  downloadDisabled = false,
  downloadHint,
  canSchedule = false,
  onSchedule,
  canSendNow = false,
  onSendNow,
  onDownloadCsv,
  canDownload = true,
  filterActiveCount = 0,
  filters = null,
  children,
}) {
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [isCompactLayout, setIsCompactLayout] = useState(() => (
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 1100px)').matches : false
  ))

  useEffect(() => {
    const media = window.matchMedia('(max-width: 1100px)')
    const sync = () => {
      const compact = media.matches
      setIsCompactLayout(compact)
      if (!compact) {
        setFiltersOpen(false)
        setSettingsOpen(false)
      }
    }
    sync()
    media.addEventListener('change', sync)
    return () => media.removeEventListener('change', sync)
  }, [])

  useEffect(() => {
    if (!filtersOpen) return undefined
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setFiltersOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previous
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [filtersOpen])

  const closeFilters = () => setFiltersOpen(false)

  const toolbarProps = {
    reportKey,
    reportTypeOptions,
    onReportKeyChange,
    selectedCustomId,
    onSelectCustom,
    customReports,
    canManageCustom,
    customName,
    onCustomNameChange,
    customDirty,
    savingCustom,
    hasColumns,
    onSaveCustom,
    onSaveAsCustom,
    onDeleteCustom,
    canSchedule,
    onSchedule,
    canSendNow,
    onSendNow,
    downloadHint,
    downloadDisabled,
    downloading,
    canDownload,
    onDownloadCsv,
    onDownloadPdf,
  }

  return (
    <div className={`company-page wo-page reports-page${filtersOpen ? ' reports-page--filters-open' : ''}${isCompactLayout ? ' reports-page--compact' : ''}`}>
      <div className="reports-page__shell">
        {filters ? (
          <>
            <button
              type="button"
              className="reports-page__filters-backdrop"
              aria-label="Close filters"
              tabIndex={filtersOpen ? 0 : -1}
              onClick={closeFilters}
            />
            <aside
              className={`reports-page__filters${filtersOpen ? ' reports-page__filters--open' : ''}`}
              aria-label="Report filters"
              id="reports-filters-panel"
              role={isCompactLayout ? 'dialog' : undefined}
              aria-modal={isCompactLayout && filtersOpen ? true : undefined}
            >
              {typeof filters === 'function'
                ? filters({
                  onApplied: isCompactLayout ? closeFilters : undefined,
                  onClose: isCompactLayout ? closeFilters : undefined,
                })
                : filters}
            </aside>
          </>
        ) : null}

        <div className="reports-page__main">
          <header className="wo-page__top reports-page__hero">
            <div className="wo-page__intro">
              <PageBreadcrumbs />
              <h1 className="wo-page__title">{title}</h1>
              {subtitle ? <p className="wo-page__subtitle">{subtitle}</p> : null}
            </div>
          </header>

          <div className="wo-page__toolbar reports-page__toolbar">
            {isCompactLayout ? (
              <div className="reports-mobile">
                <div className="reports-mobile__command">
                  <label className="reports-mobile__search">
                    <span className="reports-mobile__search-icon" aria-hidden="true">
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                        <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5" />
                        <path d="M10.5 10.5L13.5 13.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                      </svg>
                    </span>
                    <input
                      type="search"
                      className="company-form__input reports-mobile__search-input"
                      placeholder="Search report…"
                      value={search}
                      onChange={(event) => onSearchChange(event.target.value)}
                      aria-label="Search report"
                    />
                  </label>
                  {filters ? (
                    <button
                      type="button"
                      className={`reports-page__filters-toggle${filterActiveCount > 0 ? ' reports-page__filters-toggle--active' : ''}${filtersOpen ? ' reports-page__filters-toggle--open' : ''}`}
                      onClick={() => setFiltersOpen((open) => !open)}
                      aria-expanded={filtersOpen}
                      aria-controls="reports-filters-panel"
                    >
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                        <path d="M2 4H14M4 8H12M6 12H10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                      </svg>
                      Filters
                      {filterActiveCount > 0 ? (
                        <span className="reports-page__filters-toggle-badge">{filterActiveCount}</span>
                      ) : null}
                    </button>
                  ) : null}
                </div>

                <div className="reports-mobile__panel">
                  <button
                    type="button"
                    className={`reports-mobile__panel-toggle${settingsOpen ? ' reports-mobile__panel-toggle--open' : ''}`}
                    onClick={() => setSettingsOpen((open) => !open)}
                    aria-expanded={settingsOpen}
                    aria-controls="reports-mobile-settings"
                  >
                    <span>
                      <strong>Report setup</strong>
                      <small>Type, custom save, and exports</small>
                    </span>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                      <path d="M4 6L8 10L12 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                  <div
                    id="reports-mobile-settings"
                    className={`reports-mobile__panel-body${settingsOpen ? ' reports-mobile__panel-body--open' : ''}`}
                    hidden={!settingsOpen}
                  >
                    <div className="reports-mobile__section">
                      <p className="reports-mobile__section-label">Configuration</p>
                      <div className="reports-toolbar__group">
                        {reportTypeOptions.length > 0 && (
                          <div className="reports-toolbar__control reports-toolbar__control--select">
                            <FilterableSelect
                              value={reportKey}
                              onChange={onReportKeyChange}
                              options={reportTypeOptions}
                              getOptionValue={(opt) => opt.value}
                              getOptionLabel={(opt) => opt.label}
                              allowEmpty={false}
                              aria-label="Report type"
                            />
                          </div>
                        )}
                        <div className="reports-toolbar__control reports-toolbar__control--select">
                          <FilterableSelect
                            value={selectedCustomId}
                            onChange={onSelectCustom}
                            options={[
                              { value: '', label: 'New custom report' },
                              ...customReports.map((item) => ({ value: item.id, label: item.name })),
                            ]}
                            getOptionValue={(opt) => opt.value}
                            getOptionLabel={(opt) => opt.label}
                            allowEmpty={false}
                            aria-label="Custom report"
                          />
                        </div>
                        {canManageCustom && (
                          <SpellcheckInput
                            wrapperClassName="reports-toolbar__name"
                            className="company-form__input"
                            type="text"
                            value={customName}
                            onChange={(event) => onCustomNameChange(event.target.value)}
                            placeholder="Report name"
                            maxLength={80}
                            aria-label="Custom report name"
                          />
                        )}
                        {customDirty ? <span className="reports-page__dirty">Unsaved</span> : null}
                        {canManageCustom && (
                          <div className="reports-mobile__save-row">
                            <TextButton
                              label={savingCustom ? 'Saving…' : 'Save'}
                              onClick={onSaveCustom}
                              disabled={savingCustom || !customName.trim() || !hasColumns}
                            />
                            <TextButton
                              label="Save as"
                              onClick={onSaveAsCustom}
                              disabled={savingCustom || !customName.trim() || !hasColumns}
                            />
                            <TextButton
                              label="Delete"
                              variant="danger"
                              onClick={onDeleteCustom}
                              disabled={savingCustom || !selectedCustomId}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="reports-mobile__section">
                      <p className="reports-mobile__section-label">Share & download</p>
                      <div className="reports-mobile__actions">
                        {canSchedule && (
                          <TextButton label="Schedule" onClick={onSchedule} />
                        )}
                        {canSendNow && (
                          <TextButton
                            label="Send now"
                            title={downloadHint || 'Send now'}
                            onClick={onSendNow}
                            disabled={downloadDisabled}
                          />
                        )}
                        <TextButton
                          label={downloading ? 'Preparing CSV…' : 'Download CSV'}
                          onClick={onDownloadCsv}
                          disabled={downloadDisabled || downloading || !canDownload}
                        />
                        <TextButton
                          label={downloading ? 'Preparing PDF…' : 'Download PDF'}
                          onClick={onDownloadPdf}
                          variant="primary"
                          disabled={downloadDisabled || downloading || !canDownload}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="wo-page__toolbar-row wo-page__toolbar-row--filters">
                <TableFilterToolbar
                  search={{
                    value: search,
                    onChange: onSearchChange,
                    placeholder: 'Search report…',
                    ariaLabel: 'Search report',
                  }}
                  actions={<ReportToolbarControls {...toolbarProps} />}
                />
              </div>
            )}
          </div>

          <div className="wo-page__content reports-page__body">
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}
