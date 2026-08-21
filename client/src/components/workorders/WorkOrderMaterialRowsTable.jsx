import TrashIcon from '../ui/TrashIcon'

function emptyRow() {
  return { code: '', description: '', uom: '', qty: '' }
}

function PlusIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 5v14M5 12h14"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function normalizeMaterialRows(rows) {
  const list = Array.isArray(rows) && rows.length ? rows : [emptyRow()]
  return list.map((row) => ({
    code: String(row?.code || ''),
    description: String(row?.description || ''),
    uom: String(row?.uom || ''),
    qty: row?.qty == null ? '' : String(row.qty),
  }))
}

export default function WorkOrderMaterialRowsTable({
  rows,
  onChange,
  readOnly = false,
  disabled = false,
}) {
  const list = normalizeMaterialRows(rows)

  const updateRow = (index, key, value) => {
    const next = list.map((row, i) => (i === index ? { ...row, [key]: value } : row))
    onChange?.(next)
  }

  const addRow = () => onChange?.([...list, emptyRow()])

  const removeRow = (index) => {
    if (list.length <= 1) return
    onChange?.(list.filter((_, i) => i !== index))
  }

  return (
    <div className="wo-material-table-wrap">
      <table className="wo-material-table">
        <thead>
          <tr>
            <th>S.No</th>
            <th>Material code</th>
            <th>Material description</th>
            <th>UOM</th>
            <th>Qty</th>
            {!readOnly && <th aria-label="Actions" />}
          </tr>
        </thead>
        <tbody>
          {list.map((row, index) => (
            <tr key={index}>
              <td className="wo-material-table__sno">{index + 1}</td>
              <td>
                {readOnly ? (
                  row.code || '—'
                ) : (
                  <input
                    className="company-form__input"
                    value={row.code}
                    disabled={disabled}
                    onChange={(e) => updateRow(index, 'code', e.target.value)}
                    aria-label={`Material code ${index + 1}`}
                  />
                )}
              </td>
              <td>
                {readOnly ? (
                  row.description || '—'
                ) : (
                  <input
                    className="company-form__input"
                    value={row.description}
                    disabled={disabled}
                    onChange={(e) => updateRow(index, 'description', e.target.value)}
                    aria-label={`Material description ${index + 1}`}
                  />
                )}
              </td>
              <td>
                {readOnly ? (
                  row.uom || '—'
                ) : (
                  <input
                    className="company-form__input"
                    value={row.uom}
                    disabled={disabled}
                    onChange={(e) => updateRow(index, 'uom', e.target.value)}
                    aria-label={`UOM ${index + 1}`}
                  />
                )}
              </td>
              <td>
                {readOnly ? (
                  row.qty || '—'
                ) : (
                  <input
                    type="number"
                    min="0"
                    step="any"
                    className="company-form__input"
                    value={row.qty}
                    disabled={disabled}
                    onChange={(e) => updateRow(index, 'qty', e.target.value)}
                    aria-label={`Qty ${index + 1}`}
                  />
                )}
              </td>
              {!readOnly && (
                <td className="wo-material-table__actions">
                  {list.length > 1 && (
                    <button
                      type="button"
                      className="wo-material-table__icon-btn wo-material-table__icon-btn--remove"
                      onClick={() => removeRow(index)}
                      disabled={disabled}
                      aria-label={`Remove material row ${index + 1}`}
                      title="Remove row"
                    >
                      <TrashIcon size={14} />
                    </button>
                  )}
                  {index === list.length - 1 && (
                    <button
                      type="button"
                      className="wo-material-table__icon-btn wo-material-table__icon-btn--add"
                      onClick={addRow}
                      disabled={disabled}
                      aria-label="Add material row"
                      title="Add row"
                    >
                      <PlusIcon size={16} />
                    </button>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
