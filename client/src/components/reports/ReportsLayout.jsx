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
  filters = null,
  children,
}) {
  return (
    <div className="company-page wo-page reports-page">
      <div className="reports-page__shell">
        {filters ? (
          <aside className="reports-page__filters" aria-label="Report filters">
            {filters}
          </aside>
        ) : null}

        <div className="reports-page__main">
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
                actions={(
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
                    <div className="reports-toolbar__group">
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
                )}
              />
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
