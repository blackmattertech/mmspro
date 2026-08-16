import { useOutletContext } from 'react-router-dom'
import WorkRequestsTable from '../../components/workrequests/WorkRequestsTable'

export default function WorkRequestListPage({ filter, emptyHint }) {
  const {
    search = '',
    fieldFilter = { field: '', value: '' },
    sortBy = 'newest',
    visibleColumnIds,
  } = useOutletContext() || {}

  return (
    <WorkRequestsTable
      filter={filter}
      emptyHint={emptyHint}
      search={search}
      fieldFilter={fieldFilter}
      sortBy={sortBy}
      visibleColumnIds={visibleColumnIds}
    />
  )
}
