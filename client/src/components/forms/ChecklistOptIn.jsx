import { useEffect, useState } from 'react'
import FilterableSelect from '../ui/FilterableSelect'
import GooToggle from '../ui/GooToggle'
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
  required = false,
}) {
  const [on, setOn] = useState(Boolean(required || enabled || templateId))
  const [options, setOptions] = useState([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (required || enabled || templateId) setOn(true)
  }, [required, enabled, templateId])

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
  if (!loaded) return null
  if (!required && !visible.length && !templateId) return null

  const setEnabled = (next) => {
    if (disabled || required) return
    setOn(next)
    onEnabledChange(next)
    if (!next) onTemplateChange('')
  }

  const body = (
    <div className="checklist-opt-in__body">
      <div className="checklist-opt-in__row">
        <span className="company-form__label">
          {required ? 'Checklist *' : 'Enable checklist'}
        </span>
        {!required ? (
          <GooToggle
            checked={on}
            onChange={setEnabled}
            disabled={disabled}
            aria-label={on ? 'Disable checklist' : 'Enable checklist'}
          />
        ) : null}
      </div>
      {required && !visible.length ? (
        <p className="company-form__hint">No checklists are available for this form yet.</p>
      ) : null}
      {(on || required) && visible.length > 0 ? (
        <label className="company-form__field checklist-opt-in__picker">
          <span className="company-form__label">Checklist template{required ? ' *' : ''}</span>
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
      ) : null}
      {(on || required) && visible.length > 0 && !templateId ? (
        <p className="company-form__hint">Select the checklist required for this record.</p>
      ) : null}
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
