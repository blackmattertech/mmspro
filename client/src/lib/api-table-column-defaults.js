import { apiFetch } from './api'

export function getTableColumnDefault(tableId) {
  return apiFetch(`/api/table-column-defaults/${encodeURIComponent(tableId)}`)
}

export function saveTableColumnDefault(tableId, prefs) {
  return apiFetch(`/api/table-column-defaults/${encodeURIComponent(tableId)}`, {
    method: 'PUT',
    body: JSON.stringify({ prefs }),
  })
}
