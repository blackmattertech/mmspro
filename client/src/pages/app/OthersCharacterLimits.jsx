import { useEffect, useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useOrg } from '../../hooks/useOrg'
import { useTextFieldLimits } from '../../hooks/useTextFieldLimits'
import { isCompanyAdmin, canManageOrg } from '../../lib/accountRoles'
import { orgPath } from '../../config/navigation'
import {
  TEXT_FIELD_LIMIT_MAX,
  TEXT_FIELD_LIMIT_MIN,
} from '../../lib/textFieldLimits'
import {
  clearTextFieldLimitsCache,
  resetTextFieldLimits,
  updateTextFieldLimits,
} from '../../lib/api-text-field-limits'
import PageBack from '../../components/shared/PageBack'
import '../../components/company/CompanyShared.css'
import './Others.css'

function valuesFromFields(fields) {
  const next = {}
  for (const row of fields || []) next[row.key] = String(row.max_length)
  return next
}

export default function OthersCharacterLimits() {
  const { org } = useOrg()
  const { role } = useAuth()
  const canManage = isCompanyAdmin(role) || canManageOrg(role)
  const { fields, loading, error } = useTextFieldLimits()

  const [values, setValues] = useState({})
  const [saving, setSaving] = useState(false)
  const [actionError, setActionError] = useState(null)
  const [success, setSuccess] = useState(null)

  useEffect(() => {
    setValues(valuesFromFields(fields))
  }, [fields])

  const backTo = org?.slug ? orgPath(org.slug, 'masters/others') : '#'

  const setValue = (key, value) => {
    setValues((prev) => ({ ...prev, [key]: value }))
    setSuccess(null)
  }

  const handleSave = async (event) => {
    event.preventDefault()
    if (!canManage) return
    setSaving(true)
    setActionError(null)
    setSuccess(null)
    try {
      const limits = {}
      for (const row of fields) {
        const num = Number(values[row.key])
        if (!Number.isInteger(num)) {
          throw new Error(`${row.label} must be a whole number.`)
        }
        if (num < TEXT_FIELD_LIMIT_MIN || num > TEXT_FIELD_LIMIT_MAX) {
          throw new Error(
            `${row.label} must be between ${TEXT_FIELD_LIMIT_MIN} and ${TEXT_FIELD_LIMIT_MAX} characters.`,
          )
        }
        limits[row.key] = num
      }
      const saved = await updateTextFieldLimits(limits)
      setValues(valuesFromFields(saved.fields))
      setSuccess('Character limits saved. They apply to every form that uses these fields.')
    } catch (err) {
      setActionError(err.message || 'Could not save character limits.')
    } finally {
      setSaving(false)
    }
  }

  const handleReset = async () => {
    if (!canManage) return
    if (!window.confirm('Reset all character limits to defaults?')) return
    setSaving(true)
    setActionError(null)
    setSuccess(null)
    try {
      clearTextFieldLimitsCache()
      const saved = await resetTextFieldLimits()
      setValues(valuesFromFields(saved.fields))
      setSuccess('Character limits restored to defaults.')
    } catch (err) {
      setActionError(err.message || 'Could not reset character limits.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="company-page others-page">
      <header className="company-page__header">
        <PageBack to={backTo} label="Others" />
        <div className="others-manage__header-row">
          <div>
            <h1 className="company-page__title">Character limits</h1>
            <p className="company-page__subtitle">
              Set how many characters users can enter in shared text fields across work requests,
              work orders, daily logs, and tasks. Each limit must be between {TEXT_FIELD_LIMIT_MIN} and {TEXT_FIELD_LIMIT_MAX}.
            </p>
          </div>
          {canManage && (
            <div className="others-manage__actions">
              <button
                type="button"
                className="company-btn company-btn--secondary"
                onClick={handleReset}
                disabled={saving || loading}
              >
                Reset defaults
              </button>
            </div>
          )}
        </div>
      </header>

      {!canManage && (
        <p className="company-readonly-note">
          Only company admins can change character limits. You can view the current values.
        </p>
      )}

      {(error || actionError) && (
        <div className="company-alert">{error || actionError}</div>
      )}
      {success && <div className="company-alert company-alert--success">{success}</div>}

      {loading && !fields.length ? (
        <div className="company-loading">Loading character limits…</div>
      ) : (
        <form className="others-limits" onSubmit={handleSave}>
          {fields.map((row) => (
            <label key={row.key} className="others-limits__row">
              <span className="others-limits__meta">
                <span className="others-limits__name">{row.label}</span>
                <span className="others-limits__key">{row.key}</span>
                <span className="others-limits__desc">{row.description}</span>
              </span>
              <span className="others-limits__control">
                <input
                  type="number"
                  min={TEXT_FIELD_LIMIT_MIN}
                  max={TEXT_FIELD_LIMIT_MAX}
                  step="1"
                  className="company-form__input"
                  value={values[row.key] ?? ''}
                  onChange={(e) => setValue(row.key, e.target.value)}
                  disabled={!canManage || saving}
                  required
                />
                <span className="others-limits__suffix">characters</span>
              </span>
            </label>
          ))}

          {canManage && (
            <div className="company-form__actions">
              <button
                type="submit"
                className="company-btn company-btn--primary"
                disabled={saving || loading}
              >
                {saving ? 'Saving…' : 'Save limits'}
              </button>
            </div>
          )}
        </form>
      )}
    </div>
  )
}
