import PageBack from './PageBack'
import './RecordDetailLayout.css'

export default function RecordDetailLayout({
  backLabel,
  onBack,
  title,
  subtitle,
  actions,
  children,
  loading = false,
  error = null,
  className = '',
}) {
  if (loading) {
    return <div className="company-loading">Loading…</div>
  }

  return (
    <div className={`company-page${className ? ` ${className}` : ''}`}>
      <header className="company-page__header">
        <div className="record-detail-layout__header">
          <div className="record-detail-layout__heading">
            <PageBack onClick={onBack} label={backLabel} />
            <h1 className="company-page__title">{title}</h1>
            {subtitle && <p className="company-page__subtitle">{subtitle}</p>}
          </div>
          {actions && (
            <div className="record-detail-layout__actions">
              {actions}
            </div>
          )}
        </div>
      </header>

      <div className="company-page__content">
        <div className="company-panel">
          {error && <div className="company-alert" role="alert">{error}</div>}
          {children}
        </div>
      </div>
    </div>
  )
}
