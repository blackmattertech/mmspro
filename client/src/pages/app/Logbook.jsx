import { useCallback, useEffect, useState } from 'react'
import { usePermissions } from '../../hooks/usePermissions'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import { deleteMeterReading, getLogbook, getMeterReadings } from '../../lib/api-logbook'
import { unwrapList } from '../../lib/listResponse'
import { formatMeterDate, formatMeterLogger, formatMeterTime, formatMeterValue } from '../../lib/meterReading'
import { stopTableRowClick, tableRowClickProps } from '../../lib/clickableTableRow'
import TablePagination from '../../components/shared/TablePagination'
import TableEmptyRow from '../../components/shared/TableEmptyRow'
import TableFilterToolbar from '../../components/shared/TableFilterToolbar'
import { useTablePagination } from '../../hooks/useTablePagination'
import MeterReadingModal from '../../components/logbook/MeterReadingModal'
import { useBackdropClose } from '../../hooks/useBackdropClose'
import '../../components/shared/TableFilterToolbar.css'
import '../../components/company/CompanyShared.css'

function HistoryModal({ equipmentId, canCreate, canDelete, onClose, onChanged }) {
  const handleBackdropClick = useBackdropClose(onClose)
  const [payload, setPayload] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [adding, setAdding] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    return getMeterReadings(equipmentId)
      .then((data) => setPayload(data))
      .catch((err) => setError(err.message || 'Could not load readings'))
      .finally(() => setLoading(false))
  }, [equipmentId])

  useEffect(() => {
    load()
  }, [load])

  const equipment = payload?.equipment
  const readings = payload?.readings || []

  const handleDelete = async (row) => {
    if (!window.confirm('Delete this meter reading?')) return
    try {
      await deleteMeterReading(row.id)
      await load()
      onChanged?.()
    } catch (err) {
      setError(err.message || 'Could not delete this reading')
    }
  }

  return (
    <div className="company-modal-overlay" onMouseDown={handleBackdropClick} role="presentation">
      <div
        className="company-modal company-modal--wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="logbook-history-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="company-modal__header">
          <div>
            <h2 id="logbook-history-title">{equipment?.name || 'Meter readings'}</h2>
            <p className="company-modal__hint">{equipment?.code || 'Reading history'}</p>
          </div>
          <button type="button" className="company-modal__close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="company-modal__form">
          {canCreate && equipment && (
            <div className="company-modal__actions">
              <button type="button" className="company-btn company-btn--primary" onClick={() => setAdding(true)}>
                Add reading
              </button>
            </div>
          )}
          {error && <div className="company-alert" role="alert">{error}</div>}
          {loading ? (
            <p className="company-empty">Loading readings…</p>
          ) : (
            <div className="company-table-wrap">
              <div className="company-table-scroll">
                <table className="company-table">
                  <thead>
                    <tr>
                      <th>Reading</th>
                      <th>Date</th>
                      <th>Time</th>
                      <th>Logged by</th>
                      {canDelete && <th>Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {readings.length === 0 ? (
                      <TableEmptyRow colSpan={canDelete ? 5 : 4}>
                        No meter readings yet.
                      </TableEmptyRow>
                    ) : readings.map((row) => (
                      <tr key={row.id}>
                        <td>{formatMeterValue(row.reading)}</td>
                        <td>{formatMeterDate(row.reading_at)}</td>
                        <td>{formatMeterTime(row.reading_at)}</td>
                        <td>{formatMeterLogger(row) || '—'}</td>
                        {canDelete && (
                          <td>
                            <button
                              type="button"
                              className="company-btn company-btn--ghost company-btn--compact"
                              onClick={() => handleDelete(row)}
                            >
                              Delete
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
        {adding && equipment && (
          <MeterReadingModal
            nested
            equipment={equipment}
            lastReading={equipment.last_reading}
            onClose={() => setAdding(false)}
            onSaved={async () => {
              setAdding(false)
              await load()
              onChanged?.()
            }}
          />
        )}
      </div>
    </div>
  )
}

export default function Logbook() {
  const { loading: permLoading, canCreate, canDelete } = usePermissions()
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search.trim())
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [historyId, setHistoryId] = useState(null)
  const [adding, setAdding] = useState(null)
  const pagination = useTablePagination(total, { resetKey: debouncedSearch })

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    return getLogbook({
      search: debouncedSearch,
      limit: pagination.pageSize,
      offset: pagination.offset,
    })
      .then((data) => {
        const page = unwrapList(data)
        setItems(page.items)
        setTotal(page.total)
      })
      .catch((err) => setError(err.message || 'Could not load meter readings'))
      .finally(() => setLoading(false))
  }, [debouncedSearch, pagination.pageSize, pagination.offset])

  useEffect(() => {
    load()
  }, [load, reloadKey])

  const refresh = () => setReloadKey((value) => value + 1)

  if (permLoading) {
    return (
      <div className="company-page">
        <div className="company-loading">Loading...</div>
      </div>
    )
  }

  return (
    <div className="company-page">
      <header className="company-page__header">
        <h1 className="company-page__title">Meter reading</h1>
        <p className="company-page__subtitle">
          Log meter readings for assets that require them. Scan an asset QR code, then choose Add reading.
        </p>
      </header>
      <div className="company-page__content">
        <div className="company-panel">
          <div className="company-panel__toolbar company-panel__toolbar--filters">
            <TableFilterToolbar
              search={{
                value: search,
                onChange: setSearch,
                placeholder: 'Search assets...',
                ariaLabel: 'Search meter readings',
              }}
            />
          </div>
          {error && <div className="company-alert" role="alert">{error}</div>}
          {loading ? (
            <div className="company-loading">Loading meter readings…</div>
          ) : (
            <>
              <div className="company-table-wrap">
                <div className="company-table-scroll">
                  <table className="company-table master-table">
                    <thead>
                      <tr>
                        <th>Asset</th>
                        <th>Code</th>
                        <th>Location</th>
                        <th>Department</th>
                        <th>Last reading</th>
                        <th>Date</th>
                        <th>Time</th>
                        <th>Logged by</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.length === 0 ? (
                        <TableEmptyRow colSpan={9}>
                          {debouncedSearch
                            ? 'No assets match your search.'
                            : 'No assets require a meter reading yet. Turn on Reading required on an asset record to log it here.'}
                        </TableEmptyRow>
                      ) : items.map((row) => (
                        <tr
                          key={row.id}
                          {...tableRowClickProps({
                            onOpen: () => setHistoryId(row.id),
                            label: `View readings for ${row.name}`,
                          })}
                        >
                          <td><span className="company-table__name">{row.name}</span></td>
                          <td><code className="company-code">{row.code || '—'}</code></td>
                          <td>{row.location_name || '—'}</td>
                          <td>{row.department_name || '—'}</td>
                          <td>{formatMeterValue(row.last_reading)}</td>
                          <td>{formatMeterDate(row.last_reading_at)}</td>
                          <td>{row.last_reading_at ? formatMeterTime(row.last_reading_at) : '—'}</td>
                          <td>{formatMeterLogger(row) || '—'}</td>
                          <td onClick={stopTableRowClick}>
                            <div className="company-table__actions">
                              {canCreate('logbook') && (
                                <button
                                  type="button"
                                  className="company-btn company-btn--primary company-btn--compact"
                                  onClick={() => setAdding(row)}
                                >
                                  Add reading
                                </button>
                              )}
                              <button
                                type="button"
                                className="company-btn company-btn--ghost company-btn--compact"
                                onClick={() => setHistoryId(row.id)}
                              >
                                History
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <TablePagination
                page={pagination.page}
                totalPages={pagination.totalPages}
                pageSize={pagination.pageSize}
                pageSizeOptions={pagination.pageSizeOptions}
                totalCount={total}
                rangeStart={pagination.rangeStart}
                rangeEnd={pagination.rangeEnd}
                onPageChange={pagination.setPage}
                onPageSizeChange={pagination.setPageSize}
              />
            </>
          )}
        </div>
      </div>
      {historyId && (
        <HistoryModal
          equipmentId={historyId}
          canCreate={canCreate('logbook')}
          canDelete={canDelete('logbook')}
          onClose={() => setHistoryId(null)}
          onChanged={refresh}
        />
      )}
      {adding && (
        <MeterReadingModal
          equipment={adding}
          lastReading={adding.last_reading}
          onClose={() => setAdding(null)}
          onSaved={() => {
            setAdding(null)
            refresh()
          }}
        />
      )}
    </div>
  )
}
