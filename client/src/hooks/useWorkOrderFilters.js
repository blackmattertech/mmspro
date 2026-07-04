import { useOutletContext } from 'react-router-dom'

export function useWorkOrderFilters() {
  return useOutletContext() ?? {
    search: '',
    locationFilter: 'all',
    advancedRules: [],
    locations: [],
  }
}
