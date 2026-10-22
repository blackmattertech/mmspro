import { formatPickerValue } from '../../lib/pickerFields'

export function unhandledColumnIds(visibleColumnIds = [], handledIds) {
  const handled = handledIds instanceof Set ? handledIds : new Set(handledIds || [])
  return visibleColumnIds.filter((id) => !handled.has(id))
}

export function DynamicPickerHeaders({ visibleColumnIds, columnDefs, handledIds }) {
  const ids = unhandledColumnIds(visibleColumnIds, handledIds)
  return ids.map((id) => {
    const col = columnDefs.find((item) => item.id === id)
    return <th key={id}>{col?.label || id}</th>
  })
}

export function DynamicPickerCells({ visibleColumnIds, columnDefs, row, handledIds }) {
  const ids = unhandledColumnIds(visibleColumnIds, handledIds)
  return ids.map((id) => {
    const col = columnDefs.find((item) => item.id === id) || { id }
    return <td key={id}>{formatPickerValue(row, col)}</td>
  })
}
