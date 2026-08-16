import './DetailView.css'

export function DetailView({ children, className = '' }) {
  return <div className={`detail-view ${className}`.trim()}>{children}</div>
}

export function DetailSection({ title, children }) {
  return (
    <section className="detail-view__section">
      {title && <h3 className="detail-view__section-title">{title}</h3>}
      {children}
    </section>
  )
}

export function DetailGrid({ children }) {
  return <div className="detail-view__grid">{children}</div>
}

export function DetailField({ label, value, fullWidth = false }) {
  const display = value === null || value === undefined || value === '' ? '—' : value
  return (
    <div className={`detail-view__field${fullWidth ? ' detail-view__field--full' : ''}`}>
      <span className="detail-view__label">{label}</span>
      <div className="detail-view__value">{display}</div>
    </div>
  )
}

export function DetailTable({ columns, rows, emptyLabel = 'No items.' }) {
  if (!rows?.length) {
    return <div className="company-empty">{emptyLabel}</div>
  }

  return (
    <div className="detail-view__table-wrap">
      <table className="detail-view__table">
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.id}>{col.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.id || index}>
              {columns.map((col) => (
                <td key={col.id}>{col.render ? col.render(row) : (row[col.id] ?? '—')}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
