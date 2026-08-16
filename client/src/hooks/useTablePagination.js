import { useCallback, useEffect, useMemo, useState } from 'react'

export const TABLE_PAGE_SIZE_OPTIONS = [10, 50, 100, 250]

export function useTablePagination(totalCount, { resetKey = '' } = {}) {
  const [pageSize, setPageSize] = useState(TABLE_PAGE_SIZE_OPTIONS[0])
  const [page, setPage] = useState(1)

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize) || 1)
  const safePage = Math.min(page, totalPages)

  useEffect(() => {
    setPage(1)
  }, [resetKey, pageSize])

  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  const rangeStart = totalCount === 0 ? 0 : (safePage - 1) * pageSize + 1
  const rangeEnd = Math.min(safePage * pageSize, totalCount)
  const offset = (safePage - 1) * pageSize

  const paginate = useCallback(
    (items) => {
      if (!Array.isArray(items) || !items.length) return []
      const start = (safePage - 1) * pageSize
      return items.slice(start, start + pageSize)
    },
    [safePage, pageSize],
  )

  return useMemo(
    () => ({
      page: safePage,
      setPage,
      pageSize,
      setPageSize,
      totalPages,
      totalCount,
      rangeStart,
      rangeEnd,
      offset,
      paginate,
      pageSizeOptions: TABLE_PAGE_SIZE_OPTIONS,
      onPageChange: setPage,
      onPageSizeChange: setPageSize,
    }),
    [safePage, pageSize, totalPages, totalCount, rangeStart, rangeEnd, offset, paginate],
  )
}
