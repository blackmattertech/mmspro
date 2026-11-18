import { useEffect, useState } from 'react'
import { useBackdropClose } from '../../hooks/useBackdropClose'
import PageBack from '../shared/PageBack'
import {
  deleteRecordTemplate,
  listRecordTemplates,
  renameRecordTemplate,
} from '../../lib/api-record-templates'
import { recordTemplateModule } from '../../lib/recordTemplates'
import '../company/CompanyShared.css'

export default function TemplatePickerModal({
  moduleKey,
  onClose,
  onSelect,
}) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState('')
  const handleBackdropClick = useBackdropClose(onClose)
  const moduleLabel = recordTemplateModule(moduleKey)?.label || 'Module'

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const data = await listRecordTemplates(moduleKey)
      setRows(data.templates || [])
    } catch (err) {
      setError(err.message || 'Could not load templates')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [moduleKey])

  const rename = async (row) => {
    const next = window.prompt('Rename template', row.name)
    if (next == null || next.trim() === row.name) return
    setBusyId(row.id)
    try {
      await renameRecordTemplate(row.id, next)
      await load()
    } catch (err) {
      window.alert(err.message || 'Could not rename template')
    } finally {
      setBusyId('')
    }
  }

  const remove = async (row) => {
    if (!window.confirm(`Delete template “${row.name}”?`)) return
    setBusyId(row.id)
    try {
      await deleteRecordTemplate(row.id)
      await load()
    } catch (err) {
      window.alert(err.message || 'Could not delete template')
    } finally {
      setBusyId('')
    }
  }

  return (
    <div className="company-modal-overlay" onMouseDown={handleBackdropClick} role="presentation">
      <div className="company-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-labelledby="template-picker-title">
        <div className="company-modal__header">
          <div className="modal__header-main">
            <PageBack onClick={onClose} className="page-back--header" label="Back" />
            <h2 id="template-picker-title">{moduleLabel} templates</h2>
          </div>
          <button type="button" className="company-modal__close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="company-modal__form">
          {error ? <div className="company-alert" role="alert">{error}</div> : null}
          {loading ? <p className="company-form__hint">Loading templates…</p> : null}
          {!loading && !rows.length ? (
            <p className="company-form__hint">
              No templates yet. Open a record and use Save as template.
            </p>
          ) : null}
          <div className="company-form__grid" style={{ gap: 10 }}>
            {rows.map((row) => (
              <div
                key={row.id}
                className="company-form__field company-form__field--full"
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr auto',
                  gap: 10,
                  alignItems: 'center',
                  padding: '10px 12px',
                  border: '1px solid var(--color-light-gray-1)',
                  borderRadius: 12,
                }}
              >
                <div>
                  <strong>{row.name}</strong>
                  <div className="company-form__hint" style={{ margin: 0 }}>
                    {row.attachment_count || 0} attachment{(row.attachment_count || 0) === 1 ? '' : 's'}
                    {row.updated_at ? ` · Updated ${new Date(row.updated_at).toLocaleString()}` : ''}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    className="company-btn company-btn--primary company-btn--compact"
                    disabled={Boolean(busyId)}
                    onClick={() => onSelect?.(row)}
                  >
                    Use
                  </button>
                  <button
                    type="button"
                    className="company-btn company-btn--secondary company-btn--compact"
                    disabled={busyId === row.id}
                    onClick={() => rename(row)}
                  >
                    Rename
                  </button>
                  <button
                    type="button"
                    className="company-btn company-btn--secondary company-btn--compact"
                    disabled={busyId === row.id}
                    onClick={() => remove(row)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
