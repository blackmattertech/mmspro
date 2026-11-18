import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import FilterableSelect from '../ui/FilterableSelect'
import TableFilterToolbar from '../shared/TableFilterToolbar'
import PageBreadcrumbs from '../shared/PageBreadcrumbs'
import { assetUrl } from '../../lib/assets'
import { useFixedPopover, isEventInFixedPopover } from '../../hooks/useFixedPopover'
import '../company/CompanyShared.css'
import '../shared/TableFilterToolbar.css'
import '../shared/ListTableChrome.css'
import '../workorders/WorkOrdersPage.css'
import './ReportsLayout.css'

const FILTER_ICON_URL = assetUrl('Assets/icons/filter3-outline.svg')

function FilterIcon({ className }) {
  return (
    <span
      className={className}
      style={{ WebkitMaskImage: `url("${FILTER_ICON_URL}")`, maskImage: `url("${FILTER_ICON_URL}")` }}
      aria-hidden="true"
    />
  )
}

const SpellcheckInput = lazy(() => import('../shared/SpellcheckInput'))

function LazySpellcheckInput(props) {
  return (
    <Suspense
      fallback={(
        <input
          className={props.className}
          type={props.type || 'text'}
          value={props.value}
          onChange={props.onChange}
          placeholder={props.placeholder}
          maxLength={props.maxLength}
          aria-label={props['aria-label']}
        />
      )}
    >
      <SpellcheckInput {...props} />
    </Suspense>
  )
}

function ReportExportButton({
  busy = false,
  disabled = false,
  hint,
  onCsv,
  onPdf,
}) {
  const [open, setOpen] = useState(false)
  const anchorRef = useRef(null)
  const { style, popoverProps } = useFixedPopover({
    open,
    anchorRef,
    matchWidth: false,
    minWidth: 200,
    align: 'end',
    gap: 8,
  })

  useEffect(() => {
    if (!open) return undefined
    const onPointerDown = (event) => {
      if (anchorRef.current?.contains(event.target) || isEventInFixedPopover(event)) return
      setOpen(false)
    }
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const label = busy ? 'Exporting…' : 'Export'
  const choose = (format) => {
    setOpen(false)
    if (format === 'pdf') onPdf?.()
    else onCsv?.()
  }

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        className={`company-btn company-btn--secondary equipment-bulk-btn${open ? ' reports-export-btn--open' : ''}`}
        onClick={() => setOpen((value) => !value)}
        disabled={disabled || busy}
        title={disabled && hint ? hint : label}
        data-tooltip={disabled && hint ? hint : label}
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <span className="equipment-bulk-btn__icon" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path d="M12 4V15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M7.5 10.5L12 15L16.5 10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M4 15V18.5C4 19.3284 4.67157 20 5.5 20H18.5C19.3284 20 20 19.3284 20 18.5V15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <span className="equipment-bulk-btn__label">{label}</span>
      </button>
      {open && style && createPortal(
        <div className="reports-export-menu" role="menu" aria-label="Export format" {...popoverProps}>
          <p className="reports-export-menu__title">Export as</p>
          <button type="button" role="menuitem" className="reports-export-menu__choice" onClick={() => choose('csv')}>
            CSV
          </button>
          <button type="button" role="menuitem" className="reports-export-menu__choice" onClick={() => choose('pdf')}>
            PDF
          </button>
        </div>,
        document.body,
      )}
    </>
  )
}

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
  canGenerateReady = false,
  onGenerateReady,
  generatingReady = false,
  canDownload = true,
  downloadHint,
  downloadDisabled,
}) {
  const actionDisabled = downloadDisabled || !canDownload
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
          <LazySpellcheckInput
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
        {canGenerateReady && (
          <TextButton
            label={generatingReady ? 'Generating…' : 'Generate'}
            title={downloadHint || 'Generate and save to Ready Reports'}
            onClick={onGenerateReady}
            disabled={actionDisabled || generatingReady}
            variant="primary"
          />
        )}
        {canSchedule && (
          <TextButton label="Schedule" onClick={onSchedule} />
        )}
        {canSendNow && (
          <TextButton
            label="Send now"
            title={downloadHint || 'Send now'}
            onClick={onSendNow}
            disabled={actionDisabled}
          />
        )}
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
  canGenerateReady = false,
  onGenerateReady,
  generatingReady = false,
  onDownloadCsv,
  canDownload = true,
  filterActiveCount = 0,
  filters = null,
  columnPicker = null,
  children,
}) {
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [isCompactLayout, setIsCompactLayout] = useState(() => (
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 1100px)').matches : false
  ))

  useEffect(() => {
    const media = window.matchMedia('(max-width: 1100px)')
    const sync = () => setIsCompactLayout(media.matches)
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

  const filterTrigger = filters ? (
    <div className="table-filter-menu">
      <button
        type="button"
        className={`table-filter-menu__trigger${filtersOpen ? ' table-filter-menu__trigger--open' : ''}${filterActiveCount > 0 ? ' table-filter-menu__trigger--active' : ''}`}
        onClick={() => setFiltersOpen((open) => !open)}
        aria-expanded={filtersOpen}
        aria-controls="reports-filters-panel"
        aria-label="Filters"
        title="Filters"
        data-tooltip="Filters"
      >
        <FilterIcon className="table-filter-menu__icon" />
        {filterActiveCount > 0 ? (
          <span className="table-filter-menu__badge">{filterActiveCount}</span>
        ) : null}
      </button>
    </div>
  ) : null

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
    canGenerateReady,
    onGenerateReady,
    generatingReady,
    canDownload,
    downloadHint,
    downloadDisabled,
    downloading,
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
              role="dialog"
              aria-modal={filtersOpen ? true : undefined}
              aria-hidden={filtersOpen ? undefined : true}
              inert={filtersOpen ? undefined : true}
            >
              {typeof filters === 'function'
                ? filters({
                  onApplied: closeFilters,
                  onClose: closeFilters,
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
            <div className="wo-page__toolbar-row wo-page__toolbar-row--filters">
              <TableFilterToolbar
                search={{
                  value: search,
                  onChange: onSearchChange,
                  placeholder: 'Search report…',
                  ariaLabel: 'Search report',
                }}
                filterSlot={(
                  <div className="reports-toolbar__icons">
                    {filterTrigger}
                    {columnPicker}
                  </div>
                )}
                actions={(
                  <ReportExportButton
                    busy={downloading}
                    disabled={downloadDisabled || !canDownload}
                    hint={downloadHint}
                    onCsv={onDownloadCsv}
                    onPdf={onDownloadPdf}
                  />
                )}
              />
            </div>
            <div className="wo-page__toolbar-row reports-page__setup">
              <ReportToolbarControls {...toolbarProps} />
            </div>
          </div>

          <div className="wo-page__content reports-page__body">
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}
