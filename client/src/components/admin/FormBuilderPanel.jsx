import { useEffect, useMemo, useState } from 'react'
import { getAdminFormLayout, getAdminFormLayouts, markAdminFormDefault, saveAdminFormLayout } from '../../lib/api-form-layouts'
import { MODULE_FORM_GROUPS } from '../../lib/formRegistry'
import { isProductModuleEnabled } from '../../lib/orgModules'
import FormBuilderCanvas from './FormBuilderCanvas'
import './FormBuilderPanel.css'

function ModuleIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="3" stroke="currentColor" strokeWidth="1.5" />
      <path d="M7 9H17M7 13H13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

export default function FormBuilderPanel({ org, onGoToSections }) {
  const [moduleId, setModuleId] = useState(null)
  const [formId, setFormId] = useState(null)
  const [payload, setPayload] = useState(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [marking, setMarking] = useState(false)
  const [error, setError] = useState(null)
  const [defaultFormIds, setDefaultFormIds] = useState(() => new Set())

  const enabledGroups = useMemo(() => (
    MODULE_FORM_GROUPS.filter((group) => isProductModuleEnabled(org?.disabled_modules, group.moduleId))
  ), [org?.disabled_modules])

  const selectedGroup = enabledGroups.find((group) => group.moduleId === moduleId) || null

  useEffect(() => {
    if (!org?.id) return undefined
    let cancelled = false
    getAdminFormLayouts(org.id)
      .then((data) => {
        if (cancelled) return
        const ids = new Set()
        for (const group of data?.modules || []) {
          for (const item of group.forms || []) {
            if (item.hasPlatformDefault) ids.add(item.formId)
          }
        }
        setDefaultFormIds(ids)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [org?.id])

  useEffect(() => {
    if (!org?.id || !formId) {
      setPayload(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    getAdminFormLayout(org.id, formId)
      .then((data) => {
        if (!cancelled) setPayload(data)
      })
      .catch((err) => {
        if (!cancelled) setError(err.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [org?.id, formId])

  const openModule = (group) => {
    setError(null)
    if (!group.forms.length) {
      setModuleId(group.moduleId)
      setFormId(null)
      return
    }
    if (group.forms.length === 1) {
      setModuleId(group.moduleId)
      setFormId(group.forms[0].formId)
      return
    }
    setModuleId(group.moduleId)
    setFormId(null)
  }

  const handleBack = () => {
    if (formId && selectedGroup?.forms.length > 1) {
      setFormId(null)
      setPayload(null)
      return
    }
    setFormId(null)
    setModuleId(null)
    setPayload(null)
  }

  const handleSave = async (layout) => {
    setSaving(true)
    setError(null)
    try {
      const saved = await saveAdminFormLayout(org.id, formId, layout)
      setPayload((prev) => ({ ...prev, ...saved }))
    } catch (err) {
      setError(err.message)
      throw err
    } finally {
      setSaving(false)
    }
  }

  const handleMarkDefault = async (layout) => {
    const moduleLabel = payload?.form?.moduleLabel || 'this module'
    const replacing = payload?.platformDefault && !payload.platformDefault.isSource
    const message = replacing
      ? `Replace the default ${moduleLabel} form? New companies will start with this one.`
      : `Mark this as the default ${moduleLabel} form? New companies will start with it.`
    if (!window.confirm(message)) return
    setMarking(true)
    setError(null)
    try {
      await saveAdminFormLayout(org.id, formId, layout)
      const marked = await markAdminFormDefault(org.id, formId)
      setPayload(marked)
      setDefaultFormIds((prev) => new Set(prev).add(formId))
    } catch (err) {
      setError(err.message)
      throw err
    } finally {
      setMarking(false)
    }
  }

  if (formId) {
    return (
      <div className="form-builder">
        <FormBuilderCanvas
          orgName={org?.name}
          payload={payload}
          loading={loading}
          saving={saving}
          marking={marking}
          error={error}
          onBack={handleBack}
          onSave={handleSave}
          onMarkDefault={handleMarkDefault}
          onGoToSections={onGoToSections}
          formChoices={enabledGroups.flatMap((group) => group.forms.map((item) => ({
            formId: item.formId,
            label: item.label,
            moduleLabel: group.label,
          })))}
        />
      </div>
    )
  }

  if (selectedGroup) {
    return (
      <div className="form-builder">
        <div className="form-builder__toolbar">
          <button type="button" className="form-builder__back" onClick={handleBack}>
            All modules
          </button>
          <div>
            <h3 className="form-builder__heading">{selectedGroup.label}</h3>
            <p className="form-builder__sub">Choose which form to design for this company.</p>
          </div>
        </div>
        {selectedGroup.info && !selectedGroup.forms.length ? (
          <div className="form-builder__empty">
            <h3>{selectedGroup.label}</h3>
            <p>{selectedGroup.info}</p>
          </div>
        ) : (
          <div className="form-builder__grid">
            {selectedGroup.forms.map((item) => (
              <button
                key={item.formId}
                type="button"
                className="form-builder__card"
                onClick={() => setFormId(item.formId)}
              >
                <span className="form-builder__card-icon"><ModuleIcon /></span>
                <span className="form-builder__card-title">{item.label}</span>
                <span className="form-builder__card-meta">Design sections and fields</span>
                {defaultFormIds.has(item.formId) && (
                  <span className="form-builder__card-badge">Default form</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="form-builder">
      <div className="form-builder__intro">
        <h3 className="form-builder__heading">Form Builder</h3>
        <p className="form-builder__sub">
          Configure Work Request, Work Order processes (WR→WO, PM→WO, Manual, User Self), PM Schedule, and Warranty Manager forms.
          Open a card to choose sections and fields, then drag, resize, and save.
          Mark a form as the default so every new company starts with it.
        </p>
      </div>
      <div className="form-builder__grid">
        {enabledGroups.map((group) => (
          <button
            key={group.moduleId}
            type="button"
            className="form-builder__card"
            onClick={() => openModule(group)}
          >
            <span className="form-builder__card-icon"><ModuleIcon /></span>
            <span className="form-builder__card-title">{group.label}</span>
            <span className="form-builder__card-meta">
              {group.forms.length
                ? `${group.forms.length} form${group.forms.length === 1 ? '' : 's'}`
                : 'No configurable form'}
            </span>
            {group.forms.some((item) => defaultFormIds.has(item.formId)) && (
              <span className="form-builder__card-badge">Default form</span>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
