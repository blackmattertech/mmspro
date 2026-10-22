import { useEffect, useState } from 'react'
import FilterableSelect from '../ui/FilterableSelect'
import { getChecklistTemplates } from '../../lib/api-pm'
import '../workrequests/WorkRequests.css'

export default function ChecklistOptIn({
  formId,
  moduleKey,
  enabled,
  onEnabledChange,
  templateId,
  onTemplateChange,
  disabled = false,
  embedded = false,
}) {
  const [on, setOn] = useState(Boolean(enabled || templateId))
  const [options, setOptions] = useState([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (enabled || templateId) setOn(true)
  }, [enabled, templateId])

  useEffect(() => {
    let cancelled = false
    setLoaded(false)
    getChecklistTemplates({ formId, moduleKey: formId ? undefined : moduleKey })
      .then((rows) => {
        if (!cancelled) setOptions(Array.isArray(rows) ? rows : [])
      })
      .catch(() => {
        if (!cancelled) setOptions([])
      })
      .finally(() => {
        if (!cancelled) setLoaded(true)
      })
    return () => { cancelled = true }
  }, [formId, moduleKey])

  const visible = options.filter((row) => row.is_active !== false || row.id === templateId)
  if (!loaded || (!visible.length && !templateId)) return null

  const openPicker = () => {
    if (disabled) return
    setOn(true)
    onEnabledChange(true)
  }

  const clearChecklist = () => {
    setOn(false)
    onEnabledChange(false)
    onTemplateChange('')
  }

  const body = (
    <div className="checklist-opt-in__body">
      <div className="checklist-opt-in__row">
        <span className="company-form__label">Checklist</span>
        <button
          type="button"
          className="checklist-opt-in__add"
          onClick={on ? clearChecklist : openPicker}
          disabled={disabled}
          aria-label={on ? 'Remove checklist' : 'Add checklist'}
          title={on ? 'Remove checklist' : 'Add checklist'}
        >
          {on ? '−' : '+'}
        </button>
      </div>
      {on && (
        <label className="company-form__field checklist-opt-in__picker">
          <span className="company-form__label">Checklist template</span>
          <FilterableSelect
            value={templateId}
            onChange={onTemplateChange}
            options={visible}
            getOptionValue={(row) => row.id}
            getOptionLabel={(row) => `${row.name}${row.version ? ` (v${row.version})` : ''}`}
            placeholder="Select checklist"
            disabled={disabled}
            className="company-form__input--select"
          />
        </label>
      )}
    </div>
  )

  if (embedded) return body

  return (
    <section className="wr-form-section checklist-opt-in">
      <header className="wr-form-section__head">
        <h3 className="wr-form-section__title">Checklist</h3>
      </header>
      {body}
    </section>
  )
}
