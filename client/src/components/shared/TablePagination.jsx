import '../company/CompanyShared.css'

function buildPageList(current, total) {
  if (total <= 1) return [1]
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1)
  }

  const pages = new Set([1, total, current, current - 1, current + 1, current - 2, current + 2])
  const sorted = [...pages].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b)
  const result = []
  for (let i = 0; i < sorted.length; i += 1) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) result.push('ellipsis')
    result.push(sorted[i])
  }
  return result
}

export default function TablePagination({
  page,
  totalPages,
  pageSize,
  pageSizeOptions = [10, 50, 100, 250],
  totalCount,
  rangeStart,
  rangeEnd,
  onPageChange,
  onPageSizeChange,
  className = '',
}) {
  if (totalCount === 0) return null

  const pages = buildPageList(page, totalPages)

  return (
    <footer className={`table-pagination ${className}`.trim()} aria-label="Table pagination">
      <p className="table-pagination__summary">
        Showing {rangeStart}–{rangeEnd} of {totalCount}
      </p>

      <div className="table-pagination__controls">
        <label className="table-pagination__page-size">
          <span className="table-pagination__page-size-label">Rows per page</span>
          <select
            className="table-pagination__page-size-select company-form__input--select"
            value={String(pageSize)}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            aria-label="Rows per page"
          >
            {pageSizeOptions.map((size) => (
              <option key={size} value={String(size)}>
                {size}
              </option>
            ))}
          </select>
        </label>

        <nav className="table-pagination__nav" aria-label="Pages">
          <button
            type="button"
            className="table-pagination__arrow"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            aria-label="Previous page"
          >
            ‹
          </button>
          <div className="table-pagination__pages">
            {pages.map((item, index) => {
              if (item === 'ellipsis') {
                return (
                  <span key={`ellipsis-${index}`} className="table-pagination__ellipsis" aria-hidden="true">
                    …
                  </span>
                )
              }
              const isActive = item === page
              return (
                <button
                  key={item}
                  type="button"
                  className={`table-pagination__page${isActive ? ' table-pagination__page--active' : ''}`}
                  onClick={() => onPageChange(item)}
                  aria-label={`Page ${item}`}
                  aria-current={isActive ? 'page' : undefined}
                >
                  {item}
                </button>
              )
            })}
          </div>
          <button
            type="button"
            className="table-pagination__arrow"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
            aria-label="Next page"
          >
            ›
          </button>
        </nav>
      </div>
    </footer>
  )
}
