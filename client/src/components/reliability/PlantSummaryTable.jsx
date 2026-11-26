import { useMemo, useState } from 'react'
import { TableColumnHead } from '../shared/ListTableChrome'
import '../shared/ListTableChrome.css'
import { useTableColumnPrefs } from '../../hooks/useTableColumnPrefs'
import {
  formatHoursCell,
  formatNumberCell,
  formatPctCell,
  formatRateCell,
} from './reliabilityFormat'
import ReliabilityTableToolbar, { ReliabilityColumnPicker } from './ReliabilityTableToolbar'

const PLANT_SUMMARY_COLUMNS = [
  { id: 'parameter', label: 'Parameter', defaultVisible: true },
  { id: 'result', label: 'Result', defaultVisible: true },
]

function buildRows(plantSummary, evaluationHours) {
  if (!plantSummary) return []
  const t = evaluationHours ?? plantSummary.evaluationHours ?? 100
  return [
    { parameter: 'Equipment Included', result: formatNumberCell(plantSummary.equipmentIncluded) },
    { parameter: 'Total Running Hours', result: formatHoursCell(plantSummary.totalRunningHours) },
    { parameter: 'Breakdown Events', result: formatNumberCell(plantSummary.breakdownEvents) },
    { parameter: 'Completed Repairs', result: formatNumberCell(plantSummary.completedRepairs) },
    { parameter: 'Calendar Breakdown Hours', result: formatHoursCell(plantSummary.calendarBreakdownHours) },
    { parameter: 'Operational Breakdown Hours', result: formatHoursCell(plantSummary.operationalBreakdownHours) },
    { parameter: 'Verified Active Repair Hours', result: formatHoursCell(plantSummary.verifiedActiveRepairHours) },
    { parameter: 'Other Elapsed Hours', result: formatHoursCell(plantSummary.otherElapsedHours) },
    { parameter: 'Overall Plant Equipment MTBF', result: formatHoursCell(plantSummary.mtbf) },
    { parameter: 'Overall Plant Equipment MTTR', result: formatHoursCell(plantSummary.mttr) },
    { parameter: 'Overall Plant Equipment Failure Rate', result: formatRateCell(plantSummary.failureRate) },
    { parameter: `Overall Plant Equipment Reliability (${t} h)`, result: formatPctCell(plantSummary.reliabilityPct) },
    { parameter: 'Overall Inherent Availability', result: formatPctCell(plantSummary.inherentAvailabilityPct) },
    { parameter: 'Overall Operational Availability', result: formatPctCell(plantSummary.operationalAvailabilityPct) },
  ]
}

export default function PlantSummaryTable({
  plantSummary,
  evaluationHours,
  terminology,
  exportBusy = false,
  onExportExcel,
  canManage = false,
  onAddManualHours,
}) {
  const items = useMemo(
    () => buildRows(plantSummary, evaluationHours),
    [plantSummary, evaluationHours],
  )
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
  } = useTableColumnPrefs('reliability-plant-summary', PLANT_SUMMARY_COLUMNS)

  const visibleColumns = useMemo(() => {
    const byId = new Map(PLANT_SUMMARY_COLUMNS.map((col) => [col.id, col]))
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
        const hay = String(row[columnId] || '').toLowerCase()
        return hay.includes(needle)
      }))
    }
    if (!sort?.id) return next
    const dir = sort.dir === 'desc' ? -1 : 1
    return [...next].sort((left, right) => {
      const a = String(left[sort.id] || '').toLowerCase()
      const b = String(right[sort.id] || '').toLowerCase()
      return a.localeCompare(b) * dir
    })
  }, [items, columnFilters, sort])

  if (!plantSummary) {
    return <div className="company-empty">Select filters to load the plant summary.</div>
  }

  return (
    <div className="reliability-calculator__table-block">
      <h2 className="reliability-calculator__section-title">
        Overall Plant Equipment Reliability (Plant Summary)
      </h2>

      <ReliabilityTableToolbar
        exportBusy={exportBusy}
        onExportExcel={onExportExcel}
        canManage={canManage}
        onAddManualHours={onAddManualHours}
        columnPicker={(
          <ReliabilityColumnPicker
            columnDefs={PLANT_SUMMARY_COLUMNS}
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
        <div className="company-empty">No rows match the column filters.</div>
      ) : (
        <div className="company-table-wrap">
          <div className="company-table-scroll">
            <table className="company-table master-table reliability-summary-table">
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
                  <tr key={row.parameter}>
                    {visibleColumns.map((col) => (
                      <td key={col.id}>{row[col.id]}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {terminology ? (
        <p className="reliability-calculator__note">{terminology}</p>
      ) : null}
    </div>
  )
}
