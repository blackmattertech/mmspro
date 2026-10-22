import { useOutletContext } from 'react-router-dom'
import WorkRequestsTable from '../../components/workrequests/WorkRequestsTable'

export default function WorkRequestListPage({ filter, emptyHint }) {
  const {
    search = '',
    fieldFilter = { field: '', value: '' },
    sortBy = 'newest',
    columnFilters = {},
    setColumnFilter,
    headerSort = null,
    setHeaderSort,
    statusFilters = [],
    toggleStatus,
    visibleColumnIds,
    bulkReloadToken = 0,
  } = useOutletContext() || {}

  return (
    <WorkRequestsTable
      filter={filter}
      emptyHint={emptyHint}
      search={search}
      fieldFilter={fieldFilter}
      sortBy={sortBy}
      columnFilters={columnFilters}
      setColumnFilter={setColumnFilter}
      headerSort={headerSort}
      setHeaderSort={setHeaderSort}
      statusFilters={statusFilters}
      toggleStatus={toggleStatus}
      visibleColumnIds={visibleColumnIds}
      bulkReloadToken={bulkReloadToken}
    />
  )
}
