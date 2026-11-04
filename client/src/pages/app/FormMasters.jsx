import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { useOrg } from '../../hooks/useOrg'
import { usePermissions } from '../../hooks/usePermissions'
import { useBackdropClose } from '../../hooks/useBackdropClose'
import { useTextFieldLimits } from '../../hooks/useTextFieldLimits'
import { canManageOrg } from '../../lib/accountRoles'
import { orgPath } from '../../config/navigation'
import { MODULE_FORM_GROUPS } from '../../lib/formRegistry'
import { isProductModuleEnabled } from '../../lib/orgModules'
import {
  statusMasterForForm,
  statusMasterForModule,
} from '../../lib/formMasterStatuses'
import OthersStatusManage from './OthersStatusManage'
import {
  encodeFormMasterSegment,
  getFormMasterField,
  getFormMasterFields,
  getFormMasters,
  saveFormMasterOptions,
  saveFormMasterSkips,
} from '../../lib/api-form-masters'
import { invalidateFormLayoutCache } from '../../lib/api-form-layouts'
import {
  clearTextFieldLimitsCache,
  updateTextFieldLimits,
} from '../../lib/api-text-field-limits'
import {
  DEFAULT_TEXT_FIELD_LIMITS,
  TEXT_FIELD_LIMIT_MAX,
  TEXT_FIELD_LIMIT_MIN,
  limitKeyFromField,
} from '../../lib/textFieldLimits'
import { fieldTypeLabel } from '../../lib/assetFieldTypes'
import { parseLayoutId } from '../../lib/formLayoutIds'
import PageBack from '../../components/shared/PageBack'
import MastersBack from '../../components/company/MastersBack'
import NavIcon from '../../components/layout/NavIcon'
import SpellcheckInput from '../../components/shared/SpellcheckInput'
import PmActivityTypesModal from '../../components/pm/PmActivityTypesModal'
import '../../components/company/CompanyShared.css'
import '../../components/assets/AssetsFields.css'
import './Others.css'

const FORM_SECTIONS = new Set(['skips', 'options', 'limits', 'status'])

function optionLabels(options) {
  if (!Array.isArray(options) || !options.length) return ['']
  const labels = options.map((item) => {
    if (item == null) return ''
    if (typeof item === 'string' || typeof item === 'number') return String(item)
    return String(item.label ?? item.value ?? '')
  })
  return labels.length ? labels : ['']
}

function HubCard({ title, description, icon = 'document', onClick }) {
  return (
    <button type="button" className="others-hub__card" onClick={onClick}>
      <span className="others-hub__icon" aria-hidden="true">
        <NavIcon name={icon} />
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
  const modules = MODULE_FORM_GROUPS
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
  if (
    isProductModuleEnabled(org?.disabled_modules, 'tasks_followups')
    && !modules.some((group) => group.moduleId === 'tasks_followups')
  ) {
    modules.push({
      moduleId: 'tasks_followups',
      label: 'Tasks & Follow-ups',
      forms: [],
    })
  }
  return modules
}

function withTaskStatusModule(modules, org) {
  const list = [...(modules || [])]
  if (
    isProductModuleEnabled(org?.disabled_modules, 'tasks_followups')
    && !list.some((group) => group.moduleId === 'tasks_followups')
  ) {
    list.push({
      moduleId: 'tasks_followups',
      label: 'Tasks & Follow-ups',
      forms: [],
    })
  }
  return list
}

function isActivityTypeField(field) {
  const parsed = parseLayoutId(field?.id)
  return parsed.value === 'activity_type_id' || field?.id === 'activity_type_id'
}

function canManageFormMasters(role, canUpdate, isOrgAdmin) {
  return Boolean(isOrgAdmin || canManageOrg(role) || canUpdate?.('assets'))
}

function formMasterPath(org, formId, section = '', fieldId = '') {
  if (!org?.slug || !formId) return '#'
  const base = `masters/forms/${encodeFormMasterSegment(formId)}`
  if (!section) return orgPath(org.slug, base)
  const withSection = `${base}/${section}`
  if (!fieldId) return orgPath(org.slug, withSection)
  return orgPath(org.slug, `${withSection}/${encodeFormMasterSegment(fieldId)}`)
}

function flattenFormFields(payload) {
  return (payload?.sections || []).flatMap((section) => section.fields || [])
}

function dropdownFields(payload) {
  return flattenFormFields(payload).filter((field) => (
    field.hasOptions || isActivityTypeField(field)
  ))
}

function limitKeysForForm(payload) {
  const keys = new Set()
  for (const field of flattenFormFields(payload)) {
    const parsed = parseLayoutId(field.id)
    const key = limitKeyFromField({
      key: parsed?.value || field.id,
      label: field.label,
      name: field.label,
    })
    if (key) keys.add(key)
  }
  return [...keys]
}

function formSectionCards(payload, formId) {
  const cards = []
  const statusMaster = statusMasterForForm(formId)
  if (statusMaster) {
    cards.push({
      id: 'status',
      title: statusMaster.title,
      description: statusMaster.description,
      icon: 'list',
    })
  }

  const fields = flattenFormFields(payload)
  const hasSkipSurface = Boolean(
    fields.length
    || payload?.supportsTechnicianAcceptance
    || payload?.supportsChecklist,
  )
  if (hasSkipSurface) {
    cards.push({
      id: 'skips',
      title: 'Skip fields',
      description: 'Hide optional sections and fields, and set process rules for this form.',
      icon: 'list',
    })
  }

  const dropdownCount = dropdownFields(payload).length
  const hasActivityTypes = formId === 'pm.plan' || fields.some(isActivityTypeField)
  if (dropdownCount || hasActivityTypes) {
    cards.push({
      id: 'options',
      title: 'Dropdown values',
      description: hasActivityTypes
        ? 'Manage dropdown lists and maintenance activity types for this form.'
        : 'Add, rename, and reorder the options people see in this form’s dropdowns.',
      icon: 'document',
    })
  }

  if (limitKeysForForm(payload).length) {
    cards.push({
      id: 'limits',
      title: 'Character limits',
      description: 'Set how many characters users can enter in this form’s text fields.',
      icon: 'document',
    })
  }

  return cards
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

  const modules = withTaskStatusModule(payload?.modules || previewModules, org)

  return (
    <div className="company-page others-page">
      <header className="company-page__header">
        <MastersBack />
        <h1 className="company-page__title">Forms Master</h1>
        <p className="company-page__subtitle">
          Choose a module form, then open Status, Skip fields, Dropdown values, or Character limits.
        </p>
      </header>
      {error ? <p className="company-error">{error}</p> : null}
      {!error && !modules.length ? (
        <p className="company-empty">No configurable forms are available for this company.</p>
      ) : null}
      {modules.map((group) => {
        // Status-only modules (e.g. Tasks) keep a Status card here; forms with a hub show Status inside.
        const statusMaster = !group.forms?.length
          ? statusMasterForModule(group.moduleId)
          : null
        return (
          <section key={group.moduleId} className="form-masters-group">
            <h2 className="form-masters-group__title">{group.label}</h2>
            <div className="others-hub">
              {statusMaster ? (
                <HubCard
                  title={statusMaster.title}
                  description={statusMaster.description}
                  icon="list"
                  onClick={() => org?.slug && navigate(orgPath(
                    org.slug,
                    `masters/forms/status/${statusMaster.entityType}`,
                  ))}
                />
              ) : null}
              {group.forms.map((form) => (
                <HubCard
                  key={form.formId}
                  title={form.label}
                  description="Status, skip fields, dropdown values, and character limits"
                  icon="document"
                  onClick={() => org?.slug && navigate(formMasterPath(org, form.formId))}
                />
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}

function FormHub({ formId }) {
  const navigate = useNavigate()
  const { org } = useOrg()
  const [payload, setPayload] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const backTo = org?.slug ? orgPath(org.slug, 'masters/forms') : '#'

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const data = await getFormMasterFields(formId)
        if (!cancelled) setPayload(data)
      } catch (err) {
        if (!cancelled) setError(err.message || 'Could not load this form')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [formId])

  const cards = useMemo(() => formSectionCards(payload, formId), [payload, formId])

  return (
    <div className="company-page others-page">
      <header className="company-page__header">
        <PageBack to={backTo} label="Forms Master" />
        <h1 className="company-page__title">{payload?.label || 'Form'}</h1>
        <p className="company-page__subtitle">
          Open one card at a time so status, skip settings, dropdown lists, and character limits stay separate.
          {payload?.moduleLabel ? ` ${payload.moduleLabel}.` : ''}
        </p>
      </header>
      {loading ? <div className="company-loading">Loading…</div> : null}
      {error ? <p className="company-error">{error}</p> : null}
      {!loading && !error && !cards.length ? (
        <p className="company-empty">
          Superadmin has not added configurable sections on this form yet.
        </p>
      ) : null}
      {!loading && cards.length ? (
        <div className="others-hub form-masters-hub">
          {cards.map((card) => (
            <HubCard
              key={card.id}
              title={card.title}
              description={card.description}
              icon={card.icon}
              onClick={() => navigate(formMasterPath(org, formId, card.id))}
            />
          ))}
        </div>
      ) : null}
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

function applySkipPayloadToBoard(payload, nextPayload) {
  if (!payload) return payload
  const skippedFields = new Set(nextPayload.skippedFieldIds || [])
  const skippedSections = new Set(nextPayload.skippedSectionIds || [])
  return {
    ...payload,
    skipTechnicianAcceptance: Boolean(nextPayload.skipTechnicianAcceptance),
    checklistRequired: Boolean(nextPayload.checklistRequired),
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
    checklistRequired: Boolean(next.checklistRequired),
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
    checklistRequired: overrides.checklistRequired !== undefined
      ? overrides.checklistRequired
      : Boolean(payload?.checklistRequired),
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

function SkipFieldsView({ formId }) {
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
  const backTo = formMasterPath(org, formId)

  payloadRef.current = payload
  const dirty = Boolean(payload && savedPayload && skipSnapshot(payload) !== skipSnapshot(savedPayload))

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
        if (!cancelled) setError(err.message || 'Could not load skip settings')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [formId])

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

  const toggleChecklist = () => {
    updateDraft((current) => skipPayloadFromBoard(current, {
      checklistRequired: !current?.checklistRequired,
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
        <PageBack to={backTo} label={payload?.label || 'Form'} />
        <h1 className="company-page__title">Skip fields</h1>
        <p className="company-page__subtitle">
          Tick Skip on optional fields, then Save. Greyed boxes are Superadmin-required and cannot be skipped.
        </p>
      </header>
      {loading ? <div className="company-loading">Loading…</div> : null}
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
          {payload.supportsChecklist ? (
            <section className="form-masters-skip__section">
              <div className="form-masters-skip__head">
                <h2>Checklist</h2>
                <SkipToggle
                  checked={Boolean(payload.checklistRequired)}
                  disabled={!canManage}
                  title="Require a checklist before this form can be saved"
                  onToggle={toggleChecklist}
                >
                  Checklist needed
                </SkipToggle>
              </div>
              <p className="form-masters-skip__hint">
                When on, people must choose a checklist on this form before they submit.
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
    </div>
  )
}

function DropdownValuesView({ formId, fieldId }) {
  const navigate = useNavigate()
  const { org } = useOrg()
  const [payload, setPayload] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showActivityTypes, setShowActivityTypes] = useState(false)
  const backTo = formMasterPath(org, formId)
  const optionsPath = formMasterPath(org, formId, 'options')

  const loadFields = async () => {
    const data = await getFormMasterFields(formId)
    setPayload(data)
  }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const data = await getFormMasterFields(formId)
        if (!cancelled) setPayload(data)
      } catch (err) {
        if (!cancelled) setError(err.message || 'Could not load dropdown values')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [formId])

  const optionFields = useMemo(() => dropdownFields(payload), [payload])
  const showActivityCard = formId === 'pm.plan' || optionFields.some(isActivityTypeField)

  return (
    <div className="company-page others-page">
      <header className="company-page__header">
        <PageBack to={backTo} label={payload?.label || 'Form'} />
        <h1 className="company-page__title">Dropdown values</h1>
        <p className="company-page__subtitle">
          Manage the option lists people see in this form’s dropdowns.
        </p>
      </header>
      {loading ? <div className="company-loading">Loading…</div> : null}
      {error ? <p className="company-error">{error}</p> : null}
      {!loading && payload ? (
        <div className="form-masters-skip">
          {showActivityCard ? (
            <section className="form-masters-skip__section">
              <div className="form-masters-skip__head">
                <h2>Maintenance activity types</h2>
                <button
                  type="button"
                  className="form-masters-skip__options"
                  onClick={() => setShowActivityTypes(true)}
                >
                  Manage
                </button>
              </div>
              <p className="form-masters-skip__hint">
                System types can be deactivated. Add custom types without a software change.
              </p>
            </section>
          ) : null}

          <section className="form-masters-skip__section">
            <div className="form-masters-skip__head">
              <h2>Form dropdowns</h2>
            </div>
            <div className="form-masters-skip__rows">
              {optionFields.length === 0 ? (
                <p className="company-empty">No editable dropdown lists on this form.</p>
              ) : optionFields.map((field) => (
                <div key={field.id} className="form-masters-skip__row">
                  <div className="form-masters-skip__copy">
                    <div className="form-masters-skip__name">
                      <strong>{field.label}</strong>
                    </div>
                    <span>
                      {field.kind === 'group' ? 'Repeatable group' : fieldTypeLabel(field.fieldType)}
                      {field.required || field.locked ? ' · Required' : ''}
                    </span>
                  </div>
                  {isActivityTypeField(field) ? (
                    <button
                      type="button"
                      className="form-masters-skip__options"
                      onClick={() => setShowActivityTypes(true)}
                    >
                      Options
                    </button>
                  ) : field.hasOptions ? (
                    <button
                      type="button"
                      className="form-masters-skip__options"
                      onClick={() => navigate(formMasterPath(org, formId, 'options', field.id))}
                    >
                      Options
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        </div>
      ) : null}
      {showActivityTypes ? (
        <PmActivityTypesModal onClose={() => setShowActivityTypes(false)} />
      ) : null}
      {fieldId ? (
        <OptionEditorModal
          formId={formId}
          fieldId={fieldId}
          onClose={() => navigate(optionsPath)}
          onSaved={async () => {
            try {
              await loadFields()
            } catch {
              // Keep the list as-is if refresh fails; the save already succeeded.
            }
            navigate(optionsPath)
          }}
        />
      ) : null}
    </div>
  )
}

function valuesFromFields(fields) {
  const next = {}
  for (const row of fields || []) next[row.key] = String(row.max_length)
  return next
}

function CharacterLimitsView({ formId }) {
  const { role } = useAuth()
  const { org } = useOrg()
  const { canUpdate, isOrgAdmin } = usePermissions()
  const canManage = canManageFormMasters(role, canUpdate, isOrgAdmin)
  const { fields, loading: limitsLoading, error: limitsError } = useTextFieldLimits()
  const [payload, setPayload] = useState(null)
  const [formLoading, setFormLoading] = useState(true)
  const [formError, setFormError] = useState(null)
  const [values, setValues] = useState({})
  const [saving, setSaving] = useState(false)
  const [actionError, setActionError] = useState(null)
  const [success, setSuccess] = useState(null)
  const backTo = formMasterPath(org, formId)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setFormLoading(true)
      setFormError(null)
      try {
        const data = await getFormMasterFields(formId)
        if (!cancelled) setPayload(data)
      } catch (err) {
        if (!cancelled) setFormError(err.message || 'Could not load this form')
      } finally {
        if (!cancelled) setFormLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [formId])

  const allowedKeys = useMemo(() => new Set(limitKeysForForm(payload)), [payload])
  const visibleFields = useMemo(
    () => (fields || []).filter((row) => allowedKeys.has(row.key)),
    [fields, allowedKeys],
  )

  useEffect(() => {
    setValues(valuesFromFields(visibleFields))
  }, [visibleFields])

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
      for (const row of visibleFields) {
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
      const nextVisible = (saved.fields || []).filter((row) => allowedKeys.has(row.key))
      setValues(valuesFromFields(nextVisible))
      setSuccess('Character limits saved. Shared fields keep the same limit on every form that uses them.')
    } catch (err) {
      setActionError(err.message || 'Could not save character limits.')
    } finally {
      setSaving(false)
    }
  }

  const handleReset = async () => {
    if (!canManage || !visibleFields.length) return
    if (!window.confirm('Reset these character limits to defaults?')) return
    setSaving(true)
    setActionError(null)
    setSuccess(null)
    try {
      const limits = {}
      for (const row of visibleFields) {
        limits[row.key] = row.default_max_length ?? DEFAULT_TEXT_FIELD_LIMITS[row.key]
      }
      clearTextFieldLimitsCache()
      const saved = await updateTextFieldLimits(limits)
      const nextVisible = (saved.fields || []).filter((row) => allowedKeys.has(row.key))
      setValues(valuesFromFields(nextVisible))
      setSuccess('Character limits restored to defaults for this form.')
    } catch (err) {
      setActionError(err.message || 'Could not reset character limits.')
    } finally {
      setSaving(false)
    }
  }

  const loading = formLoading || limitsLoading
  const error = formError || limitsError

  return (
    <div className="company-page others-page">
      <header className="company-page__header">
        <PageBack to={backTo} label={payload?.label || 'Form'} />
        <div className="others-manage__header-row">
          <div>
            <h1 className="company-page__title">Character limits</h1>
            <p className="company-page__subtitle">
              Limits for text fields on this form. Each limit must be between {TEXT_FIELD_LIMIT_MIN} and {TEXT_FIELD_LIMIT_MAX}.
              Shared fields keep one company-wide value.
            </p>
          </div>
          {canManage && visibleFields.length ? (
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
          ) : null}
        </div>
      </header>

      {(error || actionError) && (
        <div className="company-alert">{error || actionError}</div>
      )}
      {success && <div className="company-alert company-alert--success">{success}</div>}

      {loading && !visibleFields.length ? (
        <div className="company-loading">Loading character limits…</div>
      ) : !visibleFields.length ? (
        <p className="company-empty">This form has no text fields with character limits.</p>
      ) : (
        <form className="others-limits" onSubmit={handleSave}>
          {visibleFields.map((row) => (
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

export default function FormMasters() {
  const params = useParams()
  const { org } = useOrg()
  const formId = params.formId ? decodeURIComponent(params.formId) : ''
  const rawSection = params.section ? decodeURIComponent(params.section) : ''
  const fieldId = params.fieldId ? decodeURIComponent(params.fieldId) : ''

  if (!formId) return <FormList />

  // Legacy bookmarks: /masters/forms/:formId/:fieldId → options editor
  if (rawSection && !FORM_SECTIONS.has(rawSection) && !fieldId) {
    if (!org?.slug) return <div className="company-loading">Loading…</div>
    return (
      <Navigate
        to={formMasterPath(org, formId, 'options', rawSection)}
        replace
      />
    )
  }

  if (!rawSection) return <FormHub formId={formId} />
  if (rawSection === 'skips') return <SkipFieldsView formId={formId} />
  if (rawSection === 'options') {
    return <DropdownValuesView formId={formId} fieldId={fieldId} />
  }
  if (rawSection === 'limits') return <CharacterLimitsView formId={formId} />
  if (rawSection === 'status') {
    const statusMaster = statusMasterForForm(formId)
    if (!statusMaster) return <Navigate to={formMasterPath(org, formId)} replace />
    return (
      <OthersStatusManage
        entityType={statusMaster.entityType}
        backTo={formMasterPath(org, formId)}
        backLabel={payloadLabelFallback(formId)}
      />
    )
  }

  return <Navigate to={formMasterPath(org, formId)} replace />
}

function payloadLabelFallback(formId) {
  const match = MODULE_FORM_GROUPS
    .flatMap((group) => group.forms)
    .find((form) => form.formId === formId)
  return match?.label || 'Form'
}
