import { useMemo, useState } from 'react'
import { TableColumnHead } from '../shared/ListTableChrome'
import '../shared/ListTableChrome.css'
import { useTableColumnPrefs } from '../../hooks/useTableColumnPrefs'
import ReliabilityTableToolbar, { ReliabilityColumnPicker } from './ReliabilityTableToolbar'

const CALC_COLUMNS = [
  { id: 'metric', label: 'Metric', defaultVisible: true },
  { id: 'formula', label: 'Formula', defaultVisible: true },
  { id: 'substitution', label: 'Example Substitution', defaultVisible: true },
  { id: 'result', label: 'Example Result', defaultVisible: true },
]

function FormulaTable({
  title,
  rows,
  prefsKey,
  exportBusy,
  onExportExcel,
  canManage,
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
  } = useTableColumnPrefs(prefsKey, CALC_COLUMNS)

  const visibleColumns = useMemo(() => {
    const byId = new Map(CALC_COLUMNS.map((col) => [col.id, col]))
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

  return (
    <div className="reliability-calculator__table-block reliability-calculator__calc-block">
      <h2 className="reliability-calculator__section-title">{title}</h2>

      <ReliabilityTableToolbar
        exportBusy={exportBusy}
        onExportExcel={onExportExcel}
        canManage={canManage}
        onAddManualHours={onAddManualHours}
        columnPicker={(
          <ReliabilityColumnPicker
            columnDefs={CALC_COLUMNS}
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
          {items.length === 0 ? 'No calculation rows available.' : 'No rows match the column filters.'}
        </div>
      ) : (
        <div className="company-table-wrap">
          <div className="company-table-scroll">
            <table className="company-table master-table reliability-calc-table">
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
                  <tr key={row.metric}>
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
    </div>
  )
}

export default function CalculationsPanel({
  calculationExamples,
  exportBusy = false,
  onExportExcel,
  canManage = false,
  onAddManualHours,
}) {
  const examples = calculationExamples || {}
  const t = examples.evaluationHours ?? 100
  const equipmentTitle = examples.equipmentLabel
    ? `Equipment Example (${examples.equipmentLabel})`
    : 'Equipment Example'

  const sharedToolbar = {
    exportBusy,
    onExportExcel,
    canManage,
    onAddManualHours,
  }

  return (
    <div className="reliability-calculator__calculations">
      <p className="reliability-calculator__hint">
        Every metric shows its general formula, numerical substitution and result.
        {' '}
        Reliability evaluation period
        {' '}
        <strong>
          t =
          {t}
          {' '}
          operating hours
        </strong>
        .
      </p>
      <FormulaTable
        title={equipmentTitle}
        rows={examples.equipmentExample}
        prefsKey="reliability-calc-equipment"
        {...sharedToolbar}
      />
      <FormulaTable
        title="Overall Plant Equipment Calculations"
        rows={examples.plantExample}
        prefsKey="reliability-calc-plant"
        {...sharedToolbar}
      />
    </div>
  )
}
