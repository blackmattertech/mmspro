import { ExportCsvButton } from '../shared/ListTableChrome'
import TableColumnPicker from '../shared/TableColumnPicker'
import '../shared/TableColumnPicker.css'

export default function ReliabilityTableToolbar({
  exportBusy = false,
  onExportExcel,
  canManage = false,
  onAddManualHours,
  columnPicker = null,
}) {
  return (
    <div className="reliability-calculator__table-toolbar company-panel__toolbar">
      <div className="reliability-calculator__table-toolbar-actions">
        {onExportExcel ? (
          <ExportCsvButton
            busy={exportBusy}
            label="Export"
            onClick={onExportExcel}
          />
        ) : null}
        {canManage && onAddManualHours ? (
          <button
            type="button"
            className="company-btn company-btn--secondary"
            onClick={onAddManualHours}
          >
            Add manual hours
          </button>
        ) : null}
        {columnPicker}
      </div>
    </div>
  )
}

export function ReliabilityColumnPicker(props) {
  return <TableColumnPicker {...props} />
}
