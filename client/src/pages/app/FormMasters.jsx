import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { useOrg } from '../../hooks/useOrg'
import { usePermissions } from '../../hooks/usePermissions'
import { useBackdropClose } from '../../hooks/useBackdropClose'
import { canManageOrg } from '../../lib/accountRoles'
import { orgPath } from '../../config/navigation'
import { MODULE_FORM_GROUPS } from '../../lib/formRegistry'
import { isProductModuleEnabled } from '../../lib/orgModules'
import {
  encodeFormMasterSegment,
  getFormMasterField,
  getFormMasterFields,
  getFormMasters,
  saveFormMasterOptions,
  saveFormMasterSkips,
} from '../../lib/api-form-masters'
import { invalidateFormLayoutCache } from '../../lib/api-form-layouts'
import { fieldTypeLabel } from '../../lib/assetFieldTypes'
import PageBack from '../../components/shared/PageBack'
import MastersBack from '../../components/company/MastersBack'
import NavIcon from '../../components/layout/NavIcon'
import SpellcheckInput from '../../components/shared/SpellcheckInput'
import '../../components/company/CompanyShared.css'
import '../../components/assets/AssetsFields.css'
import './Others.css'

function optionLabels(options) {
  if (!Array.isArray(options) || !options.length) return ['']
  const labels = options.map((item) => {
    if (item == null) return ''
    if (typeof item === 'string' || typeof item === 'number') return String(item)
    return String(item.label ?? item.value ?? '')
  })
  return labels.length ? labels : ['']
}

function HubCard({ title, description, onClick }) {
  return (
    <button type="button" className="others-hub__card" onClick={onClick}>
      <span className="others-hub__icon" aria-hidden="true">
        <NavIcon name="document" />
      </span>
      <span className="others-hub__body">
        <span className="others-hub__title">{title}</span>
        {description ? <span className="others-hub__desc">{description}</span> : null}
      </span>
      <span className="others-hub__chevron" aria-hidden="true">›</span>
    </button>
  )
}

function modulesFromRegistry(org) {
  return MODULE_FORM_GROUPS
    .filter((group) => isProductModuleEnabled(org?.disabled_modules, group.moduleId))
    .map((group) => ({
      moduleId: group.moduleId,
      label: group.label,
      forms: group.forms.map((form) => ({
        formId: form.formId,
        label: form.label,
        fieldCount: null,
      })),
    }))
}

function fieldCountLabel(fieldCount) {
  if (fieldCount == null) return 'Dropdown lists on this form'
  if (!fieldCount) return 'No dropdown lists on this form yet'
  return `${fieldCount} dropdown ${fieldCount === 1 ? 'list' : 'lists'}`
}

function FormList() {
  const navigate = useNavigate()
  const { org } = useOrg()
  const previewModules = useMemo(() => modulesFromRegistry(org), [org])
  const [payload, setPayload] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setError(null)
      try {
        const data = await getFormMasters()
        if (!cancelled) setPayload(data)
      } catch (err) {
        if (!cancelled) setError(err.message || 'Could not load forms')
      }
    })()
    return () => { cancelled = true }
  }, [])

  const modules = payload?.modules || previewModules

  return (
    <div className="company-page others-page">
      <header className="company-page__header">
        <MastersBack />
        <h1 className="company-page__title">Forms Master</h1>
        <p className="company-page__subtitle">
          Choose a module form Superadmin configured, then skip optional fields or manage dropdown lists.
        </p>
      </header>
      {error ? <p className="company-error">{error}</p> : null}
      {!error && !modules.length ? (
        <p className="company-empty">No configurable forms are available for this company.</p>
      ) : null}
      {modules.map((group) => (
        <section key={group.moduleId} className="form-masters-group">
          <h2 className="form-masters-group__title">{group.label}</h2>
          <div className="others-hub">
            {group.forms.map((form) => (
              <HubCard
                key={form.formId}
                title={form.label}
                description={fieldCountLabel(form.fieldCount)}
                onClick={() => org?.slug && navigate(orgPath(
                  org.slug,
                  `masters/forms/${encodeFormMasterSegment(form.formId)}`,
                ))}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

function OptionEditorModal({ formId, fieldId, onClose, onSaved }) {
  const { role } = useAuth()
  const { canUpdate, isOrgAdmin } = usePermissions()
  const canManage = canManageFormMasters(role, canUpdate, isOrgAdmin)
  const handleBackdropClick = useBackdropClose(onClose)
  const [payload, setPayload] = useState(null)
  const [options, setOptions] = useState([''])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape' && !saving) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, saving])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const data = await getFormMasterField(formId, fieldId)
        if (cancelled) return
        setPayload(data)
        setOptions(optionLabels(data?.field?.options))
      } catch (err) {
        if (!cancelled) setError(err.message || 'Could not load this master')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [formId, fieldId])

  const handleSave = async (event) => {
    event.preventDefault()
    if (!canManage) return
    const next = options.map((item) => item.trim()).filter(Boolean)
    if (!next.length) {
      setError('Add at least one option.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await saveFormMasterOptions(formId, fieldId, next)
      onSaved?.()
    } catch (err) {
      setError(err.message || 'Could not save options.')
      setSaving(false)
    }
  }

  const moveOption = (index, delta) => {
    setOptions((prev) => {
      const nextIndex = index + delta
      if (nextIndex < 0 || nextIndex >= prev.length) return prev
      const next = [...prev]
      const [row] = next.splice(index, 1)
      next.splice(nextIndex, 0, row)
      return next
    })
  }

  const title = payload?.field?.label || 'Dropdown'

  return createPortal(
    <div
      className="company-modal-overlay"
      onMouseDown={handleBackdropClick}
      role="presentation"
    >
      <div
        className="company-modal form-masters-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="form-master-editor-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="company-modal__header">
          <h2 id="form-master-editor-title">{title}</h2>
          <button type="button" className="company-modal__close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <form className="company-modal__form" onSubmit={handleSave}>
          <p className="company-modal__hint">
            Add, rename, reorder, or remove the options people see in this dropdown.
          </p>
          {loading ? <p className="company-form__hint">Loading...</p> : null}
          {error ? <div className="company-alert" role="alert">{error}</div> : null}
          {!loading && payload?.field ? (
            <div className="asset-dropdown-options">
              {options.map((opt, index) => (
                <div key={index} className="asset-dropdown-options__row">
                  <SpellcheckInput
                    className="company-form__input"
                    value={opt}
                    onChange={(event) => {
                      const value = event.target.value
                      setOptions((prev) => prev.map((item, i) => (i === index ? value : item)))
                    }}
                    placeholder={`Option ${index + 1}`}
                    disabled={!canManage || saving}
                  />
                  <button
                    type="button"
                    className="company-btn company-btn--ghost"
                    onClick={() => moveOption(index, -1)}
                    disabled={!canManage || saving || index === 0}
                    aria-label="Move up"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="company-btn company-btn--ghost"
                    onClick={() => moveOption(index, 1)}
                    disabled={!canManage || saving || index === options.length - 1}
                    aria-label="Move down"
                  >
                    ↓
                  </button>
                  {options.length > 1 ? (
                    <button
                      type="button"
                      className="company-btn company-btn--ghost"
                      onClick={() => setOptions((prev) => prev.filter((_, i) => i !== index))}
                      disabled={!canManage || saving}
                      aria-label="Remove option"
                    >
                      ×
                    </button>
                  ) : null}
                </div>
              ))}
              {canManage ? (
                <button
                  type="button"
                  className="company-btn company-btn--secondary"
                  onClick={() => setOptions((prev) => [...prev, ''])}
                  disabled={saving}
                >
                  + Add option
                </button>
              ) : (
                <p className="company-form__hint">You can view these options but cannot change them.</p>
              )}
            </div>
          ) : null}
          <div className="company-modal__actions">
            <button type="button" className="company-btn company-btn--ghost" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            {canManage ? (
              <button type="submit" className="company-btn company-btn--primary" disabled={saving || loading}>
                {saving ? 'Saving…' : 'Save options'}
              </button>
            ) : null}
          </div>
        </form>
      </div>
    </div>,
    document.body,
  )
}

function canManageFormMasters(role, canUpdate, isOrgAdmin) {
  return Boolean(isOrgAdmin || canManageOrg(role) || canUpdate?.('assets'))
}

function applySkipPayloadToBoard(payload, nextPayload) {
  if (!payload) return payload
  const skippedFields = new Set(nextPayload.skippedFieldIds || [])
  const skippedSections = new Set(nextPayload.skippedSectionIds || [])
  return {
    ...payload,
    skipTechnicianAcceptance: Boolean(nextPayload.skipTechnicianAcceptance),
    sections: (payload.sections || []).map((section) => ({
      ...section,
      skipped: skippedSections.has(section.id),
      fields: (section.fields || []).map((field) => {
        const skippedExplicit = skippedFields.has(field.id)
        const skippedBySection = skippedSections.has(section.id) && field.skippable
        return {
          ...field,
          skippedExplicit,
          skipped: skippedExplicit || skippedBySection,
          skippedBecause: '',
        }
      }),
    })),
  }
}

function skipSnapshot(payload) {
  const next = skipPayloadFromBoard(payload)
  return JSON.stringify({
    skippedFieldIds: [...next.skippedFieldIds].sort(),
    skippedSectionIds: [...next.skippedSectionIds].sort(),
    skipTechnicianAcceptance: Boolean(next.skipTechnicianAcceptance),
  })
}

function skipPayloadFromBoard(payload, overrides = {}) {
  const skippedFieldIds = []
  const skippedSectionIds = []
  for (const section of payload?.sections || []) {
    if (overrides.sectionId === section.id) {
      if (overrides.sectionSkipped) skippedSectionIds.push(section.id)
    } else if (section.skipped && section.skippable) {
      skippedSectionIds.push(section.id)
    }
    for (const field of section.fields || []) {
      if (overrides.fieldId === field.id) {
        if (overrides.fieldSkipped && field.skippable) {
          skippedFieldIds.push(field.id)
        }
        continue
      }
      if (field.skippedExplicit && field.skippable) {
        skippedFieldIds.push(field.id)
      }
    }
  }
  return {
    skippedFieldIds,
    skippedSectionIds,
    skipTechnicianAcceptance: overrides.skipTechnicianAcceptance !== undefined
      ? overrides.skipTechnicianAcceptance
      : Boolean(payload?.skipTechnicianAcceptance),
  }
}

function SkipToggle({ checked, disabled, title, onToggle, children }) {
  return (
    <label
      className={`form-masters-skip__toggle${checked ? ' is-on' : ''}${disabled ? ' is-disabled' : ''}`}
      title={title || undefined}
    >
      <input
        type="checkbox"
        checked={Boolean(checked)}
        disabled={disabled}
        onChange={onToggle}
      />
      {children}
    </label>
  )
}

function FieldList({ formId, fieldId }) {
  const navigate = useNavigate()
  const { role } = useAuth()
  const { org } = useOrg()
  const { canUpdate, isOrgAdmin } = usePermissions()
  const canManage = canManageFormMasters(role, canUpdate, isOrgAdmin)
  const [payload, setPayload] = useState(null)
  const [savedPayload, setSavedPayload] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const payloadRef = useRef(null)
  const dirtyRef = useRef(false)
  const backTo = org?.slug ? orgPath(org.slug, 'masters/forms') : '#'
  const formPath = org?.slug
    ? orgPath(org.slug, `masters/forms/${encodeFormMasterSegment(formId)}`)
    : '#'

  payloadRef.current = payload
  const dirty = Boolean(payload && savedPayload && skipSnapshot(payload) !== skipSnapshot(savedPayload))
  dirtyRef.current = dirty

  const loadFields = async () => {
    const data = await getFormMasterFields(formId)
    setPayload(data)
    setSavedPayload(data)
  }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const data = await getFormMasterFields(formId)
        if (!cancelled) {
          setPayload(data)
          setSavedPayload(data)
        }
      } catch (err) {
        if (!cancelled) setError(err.message || 'Could not load form masters')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [formId])

  const closeEditor = () => {
    navigate(formPath)
  }

  const updateDraft = (buildNext) => {
    if (!canManage) return
    setPayload((current) => applySkipPayloadToBoard(current, buildNext(current)))
    setError(null)
  }

  const handleSave = async () => {
    if (!canManage || !payloadRef.current) return
    setSaving(true)
    setError(null)
    try {
      const data = await saveFormMasterSkips(formId, skipPayloadFromBoard(payloadRef.current))
      invalidateFormLayoutCache(formId)
      setPayload(data)
      setSavedPayload(data)
    } catch (err) {
      setError(err.message || 'Could not save skip settings')
    } finally {
      setSaving(false)
    }
  }

  const toggleAcceptance = () => {
    updateDraft((current) => skipPayloadFromBoard(current, {
      skipTechnicianAcceptance: !current?.skipTechnicianAcceptance,
    }))
  }

  const toggleSection = (section) => {
    if (!section.skippable) return
    updateDraft((current) => {
      const live = (current?.sections || []).find((item) => item.id === section.id) || section
      const next = skipPayloadFromBoard(current, {
        sectionId: live.id,
        sectionSkipped: !live.skipped,
      })
      if (live.skipped) {
        next.skippedFieldIds = next.skippedFieldIds.filter((id) => (
          !(live.fields || []).some((field) => field.id === id)
        ))
      }
      return next
    })
  }

  const toggleField = (section, field) => {
    updateDraft((current) => {
      const liveSection = (current?.sections || []).find((item) => item.id === section.id) || section
      const liveField = (liveSection.fields || []).find((item) => item.id === field.id) || field
      if (!liveField.skippable && liveField.skipped) {
        return skipPayloadFromBoard(current, {
          fieldId: liveField.id,
          fieldSkipped: false,
          sectionId: liveSection.id,
          sectionSkipped: false,
        })
      }
      if (!liveField.skippable) return skipPayloadFromBoard(current)
      return skipPayloadFromBoard(current, {
        fieldId: liveField.id,
        fieldSkipped: !liveField.skipped,
        sectionId: liveSection.id,
        sectionSkipped: liveField.skipped ? false : (liveSection.skipped && liveSection.skippable),
      })
    })
  }

  return (
    <div className="company-page others-page">
      <header className="company-page__header">
        <PageBack to={backTo} label="Forms Master" />
        <h1 className="company-page__title">{payload?.label || 'Form'}</h1>
        <p className="company-page__subtitle">
          Tick Skip on optional fields, then Save. Greyed boxes are Superadmin-required and cannot be skipped.
          {payload?.moduleLabel ? ` ${payload.moduleLabel}.` : ''}
        </p>
      </header>
      {loading ? <div className="company-loading">Loading...</div> : null}
      {error ? <p className="company-error">{error}</p> : null}
      {!loading && payload ? (
        <div className="form-masters-skip">
          {!canManage ? (
            <p className="form-masters-skip__banner" role="status">
              You can view skip settings but need company admin or Forms Master (assets) update permission to change them.
            </p>
          ) : null}
          {payload.supportsTechnicianAcceptance ? (
            <section className="form-masters-skip__section">
              <div className="form-masters-skip__head">
                <h2>Technician acceptance</h2>
                <SkipToggle
                  checked={Boolean(payload.skipTechnicianAcceptance)}
                  disabled={!canManage}
                  title="Skip technician Accept/Approve when a work order is assigned"
                  onToggle={toggleAcceptance}
                >
                  Skip
                </SkipToggle>
              </div>
              <p className="form-masters-skip__hint">
                When skipped, assigning a technician marks the work order accepted. Supervisor verification stays.
              </p>
            </section>
          ) : null}

          {(payload.sections || []).map((section) => (
            <section key={section.id} className="form-masters-skip__section">
              <div className="form-masters-skip__head">
                <h2>{section.label}</h2>
                <SkipToggle
                  checked={Boolean(section.skipped)}
                  title={section.skippable
                    ? (section.skipBlockedReason || 'Hide optional fields in this section')
                    : (section.skipBlockedReason || 'This section cannot be skipped')}
                  disabled={!canManage || !section.skippable}
                  onToggle={() => toggleSection(section)}
                >
                  Skip section
                </SkipToggle>
              </div>
              {section.skipBlockedReason ? (
                <p className="form-masters-skip__hint">{section.skipBlockedReason}</p>
              ) : null}
              <div className="form-masters-skip__rows">
                {(section.fields || []).map((field) => (
                  <div
                    key={field.id}
                    className={`form-masters-skip__row ${field.required || field.locked ? 'is-required' : ''} ${field.skipped ? 'is-skipped' : ''}`}
                  >
                    <div className="form-masters-skip__copy">
                      <div className="form-masters-skip__name">
                        <strong>{field.label}</strong>
                        <SkipToggle
                          checked={Boolean(field.skipped)}
                          title={
                            field.skippable
                              ? 'Hide this field on the live form'
                              : (field.skipBlockedReason || 'Required by Superadmin — cannot skip')
                          }
                          disabled={
                            !canManage
                            || (!field.skippable && !(field.skipped && !field.skippedBecause))
                          }
                          onToggle={() => toggleField(section, field)}
                        >
                          Skip
                        </SkipToggle>
                      </div>
                      <span>
                        {field.kind === 'group' ? 'Repeatable group' : fieldTypeLabel(field.fieldType)}
                        {field.required || field.locked ? ' · Required' : ''}
                        {field.skippedBecause ? ` · Skipped with ${field.skippedBecause}` : ''}
                        {field.skipBlockedReason && !field.skippable && !field.required && !field.locked
                          ? ` · ${field.skipBlockedReason}`
                          : ''}
                      </span>
                    </div>
                    {field.hasOptions ? (
                      <button
                        type="button"
                        className="form-masters-skip__options"
                        onClick={() => org?.slug && navigate(orgPath(
                          org.slug,
                          `masters/forms/${encodeFormMasterSegment(formId)}/${encodeFormMasterSegment(field.id)}`,
                        ))}
                      >
                        Options
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            </section>
          ))}

          {!payload.sections?.length ? (
            <p className="company-empty">
              Superadmin has not added sections on this form yet.
            </p>
          ) : null}
          {canManage ? (
            <div className="form-masters-skip__actions">
              <button
                type="button"
                className="company-btn company-btn--primary"
                onClick={handleSave}
                disabled={saving || !dirty}
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
      {fieldId ? (
        <OptionEditorModal
          formId={formId}
          fieldId={fieldId}
          onClose={closeEditor}
          onSaved={async () => {
            try {
              if (!dirtyRef.current) await loadFields()
            } catch {
              // Keep the list as-is if refresh fails; the save already succeeded.
            }
            closeEditor()
          }}
        />
      ) : null}
    </div>
  )
}

export default function FormMasters() {
  const params = useParams()
  const formId = params.formId ? decodeURIComponent(params.formId) : ''
  const fieldId = params.fieldId ? decodeURIComponent(params.fieldId) : ''

  const view = useMemo(() => (formId ? 'fields' : 'forms'), [formId])

  if (view === 'fields') return <FieldList formId={formId} fieldId={fieldId} />
  return <FormList />
}
