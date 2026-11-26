import { useMemo, useState } from 'react'
import { TableColumnHead } from '../shared/ListTableChrome'
import '../shared/ListTableChrome.css'
import { useTableColumnPrefs } from '../../hooks/useTableColumnPrefs'
import {
  formatNumberCell,
  formatPctCell,
  formatRateCell,
} from './reliabilityFormat'
import { EQUIPMENT_DETAILS_COLUMNS } from './equipmentDetailsColumns'
import ReliabilityTableToolbar, { ReliabilityColumnPicker } from './ReliabilityTableToolbar'

function cellValue(row, columnId) {
  switch (columnId) {
    case 'equipmentCode':
      return row.equipmentCode || '—'
    case 'equipmentName':
      return row.equipmentName || '—'
    case 'plantName':
      return row.plantName || '—'
    case 'departmentName':
      return row.departmentName || '—'
    case 'hoursMethod':
      return row.hoursMethod || 'N/A'
    case 'runningHours':
      return row.runningHours == null ? 'N/A' : formatNumberCell(row.runningHours)
    case 'failures':
      return formatNumberCell(row.failures)
    case 'calendarBdHours':
      return formatNumberCell(row.calendarBdHours)
    case 'operationalBdHours':
      return formatNumberCell(row.operationalBdHours)
    case 'repairHours':
      return formatNumberCell(row.repairHours)
    case 'otherHours':
      return formatNumberCell(row.otherHours)
    case 'mtbf':
      return row.mtbf == null ? 'N/A' : formatNumberCell(row.mtbf)
    case 'mttr':
      return row.mttr == null ? 'N/A' : formatNumberCell(row.mttr)
    case 'failureRate':
      return formatRateCell(row.failureRate).replace(' /h', '')
    case 'reliabilityPct':
      return formatPctCell(row.reliabilityPct)
    case 'inherentPct':
      return formatPctCell(row.inherentPct)
    case 'operationalPct':
      return formatPctCell(row.operationalPct)
    default:
      return '—'
  }
}

function sortValue(row, columnId) {
  const raw = row?.[columnId]
  if (raw == null || raw === '') return null
  if (typeof raw === 'number') return raw
  const asNum = Number(raw)
  if (Number.isFinite(asNum) && String(raw).trim() !== '') return asNum
  return String(raw).toLowerCase()
}

export default function EquipmentDetailsTable({
  rows,
  exportBusy = false,
  onExportExcel,
  canManage = false,
  onAddManualHours,
}) {
  const items = Array.isArray(rows) ? rows : []
  const [columnFilters, setColumnFilters] = useState({})
  const [sort, setSort] = useState(null)
  const {
    visibleColumnIds,
    columnOrder,
    toggleColumn,
    resetColumns,
    reorderColumns,
    moveColumn,
    saveColumns,
    makeDefaultColumns,
    makingDefault,
  } = useTableColumnPrefs('reliability-equipment-details', EQUIPMENT_DETAILS_COLUMNS)

  const visibleColumns = useMemo(() => {
    const byId = new Map(EQUIPMENT_DETAILS_COLUMNS.map((col) => [col.id, col]))
    return (visibleColumnIds.length ? visibleColumnIds : columnOrder)
      .map((id) => byId.get(id))
      .filter(Boolean)
  }, [visibleColumnIds, columnOrder])

  const filteredSorted = useMemo(() => {
    let next = items
    const activeFilters = Object.entries(columnFilters).filter(([, value]) => String(value || '').trim())
    if (activeFilters.length) {
      next = next.filter((row) => activeFilters.every(([columnId, value]) => {
        const needle = String(value).trim().toLowerCase()
        const hay = String(cellValue(row, columnId) || '').toLowerCase()
        return hay.includes(needle)
      }))
    }
    if (!sort?.id) return next
    const dir = sort.dir === 'desc' ? -1 : 1
    return [...next].sort((left, right) => {
      const a = sortValue(left, sort.id)
      const b = sortValue(right, sort.id)
      if (a == null && b == null) return 0
      if (a == null) return 1
      if (b == null) return -1
      if (typeof a === 'number' && typeof b === 'number') return (a - b) * dir
      return String(a).localeCompare(String(b)) * dir
    })
  }, [items, columnFilters, sort])

  return (
    <div className="reliability-calculator__table-block">
      <h2 className="reliability-calculator__section-title">
        Individual Equipment Reliability Details
      </h2>

      <ReliabilityTableToolbar
        exportBusy={exportBusy}
        onExportExcel={onExportExcel}
        canManage={canManage}
        onAddManualHours={onAddManualHours}
        columnPicker={(
          <ReliabilityColumnPicker
            columnDefs={EQUIPMENT_DETAILS_COLUMNS}
            visibleColumnIds={visibleColumnIds}
            columnOrder={columnOrder}
            onToggle={toggleColumn}
            onReset={resetColumns}
            onReorder={reorderColumns}
            onMove={moveColumn}
            onSave={saveColumns}
            onMakeDefault={makeDefaultColumns}
            makingDefault={makingDefault}
          />
        )}
      />

      {filteredSorted.length === 0 ? (
        <div className="company-empty">
          {items.length === 0 ? 'No equipment matches these filters.' : 'No rows match the column filters.'}
        </div>
      ) : (
        <div className="company-table-wrap">
          <div className="company-table-scroll">
            <table className="company-table master-table reliability-details-table">
              <thead>
                <tr>
                  {visibleColumns.map((col) => (
                    <TableColumnHead
                      key={col.id}
                      columnId={col.id}
                      label={col.label}
                      sort={sort}
                      onSort={setSort}
                      filterValue={columnFilters[col.id] || ''}
                      onFilter={(columnId, value) => {
                        setColumnFilters((prev) => {
                          const next = { ...prev }
                          const trimmed = String(value || '').trim()
                          if (!trimmed) delete next[columnId]
                          else next[columnId] = value
                          return next
                        })
                      }}
                    />
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredSorted.map((row) => (
                  <tr key={row.equipmentId || `${row.equipmentCode}-${row.equipmentName}`}>
                    {visibleColumns.map((col) => (
                      <td key={col.id}>{cellValue(row, col.id)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <p className="reliability-calculator__note">
        Equipment without failures: MTBF and estimated Reliability are N/A.
      </p>
    </div>
  )
}
