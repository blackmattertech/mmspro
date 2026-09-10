import DateRangeField from '../ui/DateRangeField'
import FilterableSelect from '../ui/FilterableSelect'
import TableColumnPicker from '../shared/TableColumnPicker'
import '../company/CompanyShared.css'
import './ReportsLayout.css'

export default function ReportsLayout({
  title,
  subtitle,
  dateFrom,
  dateTo,
  onDateChange,
  locations = [],
  locationId,
  onLocationChange,
  canSelectLocation = false,
  search,
  onSearchChange,
  columnDefs = [],
  visibleColumnIds = [],
  onToggleColumn,
  onResetColumns,
  onDownloadPdf,
  downloading = false,
  canSchedule = false,
  onSchedule,
  children,
}) {
  return (
    <div className="reports-page">
      <header className="reports-page__header">
        <div className="reports-page__heading">
          <h1 className="reports-page__title">{title}</h1>
          {subtitle ? <p className="reports-page__subtitle">{subtitle}</p> : null}
        </div>
        <div className="reports-page__actions">
          {canSchedule && (
            <button type="button" className="company-btn company-btn--secondary" onClick={onSchedule}>
              Schedule
            </button>
          )}
          <button
            type="button"
            className="company-btn company-btn--primary"
            onClick={onDownloadPdf}
            disabled={downloading || !dateFrom || !dateTo}
          >
            {downloading ? 'Preparing PDF…' : 'Download PDF'}
          </button>
        </div>
      </header>

      <div className="reports-page__bar">
        <div className="reports-page__filters">
          <div className="reports-page__filter">
            <span className="reports-page__filter-label">Period</span>
            <DateRangeField
              from={dateFrom}
              to={dateTo}
              onChange={onDateChange}
              placeholder="Select date range"
            />
          </div>
          <div className="reports-page__filter reports-page__filter--location">
            <span className="reports-page__filter-label">Location</span>
            <FilterableSelect
              value={locationId}
              onChange={onLocationChange}
              options={[
                ...(canSelectLocation ? [{ value: 'all', label: 'All plants' }] : []),
                ...locations.map((loc) => ({ value: loc.id, label: loc.name })),
              ]}
              getOptionValue={(opt) => opt.value}
              getOptionLabel={(opt) => opt.label}
              disabled={!canSelectLocation}
              allowEmpty={false}
              aria-label="Location"
            />
          </div>
          <div className="reports-page__filter reports-page__filter--search">
            <span className="reports-page__filter-label">Search</span>
            <input
              className="company-form__input"
              type="search"
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="WO #, plant, description…"
              aria-label="Search report"
            />
          </div>
        </div>
        <TableColumnPicker
          columnDefs={columnDefs}
          visibleColumnIds={visibleColumnIds}
          onToggle={onToggleColumn}
          onReset={onResetColumns}
        />
      </div>

      <div className="reports-page__body">
        {children}
      </div>
    </div>
  )
}
