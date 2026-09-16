import FilterableSelect from '../ui/FilterableSelect'
import TableFilterToolbar from '../shared/TableFilterToolbar'
import SpellcheckInput from '../shared/SpellcheckInput'
import PageBreadcrumbs from '../shared/PageBreadcrumbs'
import TrashIcon from '../ui/TrashIcon'
import {
  CalendarIcon,
  CsvIcon,
  PdfIcon,
  SaveAsIcon,
  SaveIcon,
  SendIcon,
} from './ReportActionIcons'
import '../company/CompanyShared.css'
import '../shared/TableFilterToolbar.css'
import '../workorders/WorkOrdersPage.css'
import './ReportsLayout.css'

function IconButton({
  label,
  title,
  onClick,
  disabled,
  variant = 'secondary',
  children,
}) {
  return (
    <button
      type="button"
      className={`company-btn company-btn--${variant} company-btn--compact company-btn--icon`}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={title || label}
    >
      {children}
    </button>
  )
}

export default function ReportsLayout({
  title,
  subtitle,
  search,
  onSearchChange,
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
  filters = null,
  children,
}) {
  return (
    <div className="company-page wo-page reports-page">
      <header className="wo-page__top">
        <div className="wo-page__intro">
          <PageBreadcrumbs />
          <h1 className="wo-page__title">{title}</h1>
          {subtitle ? <p className="wo-page__subtitle">{subtitle}</p> : null}
        </div>
      </header>

      <div className="wo-page__toolbar">
        <div className="wo-page__toolbar-row wo-page__toolbar-row--filters">
          <TableFilterToolbar
            search={{
              value: search,
              onChange: onSearchChange,
              placeholder: 'Search report…',
              ariaLabel: 'Search report',
            }}
            filterSlot={filters}
            actions={(
              <>
                <div className="reports-toolbar__group">
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
                      <IconButton
                        label={savingCustom ? 'Saving' : 'Save'}
                        onClick={onSaveCustom}
                        disabled={savingCustom || !customName.trim() || !hasColumns}
                      >
                        <SaveIcon />
                      </IconButton>
                      <IconButton
                        label="Save as"
                        onClick={onSaveAsCustom}
                        disabled={savingCustom || !customName.trim() || !hasColumns}
                      >
                        <SaveAsIcon />
                      </IconButton>
                      <IconButton
                        label="Delete"
                        variant="danger"
                        onClick={onDeleteCustom}
                        disabled={savingCustom || !selectedCustomId}
                      >
                        <TrashIcon />
                      </IconButton>
                    </>
                  )}
                </div>
                <div className="reports-toolbar__group">
                  {canSchedule && (
                    <IconButton label="Schedule" onClick={onSchedule}>
                      <CalendarIcon />
                    </IconButton>
                  )}
                  {canSendNow && (
                    <IconButton
                      label="Send now"
                      title={downloadHint || 'Send now'}
                      onClick={onSendNow}
                      disabled={downloadDisabled}
                    >
                      <SendIcon />
                    </IconButton>
                  )}
                <IconButton
                  label={downloading ? 'Preparing CSV' : 'Download CSV'}
                  title={downloading ? 'Preparing CSV' : 'Download CSV'}
                  onClick={onDownloadCsv}
                  disabled={downloadDisabled || downloading || !canDownload}
                >
                    <CsvIcon />
                  </IconButton>
                <IconButton
                  label={downloading ? 'Preparing PDF' : 'Download PDF'}
                  title={downloading ? 'Preparing PDF' : 'Download activity report PDF'}
                  onClick={onDownloadPdf}
                  variant="primary"
                  disabled={downloadDisabled || downloading || !canDownload}
                >
                    <PdfIcon />
                  </IconButton>
                </div>
              </>
            )}
          />
        </div>
      </div>

      <div className="wo-page__content reports-page__body">
        {children}
      </div>
    </div>
  )
}
