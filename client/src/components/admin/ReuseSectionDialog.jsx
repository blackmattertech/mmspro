import { useMemo, useState } from 'react'

export default function ReuseSectionDialog({
  sectionLabel,
  choices,
  selectedIds,
  saving,
  onClose,
  onApply,
}) {
  const [picked, setPicked] = useState(() => new Set(selectedIds))
  const groups = useMemo(() => {
    const map = new Map()
    for (const choice of choices) {
      const key = choice.moduleLabel || 'Forms'
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(choice)
    }
    return [...map.entries()]
  }, [choices])

  const toggle = (formId) => {
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(formId)) next.delete(formId)
      else next.add(formId)
      return next
    })
  }

  return (
    <div className="form-builder-reuse" role="presentation" onClick={onClose}>
      <div
        className="form-builder-reuse__dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reuse-section-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="reuse-section-title">Reuse “{sectionLabel}”</h2>
        <p>
          Add this same section to other forms. Its fields, groups, and who fills it in stay in sync:
          a change on any of those forms updates the others when you save.
        </p>
        {!groups.length ? (
          <p className="form-builder-reuse__empty">No other forms are available.</p>
        ) : (
          <div className="form-builder-reuse__groups">
            {groups.map(([label, forms]) => (
              <fieldset key={label}>
                <legend>{label}</legend>
                {forms.map((form) => (
                  <label key={form.formId}>
                    <input
                      type="checkbox"
                      checked={picked.has(form.formId)}
                      onChange={() => toggle(form.formId)}
                    />
                    <span>{form.label}</span>
                  </label>
                ))}
              </fieldset>
            ))}
          </div>
        )}
        <p className="form-builder-reuse__note">
          Built-in blocks such as the asset picker stay on the form they belong to. The other fields in this section are reused.
        </p>
        <div className="form-builder-reuse__actions">
          <button type="button" onClick={onClose} disabled={saving}>Cancel</button>
          <button
            type="button"
            className="is-primary"
            disabled={saving || !groups.length}
            onClick={() => onApply([...picked])}
          >
            {saving ? 'Saving…' : 'Use on selected forms'}
          </button>
        </div>
      </div>
    </div>
  )
}
