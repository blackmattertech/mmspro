import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useBackdropClose } from '../../hooks/useBackdropClose'
import { useOrg } from '../../hooks/useOrg'
import { CHECKLIST_FORMS } from '../../lib/checklistForms'
import { isProductModuleEnabled } from '../../lib/orgModules'
import { getChecklistSettings, saveChecklistSettings } from '../../lib/api-pm'
import '../company/CompanyShared.css'

export default function ChecklistModuleSettingsModal({ onClose, onSaved }) {
  const { org } = useOrg()
  const [selected, setSelected] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const availableForms = useMemo(() => (
    CHECKLIST_FORMS.filter((item) => isProductModuleEnabled(org?.disabled_modules, item.moduleId))
  ), [org?.disabled_modules])

  const onBackdrop = useBackdropClose(onClose)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const data = await getChecklistSettings()
        if (cancelled) return
        const ids = Array.isArray(data?.form_ids) ? data.form_ids : []
        const allowed = new Set(availableForms.map((item) => item.formId))
        const next = ids.filter((id) => allowed.has(id))
        setSelected(next.length ? next : availableForms.map((item) => item.formId))
      } catch (err) {
        if (!cancelled) {
          setError(err.message || 'Could not load checklist settings')
          setSelected(availableForms.map((item) => item.formId))
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [availableForms])

  const toggle = (formId) => {
    setSelected((current) => (
      current.includes(formId)
        ? current.filter((id) => id !== formId)
        : [...current, formId]
    ))
    setError(null)
  }

  const handleSave = async (event) => {
    event.preventDefault()
    if (!selected.length) {
      setError('Select at least one module.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const data = await saveChecklistSettings(selected)
      onSaved?.(data)
      onClose?.()
    } catch (err) {
      setError(err.message || 'Could not save checklist settings')
    } finally {
      setSaving(false)
    }
  }

  return createPortal(
    <div
      className="company-modal-overlay company-modal-overlay--popup"
      role="presentation"
      onMouseDown={onBackdrop}
    >
      <div
        className="company-modal company-modal--popup"
        role="dialog"
        aria-labelledby="checklist-module-settings-title"
      >
        <div className="company-modal__header">
          <h2 id="checklist-module-settings-title">Checklist modules</h2>
          <button type="button" className="company-modal__close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <form className="company-modal__form" onSubmit={handleSave}>
          <p className="company-modal__hint">
            Choose which modules can enable and select a checklist on their forms.
          </p>
          {error ? <p className="company-error">{error}</p> : null}
          {loading ? (
            <div className="company-loading">Loading…</div>
          ) : (
            <fieldset className="checklist-module-settings">
              <legend className="company-form__label">Modules</legend>
              {availableForms.map((item) => (
                <label key={item.formId} className="checklist-module-settings__option">
                  <input
                    type="checkbox"
                    checked={selected.includes(item.formId)}
                    onChange={() => toggle(item.formId)}
                    disabled={saving}
                  />
                  <span>{item.label}</span>
                </label>
              ))}
              {!availableForms.length ? (
                <p className="company-form__hint">No checklist-capable modules are enabled for this company.</p>
              ) : null}
            </fieldset>
          )}
          <div className="company-modal__actions">
            <button type="button" className="company-btn company-btn--secondary" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button
              type="submit"
              className="company-btn company-btn--primary"
              disabled={saving || loading || !selected.length}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  )
}
