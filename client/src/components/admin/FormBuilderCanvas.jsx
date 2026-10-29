import { useEffect, useMemo, useState } from 'react'
import {
  catalogId,
  cloneLayout,
  customFieldId,
  customSectionId,
  emptyLayout,
  FIELD_WIDTH_LABELS,
  FILLED_BY_LABELS,
  FILLED_BY_VALUES,
  SECTION_STAGE_LABELS,
  SECTION_STAGE_VALUES,
  defaultColSpanForType,
  fieldWidthFromDelta,
  layoutSignature,
  nextFieldWidth,
  normalizeColSpan,
  normalizeFilledBy,
  normalizeStage,
  parseLayoutId,
  repeatableGroupId,
} from '../../lib/formLayoutIds'
import { getFormDef } from '../../lib/formRegistry'
import ReuseSectionDialog from './ReuseSectionDialog'
import { getMasterSource, nativeColumnFor, publicMasterSources, canFilterMasterBy } from '../../lib/formFieldSources'
import { augmentLayoutWithEquipmentCatalog, isEquipmentMasterField } from '../../lib/equipmentLayoutFields'
import { defaultQrFieldId } from '../../lib/equipmentQr'
import {
  ASSET_FIELD_TYPES,
  fieldTypeLabel,
  fieldTypeSupportsOptions,
} from '../../lib/assetFieldTypes'
import {
  countOptionRules,
  normalizeOptions,
  optionLabel,
  optionValue,
} from '../../lib/formOptionRules'

const EMPTY_OPTION = { label: '', value: '', rules: [] }

function emptyOptionDraft() {
  return { ...EMPTY_OPTION, rules: [] }
}

/** Keep empty labels / incomplete rules while editing — normalize only on save. */
function optionsForEditor(list) {
  if (!Array.isArray(list) || !list.length) return [emptyOptionDraft()]
  return list.map((item) => {
    if (item == null) return emptyOptionDraft()
    if (typeof item === 'string' || typeof item === 'number') {
      const label = String(item)
      return { label, value: label, rules: [] }
    }
    return {
      label: String(item.label ?? ''),
      value: String(item.value ?? ''),
      rules: Array.isArray(item.rules)
        ? item.rules.map((rule) => ({
          targetFieldId: String(rule?.targetFieldId || ''),
          action: String(rule?.action || 'show'),
          ...(rule?.sourceFieldId ? { sourceFieldId: String(rule.sourceFieldId) } : {}),
        }))
        : [],
    }
  })
}

function DragHandle() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <circle cx="4.5" cy="3.5" r="1" fill="currentColor" />
      <circle cx="9.5" cy="3.5" r="1" fill="currentColor" />
      <circle cx="4.5" cy="7" r="1" fill="currentColor" />
      <circle cx="9.5" cy="7" r="1" fill="currentColor" />
      <circle cx="4.5" cy="10.5" r="1" fill="currentColor" />
      <circle cx="9.5" cy="10.5" r="1" fill="currentColor" />
    </svg>
  )
}

function ChevronIcon({ collapsed }) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path
        d={collapsed ? 'M4.5 2.5 L8.5 6 L4.5 9.5' : 'M2.5 4.5 L6 8.5 L9.5 4.5'}
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function reindex(items) {
  return items.map((item, index) => ({ ...item, order: index }))
}

function moveItem(items, fromId, toId) {
  const current = [...items]
  const fromIndex = current.findIndex((item) => item.id === fromId)
  const toIndex = current.findIndex((item) => item.id === toId)
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return items
  const [moved] = current.splice(fromIndex, 1)
  current.splice(toIndex, 0, moved)
  return reindex(current)
}

function fieldPayload(extra, sectionId, order) {
  const label = typeof extra.label === 'string' ? extra.label.trim() : ''
  const fieldType = extra.fieldType || (extra.masterSource ? 'dropdown' : '')
  const masterSource = extra.masterSource || ''
  const bindKey = extra.bindKey || ''
  const options = !masterSource && fieldTypeSupportsOptions(fieldType)
    ? normalizeOptions(extra.options)
    : []
  const dependsOnFieldId = extra.dependsOnFieldId || ''
  const dependsOnOptions = dependsOnFieldId
    ? normalizeOptions(extra.dependsOnOptions).map((item) => item.value || item.label)
    : []
  const filterByFieldId = masterSource && extra.filterByFieldId ? extra.filterByFieldId : ''
  const equipmentColumnId = !masterSource && extra.equipmentColumnId
    ? String(extra.equipmentColumnId).trim()
    : ''
  const defaultToCurrentUser = (masterSource === 'employees' || masterSource === 'employees_multi')
    && Boolean(extra.defaultToCurrentUser)
  return {
    id: extra.id,
    ...(sectionId ? { sectionId } : {}),
    order,
    colSpan: normalizeColSpan(extra.colSpan, 25),
    required: Boolean(extra.required),
    ...(label ? { label } : {}),
    ...(fieldType ? { fieldType } : {}),
    ...(masterSource ? { masterSource } : {}),
    ...(bindKey ? { bindKey } : {}),
    ...(!equipmentColumnId && options.length ? { options } : {}),
    ...(equipmentColumnId ? { equipmentColumnId, fieldType: fieldType || 'dropdown' } : {}),
    ...(dependsOnFieldId ? { dependsOnFieldId } : {}),
    ...(dependsOnOptions.length ? { dependsOnOptions } : {}),
    ...(filterByFieldId ? { filterByFieldId } : {}),
    ...(defaultToCurrentUser ? { defaultToCurrentUser: true } : {}),
  }
}

function usedBindKeys(layout) {
  return new Set((layout?.fields || []).map((field) => field.bindKey).filter(Boolean))
}

function suggestedBindKey(formId, layout, masterSource, currentId = null) {
  const used = usedBindKeys(layout)
  const current = (layout?.fields || []).find((field) => field.id === currentId)
  if (current?.bindKey) used.delete(current.bindKey)

  if (formId === 'work_request.create' && masterSource === 'departments') {
    if (!used.has('order_from_department_id')) return 'order_from_department_id'
    if (!used.has('order_to_department_id')) return 'order_to_department_id'
  }

  const column = nativeColumnFor(formId, masterSource)
  if (column && !used.has(column)) return column
  return ''
}

function bindOptionsFor(formDef) {
  return (formDef?.systemFields || [])
    .filter((field) => !field.compound)
    .map((field) => ({ key: field.key, label: field.label }))
}

function buildParentCandidates(layout, catalogParents, excludeId) {
  const candidates = []
  for (const field of layout?.fields || []) {
    if (field.id === excludeId) continue
    const parsed = parseLayoutId(field.id)
    if (parsed.kind === 'field' || parsed.kind === 'master') {
      const options = normalizeOptions(field.options)
      if (!options.length) continue
      candidates.push({
        id: field.id,
        label: field.label || 'Field',
        options,
      })
      continue
    }
    if (parsed.kind === 'catalog') {
      const cat = (catalogParents || []).find((row) => catalogId(row.id) === field.id)
      if (!cat || !fieldTypeSupportsOptions(cat.field_type)) continue
      const options = normalizeOptions(cat.dropdown_options)
      if (!options.length) continue
      candidates.push({
        id: field.id,
        label: cat.name || field.label || 'Field',
        options,
      })
    }
  }
  return candidates
}

function FieldEditor({
  draft,
  masters,
  equipmentColumns = [],
  bindOptions,
  parentCandidates,
  ruleTargetFields,
  filterByCandidates = [],
  groupMode = false,
  onChange,
  onSave,
  onClose,
}) {
  const mapped = !groupMode && Boolean(draft.masterSource)
  const columnMapped = !groupMode && !mapped && Boolean(draft.equipmentColumnId)
  const fieldType = mapped || columnMapped ? 'dropdown' : (draft.fieldType || 'text')
  const showOptions = !mapped && !columnMapped && fieldTypeSupportsOptions(fieldType)
  const options = showOptions ? optionsForEditor(draft.options) : []
  const isDependent = Boolean(draft.dependsOnFieldId)
  const selectedParent = parentCandidates.find((item) => item.id === draft.dependsOnFieldId) || null
  const selectedDepends = new Set(
    normalizeOptions(draft.dependsOnOptions).map((item) => item.value),
  )

  const updateOption = (index, patch) => {
    const next = options.map((item, i) => (i === index ? { ...item, ...patch } : item))
    onChange({ ...draft, options: next })
  }

  const updateOptionRule = (optionIndex, ruleIndex, patch) => {
    const option = options[optionIndex]
    const rules = [...(option.rules || [])]
    rules[ruleIndex] = { ...rules[ruleIndex], ...patch }
    updateOption(optionIndex, { rules })
  }

  return (
    <div className="form-builder-editor" role="dialog" aria-modal="true">
      <div className="form-builder-editor__card form-builder-editor__card--wide">
        <h4>{draft.isNew ? (groupMode ? 'Add row field' : 'Add field') : (groupMode ? 'Edit row field' : 'Edit field')}</h4>
        <p>
          {groupMode
            ? 'Fields in a repeatable group are cloned for each row at runtime (e.g. each permit). Rules apply within the same row only.'
            : 'Name the field and choose a type. On each option, add rules to show, hide, copy, or exclude another field\'s value from a list.'}
        </p>
        <label className="company-form__field">
          <span className="company-form__label">Field name</span>
          <input
            className="company-form__input"
            value={draft.label}
            onChange={(event) => onChange({ ...draft, label: event.target.value })}
            placeholder={groupMode ? 'Permit type' : 'Request Type'}
            autoFocus
          />
        </label>
        <label className="company-form__field">
          <span className="company-form__label">Type</span>
          <select
            className="company-form__input"
            value={fieldType}
            onChange={(event) => {
              const nextType = event.target.value
              onChange({
                ...draft,
                fieldType: nextType,
                options: fieldTypeSupportsOptions(nextType)
                  ? optionsForEditor(draft.options)
                  : [],
              })
            }}
            disabled={mapped || columnMapped}
          >
            {ASSET_FIELD_TYPES.map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </select>
        </label>
        {!groupMode && (
        <label className="company-form__field">
          <span className="company-form__label">Map to master</span>
          <select
            className="company-form__input"
            value={draft.masterSource || ''}
            onChange={(event) => {
              const masterSource = event.target.value
              onChange({
                ...draft,
                masterSource,
                equipmentColumnId: masterSource ? '' : (draft.equipmentColumnId || ''),
                fieldType: masterSource ? 'dropdown' : (draft.fieldType || 'text'),
                options: masterSource ? [] : optionsForEditor(draft.options),
                filterByFieldId: masterSource ? (draft.filterByFieldId || '') : '',
                defaultToCurrentUser: (masterSource === 'employees' || masterSource === 'employees_multi')
                  ? Boolean(draft.defaultToCurrentUser)
                  : false,
              })
            }}
          >
            <option value="">None (hardcoded options)</option>
            {masters.map((master) => (
              <option key={master.id} value={master.id}>{master.label}</option>
            ))}
          </select>
        </label>
        )}
        {!groupMode && !mapped && (
        <label className="company-form__field">
          <span className="company-form__label">Map column from asset master</span>
          <select
            className="company-form__input"
            value={draft.equipmentColumnId || ''}
            onChange={(event) => {
              const equipmentColumnId = event.target.value
              onChange({
                ...draft,
                equipmentColumnId,
                masterSource: '',
                fieldType: equipmentColumnId ? 'dropdown' : (draft.fieldType || 'text'),
                options: equipmentColumnId ? [] : optionsForEditor(draft.options),
                filterByFieldId: '',
              })
            }}
          >
            <option value="">None</option>
            {equipmentColumns.map((column) => (
              <option key={column.id} value={column.id}>{column.name}</option>
            ))}
          </select>
          <p className="form-builder-editor__hint">
            Lists the values stored in that asset column, such as Asset Type.
            This does not list asset records.
          </p>
        </label>
        )}
        {!groupMode && mapped && (
          <label className="company-form__field">
            <span className="company-form__label">Filter options by field</span>
            <select
              className="company-form__input"
              value={draft.filterByFieldId || ''}
              onChange={(event) => onChange({
                ...draft,
                filterByFieldId: event.target.value,
              })}
            >
              <option value="">None (show all)</option>
              {filterByCandidates.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label} ({item.masterLabel})
                </option>
              ))}
            </select>
            <p className="form-builder-editor__hint">
              Example: Area filtered by Order To (Department), then Asset filtered by Area.
              Only matching records appear in the picker.
            </p>
          </label>
        )}
        {!groupMode && (draft.masterSource === 'employees' || draft.masterSource === 'employees_multi') && (
          <div className="form-builder-editor__dependency">
            <label className="form-builder-board__required">
              <input
                type="checkbox"
                checked={Boolean(draft.defaultToCurrentUser)}
                onChange={(event) => onChange({
                  ...draft,
                  defaultToCurrentUser: event.target.checked,
                })}
              />
              Default to the logged-in user
            </label>
            <p className="form-builder-editor__hint">
              On a new form, this field starts with the employee who is signed in.
              They can still change the selection before saving.
            </p>
          </div>
        )}
        {showOptions && (
          <div className="form-builder-editor__options">
            <span className="company-form__label">Options & rules</span>
            <p className="form-builder-editor__hint">
              Label is shown to users. Value is stored (and used for Also save as).
              Rules on an option control other fields when that option is selected.
              Use Copy from for Intra (Order To = Order From). Use Exclude source for Inter
              (Order From removed from Order To list).
            </p>
            {options.map((opt, index) => (
              <div key={index} className="form-builder-editor__option-block">
                <div className="form-builder-editor__option-row">
                  <input
                    className="company-form__input"
                    value={opt.label}
                    onChange={(event) => {
                      const label = event.target.value
                      const nextValue = opt.value && opt.value !== slugFromLabel(opt.label)
                        ? opt.value
                        : slugFromLabel(label)
                      updateOption(index, { label, value: nextValue || opt.value })
                    }}
                    placeholder="Label"
                  />
                  <input
                    className="company-form__input"
                    value={opt.value}
                    onChange={(event) => updateOption(index, { value: event.target.value })}
                    placeholder="Value"
                  />
                  {options.length > 1 && (
                    <button
                      type="button"
                      className="company-btn company-btn--ghost"
                      onClick={() => onChange({
                        ...draft,
                        options: options.filter((_, i) => i !== index),
                      })}
                      aria-label="Remove option"
                    >
                      ×
                    </button>
                  )}
                </div>
                <div className="form-builder-editor__rules">
                  <span className="form-builder-editor__rules-label">Rules for this option</span>
                  {(opt.rules || []).map((rule, ruleIndex) => (
                    <div key={ruleIndex} className="form-builder-editor__rule-row">
                      <select
                        className="company-form__input"
                        value={rule.targetFieldId || ''}
                        onChange={(event) => updateOptionRule(index, ruleIndex, {
                          targetFieldId: event.target.value,
                        })}
                      >
                        <option value="">Target field…</option>
                        {ruleTargetFields.map((item) => (
                          <option key={item.id} value={item.id}>{item.label}</option>
                        ))}
                      </select>
                      <select
                        className="company-form__input"
                        value={rule.action || 'show'}
                        onChange={(event) => updateOptionRule(index, ruleIndex, {
                          action: event.target.value,
                          ...(!['copyFrom', 'excludeFrom'].includes(event.target.value)
                            ? { sourceFieldId: undefined }
                            : {}),
                        })}
                      >
                        <option value="show">Show</option>
                        <option value="hide">Hide</option>
                        <option value="copyFrom">Copy from…</option>
                        <option value="excludeFrom">Exclude source from list…</option>
                      </select>
                      {(rule.action === 'copyFrom' || rule.action === 'excludeFrom') && (
                        <select
                          className="company-form__input"
                          value={rule.sourceFieldId || ''}
                          onChange={(event) => updateOptionRule(index, ruleIndex, {
                            sourceFieldId: event.target.value,
                          })}
                        >
                          <option value="">Source field…</option>
                          {ruleTargetFields.map((item) => (
                            <option key={item.id} value={item.id}>{item.label}</option>
                          ))}
                        </select>
                      )}
                      <button
                        type="button"
                        className="company-btn company-btn--ghost"
                        onClick={() => updateOption(index, {
                          rules: (opt.rules || []).filter((_, i) => i !== ruleIndex),
                        })}
                        aria-label="Remove rule"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="company-btn company-btn--ghost"
                    onClick={() => updateOption(index, {
                      rules: [...(opt.rules || []), { targetFieldId: '', action: 'show' }],
                    })}
                  >
                    + Add rule
                  </button>
                  {!ruleTargetFields.length && (
                    <p className="form-builder-editor__hint">
                      Add other fields to the form first so rules can target them.
                    </p>
                  )}
                </div>
              </div>
            ))}
            <button
              type="button"
              className="company-btn company-btn--secondary"
              onClick={() => onChange({ ...draft, options: [...options, emptyOptionDraft()] })}
            >
              + Add option
            </button>
          </div>
        )}

        <div className="form-builder-editor__dependency">
          <label className="form-builder-board__required">
            <input
              type="checkbox"
              checked={isDependent}
              onChange={(event) => {
                const enabled = event.target.checked
                onChange({
                  ...draft,
                  dependsOnFieldId: enabled ? (draft.dependsOnFieldId || parentCandidates[0]?.id || '') : '',
                  dependsOnOptions: enabled ? (draft.dependsOnOptions || []) : [],
                })
              }}
              disabled={!parentCandidates.length && !isDependent}
            />
            Depends on parent field (simple show-when)
          </label>
          {!parentCandidates.length && (
            <p className="form-builder-editor__hint">
              Prefer option rules above for show / hide / copy. Simple depends-on still works.
            </p>
          )}
          {isDependent && parentCandidates.length > 0 && (
            <>
              <label className="company-form__field">
                <span className="company-form__label">Parent field</span>
                <select
                  className="company-form__input"
                  value={draft.dependsOnFieldId || ''}
                  onChange={(event) => onChange({
                    ...draft,
                    dependsOnFieldId: event.target.value,
                    dependsOnOptions: [],
                  })}
                >
                  <option value="">Select parent…</option>
                  {parentCandidates.map((item) => (
                    <option key={item.id} value={item.id}>{item.label}</option>
                  ))}
                </select>
              </label>
              {selectedParent && (
                <div className="form-builder-editor__options">
                  <span className="company-form__label">Show when parent is</span>
                  <div className="form-builder-editor__dep-options">
                    {selectedParent.options.map((opt) => {
                      const value = optionValue(opt)
                      const checked = selectedDepends.has(value)
                      return (
                        <label key={value} className="form-builder-editor__dep-option">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              const next = new Set(selectedDepends)
                              if (checked) next.delete(value)
                              else next.add(value)
                              onChange({ ...draft, dependsOnOptions: [...next] })
                            }}
                          />
                          <span>{optionLabel(opt)}</span>
                        </label>
                      )
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {!groupMode && bindOptions.length > 0 && (
          <label className="company-form__field">
            <span className="company-form__label">Also save as</span>
            <select
              className="company-form__input"
              value={draft.bindKey || ''}
              onChange={(event) => onChange({ ...draft, bindKey: event.target.value })}
            >
              <option value="">Form field only</option>
              {bindOptions.map((item) => (
                <option key={item.key} value={item.key}>{item.label}</option>
              ))}
            </select>
          </label>
        )}
        <div className="form-builder-editor__actions">
          <button type="button" className="company-btn company-btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="company-btn company-btn--primary"
            onClick={onSave}
            disabled={
              !String(draft.label || '').trim()
              || (isDependent && (!draft.dependsOnFieldId || !normalizeOptions(draft.dependsOnOptions).length))
            }
          >
            {draft.isNew ? 'Add field' : 'Save field'}
          </button>
        </div>
      </div>
    </div>
  )
}

function slugFromLabel(label) {
  return String(label || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

export default function FormBuilderCanvas({
  payload,
  loading,
  saving,
  marking = false,
  error,
  onBack,
  onSave,
  onMarkDefault,
  onGoToSections,
  formChoices = [],
}) {
  const form = payload?.form
  const formDef = form?.formId ? getFormDef(form.formId) : null
  const [layout, setLayout] = useState(null)
  const [selectedSectionId, setSelectedSectionId] = useState(null)
  const [selectedFieldId, setSelectedFieldId] = useState(null)
  const [selectedGroupId, setSelectedGroupId] = useState(null)
  const [dragging, setDragging] = useState(null)
  const [dropTargetSectionId, setDropTargetSectionId] = useState(null)
  const [resizingId, setResizingId] = useState(null)
  const [localError, setLocalError] = useState(null)
  const [paletteSectionId, setPaletteSectionId] = useState(null)
  const [openSystemSection, setOpenSystemSection] = useState(null)
  const [editor, setEditor] = useState(null)
  const [reuseSectionId, setReuseSectionId] = useState(null)
  const [collapsedSectionIds, setCollapsedSectionIds] = useState(() => new Set())

  const savedLayout = payload?.layout || null
  const defaultLayout = payload?.defaultLayout || emptyLayout()
  const seedLayout = savedLayout || defaultLayout

  useEffect(() => {
    setLayout(cloneLayout(seedLayout))
    setSelectedSectionId(seedLayout.sections?.[0]?.id || null)
    setSelectedFieldId(null)
    setCollapsedSectionIds(new Set())
    setLocalError(null)
  }, [layoutSignature(seedLayout)])

  const dirty = useMemo(() => (
    layoutSignature(layout) !== layoutSignature(seedLayout)
  ), [layout, seedLayout])

  const canSave = Boolean(layout) && (dirty || !savedLayout)

  const systemSectionById = useMemo(() => (
    new Map((formDef?.systemSections || []).map((item) => [item.id, item]))
  ), [formDef])

  const systemFieldById = useMemo(() => (
    new Map((formDef?.systemFields || []).map((item) => [item.id, item]))
  ), [formDef])

  const masters = payload?.masters?.length ? payload.masters : publicMasterSources()
  const bindOptions = useMemo(() => bindOptionsFor(formDef), [formDef])

  const catalogSections = payload?.catalog?.sections || []
  const catalogParents = useMemo(() => {
    const rows = payload?.catalog?.parents || []
    if (formDef?.catalogMode === 'equipment') {
      return rows.filter((row) => row.field_source === 'equipment')
    }
    return rows
  }, [payload?.catalog?.parents, formDef?.catalogMode])

  const equipmentColumns = useMemo(() => (
    (payload?.catalog?.parents || [])
      .filter((row) => (
        row.field_source === 'equipment'
        && row.kind !== 'child'
        && row.is_active !== false
        && row.field_type !== 'image'
        && row.field_type !== 'file'
      ))
      .map((row) => ({ id: row.id, name: row.name || 'Column' }))
      .sort((a, b) => a.name.localeCompare(b.name))
  ), [payload?.catalog?.parents])

  const parentCandidates = useMemo(() => {
    if (editor?.groupId && layout) {
      const group = (layout.groups || []).find((item) => item.id === editor.groupId)
      if (!group) return []
      return (group.childFields || [])
        .filter((field) => field.id !== editor?.id)
        .map((field) => {
          const options = normalizeOptions(field.options)
          if (!options.length) return null
          return { id: field.id, label: field.label || 'Field', options }
        })
        .filter(Boolean)
    }
    return buildParentCandidates(layout, catalogParents, editor?.id || null)
  }, [layout, catalogParents, editor?.id, editor?.groupId])

  const ruleTargetFields = useMemo(() => {
    if (!layout) return []
    if (editor?.groupId) {
      const group = (layout.groups || []).find((item) => item.id === editor.groupId)
      return (group?.childFields || [])
        .filter((field) => field.id !== editor?.id)
        .map((field) => ({ id: field.id, label: field.label || 'Field' }))
    }
    return (layout.fields || [])
      .filter((field) => field.id !== editor?.id)
      .map((field) => {
        const parsed = parseLayoutId(field.id)
        const sys = systemFieldById.get(field.id)
        const cat = catalogParents.find((row) => catalogId(row.id) === field.id)
        const master = getMasterSource(field.masterSource || (parsed.kind === 'master' ? parsed.value : ''))
        return {
          id: field.id,
          label: field.label || sys?.label || cat?.name || master?.label || parsed.value,
        }
      })
  }, [layout, editor?.id, editor?.groupId, systemFieldById, catalogParents])

  const filterByCandidates = useMemo(() => {
    if (!layout || !editor?.masterSource || editor?.groupId) return []
    return (layout.fields || [])
      .filter((field) => field.id !== editor?.id)
      .map((field) => {
        const parsed = parseLayoutId(field.id)
        const parentSource = field.masterSource
          || (parsed.kind === 'master' ? parsed.value : '')
        if (!parentSource || !canFilterMasterBy(editor.masterSource, parentSource)) return null
        const master = getMasterSource(parentSource)
        return {
          id: field.id,
          label: field.label || master?.label || parentSource,
          masterLabel: master?.label || parentSource,
          masterSource: parentSource,
        }
      })
      .filter(Boolean)
  }, [layout, editor?.id, editor?.masterSource, editor?.groupId])

  const parentsBySection = useMemo(() => {
    const map = new Map()
    for (const parent of catalogParents) {
      const key = parent.section_id || 'none'
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(parent)
    }
    return map
  }, [catalogParents])

  const usedFieldIds = useMemo(
    () => new Set((layout?.fields || []).map((field) => field.id)),
    [layout],
  )
  const usedSectionIds = useMemo(
    () => new Set((layout?.sections || []).map((section) => section.id)),
    [layout],
  )
  const compoundBlocks = useMemo(() => {
    const seen = new Set()
    const blocks = []
    for (const item of formDef?.systemFields || []) {
      if (!item?.compound || seen.has(item.id)) continue
      seen.add(item.id)
      blocks.push(item)
    }
    return blocks
  }, [formDef])

  const canvasSections = useMemo(() => {
    const canvasLayout = augmentLayoutWithEquipmentCatalog(layout, catalogParents)
    if (!canvasLayout) return []
    if (!Array.isArray(canvasLayout.groups)) canvasLayout.groups = []
    return [...canvasLayout.sections]
      .sort((a, b) => a.order - b.order)
      .map((section) => {
        const system = systemSectionById.get(section.id)
        const catalog = catalogSections.find((row) => catalogId(row.id) === section.id)
        const parsed = parseLayoutId(section.id)
        const fields = (canvasLayout.fields || [])
          .filter((field) => field.sectionId === section.id)
          .sort((a, b) => a.order - b.order)
          .map((field) => {
            const sysField = systemFieldById.get(field.id)
            const catField = catalogParents.find((row) => catalogId(row.id) === field.id)
            const fieldParsed = parseLayoutId(field.id)
            const masterSource = field.masterSource || (fieldParsed.kind === 'master' ? fieldParsed.value : '')
            const master = getMasterSource(masterSource) || masters.find((row) => row.layoutId === field.id)
            const editable = fieldParsed.kind === 'field' || fieldParsed.kind === 'master'
            return {
              ...field,
              label: field.label || sysField?.label || catField?.name || master?.label || fieldParsed.value,
              fieldType: field.fieldType
                || sysField?.fieldType
                || catField?.field_type
                || (master ? 'dropdown' : 'text'),
              masterSource,
              compound: Boolean(sysField?.compound),
              required: Boolean(field.required),
              editable,
              autoFromEquipment: Boolean(field.autoFromEquipment),
              mappedLabel: master?.label,
              options: (Array.isArray(field.options) && field.options.length
                ? field.options
                : (catField?.dropdown_options || [])),
              dependsOnFieldId: field.dependsOnFieldId || '',
              dependsOnOptions: Array.isArray(field.dependsOnOptions) ? field.dependsOnOptions : [],
            }
          })
        const groups = (canvasLayout.groups || [])
          .filter((group) => group.sectionId === section.id)
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
          .map((group) => ({
            ...group,
            label: group.label || 'Items',
            minRows: Number(group.minRows) || 0,
            maxRows: Number(group.maxRows) || 20,
            childFields: [...(group.childFields || [])]
              .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
              .map((field) => ({
                ...field,
                label: field.label || 'Field',
                fieldType: field.fieldType || 'text',
                editable: true,
                options: Array.isArray(field.options) ? field.options : [],
              })),
          }))
        return {
          ...section,
          label: section.label || system?.label || catalog?.name || (parsed.kind === 'custom' ? 'Section' : parsed.value),
          custom: parsed.kind === 'custom',
          filledBy: normalizeFilledBy(section.filledBy),
          stage: normalizeStage(section.stage),
          fields,
          groups,
        }
      })
  }, [layout, systemSectionById, systemFieldById, catalogSections, catalogParents, masters])

  const ensureSection = (current, sectionId, label, extra = {}) => {
    if (!Array.isArray(current.groups)) current.groups = []
    if (current.sections.some((section) => section.id === sectionId)) return current
    const filledBy = extra.filledBy && extra.filledBy !== 'any' ? extra.filledBy : ''
    const stage = extra.stage || ''
    current.sections = reindex([
      ...current.sections,
      {
        id: sectionId,
        order: current.sections.length,
        ...(label ? { label } : {}),
        ...(filledBy ? { filledBy } : {}),
        ...(stage ? { stage } : {}),
      },
    ])
    return current
  }

  const expandSection = (sectionId) => {
    if (!sectionId) return
    setCollapsedSectionIds((prev) => {
      if (!prev.has(sectionId)) return prev
      const next = new Set(prev)
      next.delete(sectionId)
      return next
    })
  }

  const toggleSectionCollapsed = (sectionId) => {
    setCollapsedSectionIds((prev) => {
      const next = new Set(prev)
      if (next.has(sectionId)) next.delete(sectionId)
      else next.add(sectionId)
      return next
    })
  }

  const collapseAllSections = () => {
    setCollapsedSectionIds(new Set((layout?.sections || []).map((section) => section.id)))
  }

  const expandAllSections = () => {
    setCollapsedSectionIds(new Set())
  }

  const addSection = (sectionId, extraFields = [], label, extra = {}) => {
    setSelectedSectionId(sectionId)
    expandSection(sectionId)
    setLayout((prev) => {
      const current = cloneLayout(prev)
      ensureSection(current, sectionId, label, extra)
      for (const extra of extraFields) {
        if (current.fields.some((field) => field.id === extra.id)) continue
        const siblings = current.fields.filter((field) => field.sectionId === sectionId)
        current.fields.push(fieldPayload(extra, sectionId, siblings.length))
      }
      return current
    })
  }

  const addField = (fieldId, sectionId, colSpan = 25, required = false, extra = {}) => {
    const target = sectionId || selectedSectionId
    if (!target) {
      const created = customSectionId()
      addSection(created, [{ id: fieldId, colSpan: normalizeColSpan(colSpan, 25), required, ...extra }], 'Section')
      return
    }
    addSection(target, [{ id: fieldId, colSpan: normalizeColSpan(colSpan, 25), required, ...extra }])
  }

  const addBlockToSelectedSection = (item) => {
    if (!item?.id || usedFieldIds.has(item.id)) return
    if (!selectedSectionId) {
      setLocalError('Select a section on the canvas, then click a Block to add it there.')
      return
    }
    setLocalError(null)
    addField(item.id, selectedSectionId, item.colSpan || 100, item.required)
  }

  const addSystemSection = (section) => {
    addSection(section.id, section.fields.map((item) => ({
      id: item.id,
      colSpan: normalizeColSpan(item.colSpan, 25),
      required: Boolean(item.required),
    })), section.label, { filledBy: section.filledBy, stage: section.stage })
  }

  const addCustomSection = () => {
    const id = customSectionId()
    addSection(id, [], 'New section')
  }

  const addEquipmentPicker = () => {
    const existingSection = selectedSectionId
      && layout?.sections?.some((section) => section.id === selectedSectionId)
    const sectionId = existingSection ? selectedSectionId : customSectionId()
    setSelectedSectionId(sectionId)
    setLayout((prev) => {
      const current = cloneLayout(prev || emptyLayout())
      if (!current.sections.some((section) => section.id === sectionId)) {
        ensureSection(current, sectionId, 'Asset information')
      }
      const inSection = () => current.fields.filter((field) => field.sectionId === sectionId)
      const sourceOf = (field) => {
        if (field.masterSource) return field.masterSource
        const parsed = parseLayoutId(field.id)
        return parsed.kind === 'master' ? parsed.value : ''
      }
      let area = inSection().find((field) => sourceOf(field) === 'areas')
      if (!area) {
        const id = customFieldId()
        current.fields.push(fieldPayload({
          id,
          label: 'Area',
          fieldType: 'dropdown',
          masterSource: 'areas',
          bindKey: suggestedBindKey(form?.formId, current, 'areas'),
          colSpan: 25,
        }, sectionId, inSection().length))
        area = current.fields.find((field) => field.id === id)
      }
      const equipment = inSection().find(isEquipmentMasterField)
      if (!equipment) {
        current.fields.push(fieldPayload({
          id: customFieldId(),
          label: 'Asset',
          fieldType: 'dropdown',
          masterSource: 'equipment',
          filterByFieldId: area?.id || '',
          bindKey: suggestedBindKey(form?.formId, current, 'equipment'),
          colSpan: 25,
          required: true,
        }, sectionId, inSection().length))
      } else if (!equipment.filterByFieldId && area?.id) {
        equipment.filterByFieldId = area.id
      }
      return augmentLayoutWithEquipmentCatalog(current, catalogParents)
    })
  }

  const addMappedMaster = (master) => {
    const bindKey = suggestedBindKey(form?.formId, layout, master.id)
    const label = form?.formId === 'work_request.create' && master.id === 'departments'
      ? (bindKey === 'order_from_department_id'
        ? 'Order From'
        : bindKey === 'order_to_department_id'
          ? 'Order To'
          : master.label)
      : master.label
    const target = selectedSectionId
    if (!target) {
      const created = customSectionId()
      addSection(created, [], 'Section')
      setEditor({
        isNew: true,
        sectionId: created,
        label,
        fieldType: 'dropdown',
        masterSource: master.id,
        bindKey,
      })
      return
    }
    setEditor({
      isNew: true,
      sectionId: target,
      label,
      fieldType: 'dropdown',
      masterSource: master.id,
      bindKey,
    })
  }

  const openNewFieldEditor = (sectionId, extras = {}) => {
    const target = sectionId || selectedSectionId
    const base = {
      isNew: true,
      label: '',
      fieldType: 'dropdown',
      masterSource: '',
      bindKey: '',
      options: [emptyOptionDraft()],
      dependsOnFieldId: '',
      dependsOnOptions: [],
      filterByFieldId: '',
      defaultToCurrentUser: false,
      ...extras,
    }
    if (!target) {
      const created = customSectionId()
      addSection(created, [], 'Section')
      setEditor({ ...base, sectionId: created })
      return
    }
    setSelectedSectionId(target)
    expandSection(target)
    setEditor({ ...base, sectionId: target })
  }

  const openChildFieldEditor = (parentField, sectionId) => {
    const parentOpts = normalizeOptions(parentField.options)
    openNewFieldEditor(sectionId, {
      label: '',
      fieldType: 'text',
      options: [],
      dependsOnFieldId: parentField.id,
      dependsOnOptions: parentOpts.slice(0, 1).map((item) => item.value),
    })
  }

  const openFieldEditor = (field, groupId = null) => {
    if (!field.editable) return
    setSelectedFieldId(field.id)
    if (groupId) setSelectedGroupId(groupId)
    setEditor({
      isNew: false,
      id: field.id,
      groupId: groupId || null,
      sectionId: field.sectionId || null,
      label: field.label || '',
      fieldType: field.fieldType || 'dropdown',
      masterSource: groupId ? '' : (field.masterSource || ''),
      bindKey: groupId ? '' : (field.bindKey || suggestedBindKey(form?.formId, layout, field.masterSource, field.id)),
      options: optionsForEditor(field.options),
      dependsOnFieldId: field.dependsOnFieldId || '',
      dependsOnOptions: Array.isArray(field.dependsOnOptions) ? [...field.dependsOnOptions] : [],
      filterByFieldId: field.filterByFieldId || '',
      defaultToCurrentUser: Boolean(field.defaultToCurrentUser),
    })
  }

  const openGroupChildEditor = (groupId, sectionId) => {
    setSelectedGroupId(groupId)
    setEditor({
      isNew: true,
      groupId,
      sectionId,
      label: '',
      fieldType: 'dropdown',
      masterSource: '',
      bindKey: '',
      options: [emptyOptionDraft()],
      dependsOnFieldId: '',
      dependsOnOptions: [],
      filterByFieldId: '',
    })
  }

  const addRepeatableGroup = (sectionId) => {
    const target = sectionId || selectedSectionId
    if (!target) {
      const created = customSectionId()
      addSection(created, [], 'Section')
      setLayout((prev) => {
        const current = cloneLayout(prev)
        if (!Array.isArray(current.groups)) current.groups = []
        const id = repeatableGroupId()
        current.groups.push({
          id,
          sectionId: created,
          order: current.groups.filter((g) => g.sectionId === created).length,
          colSpan: 100,
          label: 'Permits',
          minRows: 0,
          maxRows: 20,
          childFields: [],
        })
        setSelectedGroupId(id)
        return current
      })
      return
    }
    setLayout((prev) => {
      const current = cloneLayout(prev)
      if (!Array.isArray(current.groups)) current.groups = []
      const id = repeatableGroupId()
      current.groups.push({
        id,
        sectionId: target,
        order: current.groups.filter((g) => g.sectionId === target).length,
        colSpan: 100,
        label: 'Permits',
        minRows: 0,
        maxRows: 20,
        childFields: [],
      })
      setSelectedSectionId(target)
      expandSection(target)
      setSelectedGroupId(id)
      return current
    })
  }

  const updateGroup = (groupId, patch) => {
    setLayout((prev) => {
      const current = cloneLayout(prev)
      if (!Array.isArray(current.groups)) current.groups = []
      current.groups = current.groups.map((group) => (
        group.id === groupId ? { ...group, ...patch } : group
      ))
      return current
    })
  }

  const removeGroup = (groupId) => {
    setLayout((prev) => {
      const current = cloneLayout(prev)
      if (!Array.isArray(current.groups)) current.groups = []
      current.groups = reindex(current.groups.filter((group) => group.id !== groupId))
      return current
    })
    if (selectedGroupId === groupId) setSelectedGroupId(null)
  }

  const removeGroupChild = (groupId, fieldId) => {
    setLayout((prev) => {
      const current = cloneLayout(prev)
      current.groups = (current.groups || []).map((group) => {
        if (group.id !== groupId) return group
        return {
          ...group,
          childFields: reindex((group.childFields || []).filter((field) => field.id !== fieldId)),
        }
      })
      return current
    })
  }

  const setSectionFilledBy = (sectionId, filledBy) => {
    setLayout((prev) => {
      const current = cloneLayout(prev)
      current.sections = current.sections.map((section) => {
        if (section.id !== sectionId) return section
        const next = normalizeFilledBy(filledBy)
        if (next === 'any') {
          const { filledBy: _drop, ...rest } = section
          return rest
        }
        return { ...section, filledBy: next }
      })
      return current
    })
  }

  const setSectionStage = (sectionId, stage) => {
    setLayout((prev) => {
      const current = cloneLayout(prev)
      current.sections = current.sections.map((section) => {
        if (section.id !== sectionId) return section
        const next = normalizeStage(stage)
        if (!next) {
          const { stage: _drop, ...rest } = section
          return rest
        }
        return { ...section, stage: next }
      })
      return current
    })
  }

  const saveFieldEditor = () => {
    if (!editor) return
    const label = String(editor.label || '').trim()
    if (!label) return
    const masterSource = editor.groupId ? '' : (editor.masterSource || '')
    const equipmentColumnId = !editor.groupId && !masterSource
      ? String(editor.equipmentColumnId || '').trim()
      : ''
    const fieldType = masterSource || equipmentColumnId ? 'dropdown' : (editor.fieldType || 'text')
    const bindKey = editor.groupId ? '' : (editor.bindKey || '')
    const options = !masterSource && !equipmentColumnId && fieldTypeSupportsOptions(fieldType)
      ? normalizeOptions(editor.options)
      : []
    const dependsOnFieldId = editor.dependsOnFieldId || ''
    const dependsOnOptions = dependsOnFieldId
      ? normalizeOptions(editor.dependsOnOptions).map((item) => item.value || item.label)
      : []
    const filterByFieldId = (!editor.groupId && masterSource) ? (editor.filterByFieldId || '') : ''
    const defaultToCurrentUser = !editor.groupId
      && (masterSource === 'employees' || masterSource === 'employees_multi')
      && Boolean(editor.defaultToCurrentUser)
    if (dependsOnFieldId && !dependsOnOptions.length) return

    if (editor.groupId) {
      setLayout((prev) => {
        const current = cloneLayout(prev)
        if (!Array.isArray(current.groups)) current.groups = []
        current.groups = current.groups.map((group) => {
          if (group.id !== editor.groupId) return group
          const children = [...(group.childFields || [])]
          if (editor.isNew) {
            children.push(fieldPayload({
              id: customFieldId(),
              label,
              fieldType,
              colSpan: defaultColSpanForType(fieldType),
              options,
              dependsOnFieldId,
              dependsOnOptions,
            }, undefined, children.length))
          } else {
            const idx = children.findIndex((field) => field.id === editor.id)
            if (idx >= 0) {
              children[idx] = fieldPayload({
                ...children[idx],
                id: children[idx].id,
                label,
                fieldType,
                options,
                dependsOnFieldId,
                dependsOnOptions,
              }, undefined, children[idx].order ?? idx)
            }
          }
          return { ...group, childFields: reindex(children) }
        })
        return current
      })
      setEditor(null)
      return
    }

    if (editor.isNew) {
      addField(customFieldId(), editor.sectionId, defaultColSpanForType(fieldType), false, {
        label,
        fieldType,
        masterSource,
        equipmentColumnId,
        bindKey,
        options,
        dependsOnFieldId,
        dependsOnOptions,
        filterByFieldId,
        defaultToCurrentUser,
      })
      setEditor(null)
      return
    }

    setLayout((prev) => {
      const current = cloneLayout(prev)
      current.fields = current.fields.map((field) => {
        if (field.id !== editor.id) return field
        const parsed = parseLayoutId(field.id)
        const next = {
          ...field,
          id: parsed.kind === 'master' ? customFieldId() : field.id,
          label,
          fieldType,
        }
        if (masterSource) next.masterSource = masterSource
        else delete next.masterSource
        if (equipmentColumnId) next.equipmentColumnId = equipmentColumnId
        else delete next.equipmentColumnId
        if (bindKey) next.bindKey = bindKey
        else delete next.bindKey
        if (options.length) next.options = options
        else delete next.options
        if (dependsOnFieldId) next.dependsOnFieldId = dependsOnFieldId
        else delete next.dependsOnFieldId
        if (dependsOnOptions.length) next.dependsOnOptions = dependsOnOptions
        else delete next.dependsOnOptions
        if (filterByFieldId) next.filterByFieldId = filterByFieldId
        else delete next.filterByFieldId
        if (defaultToCurrentUser) next.defaultToCurrentUser = true
        else delete next.defaultToCurrentUser
        return next
      })
      return current
    })
    setEditor(null)
  }

  const renameSection = (sectionId, label) => {
    setLayout((prev) => {
      const current = cloneLayout(prev)
      current.sections = current.sections.map((section) => (
        section.id === sectionId ? { ...section, label } : section
      ))
      return current
    })
  }

  const applySectionReuse = async (sectionId, formIds) => {
    const membership = formIds.length ? [form?.formId, ...formIds].filter(Boolean) : []
    const next = cloneLayout(layout)
    next.sections = next.sections.map((section) => {
      if (section.id !== sectionId) return section
      const copy = { ...section }
      if (membership.length > 1) copy.sharedWith = membership
      else delete copy.sharedWith
      return copy
    })
    setLayout(next)
    setLocalError(null)
    try {
      await onSave(next)
      setReuseSectionId(null)
    } catch (err) {
      setLocalError(err.message || 'Could not reuse this section')
    }
  }

  const removeSection = (sectionId) => {
    setLocalError(null)
    setLayout((prev) => {
      const current = cloneLayout(prev)
      current.sections = reindex(current.sections.filter((section) => section.id !== sectionId))
      current.fields = current.fields.filter((field) => field.sectionId !== sectionId)
      current.groups = reindex((current.groups || []).filter((group) => group.sectionId !== sectionId))
      return current
    })
    if (selectedSectionId === sectionId) setSelectedSectionId(null)
  }

  const removeField = (fieldId) => {
    setLocalError(null)
    if (selectedFieldId === fieldId) setSelectedFieldId(null)
    setLayout((prev) => {
      const current = cloneLayout(prev)
      const remaining = current.fields.filter((field) => field.id !== fieldId)
      const bySection = new Map()
      for (const field of remaining) {
        if (!bySection.has(field.sectionId)) bySection.set(field.sectionId, [])
        bySection.get(field.sectionId).push(field)
      }
      current.fields = remaining.map((field) => {
        const siblings = bySection.get(field.sectionId) || []
        return { ...field, order: siblings.findIndex((item) => item.id === field.id) }
      })
      return current
    })
  }

  const setColSpan = (fieldId, colSpan) => {
    setLayout((prev) => {
      const current = cloneLayout(prev)
      current.fields = current.fields.map((field) => (
        field.id === fieldId ? { ...field, colSpan: normalizeColSpan(colSpan, 25) } : field
      ))
      return current
    })
  }

  const toggleSpan = (fieldId) => {
    setLayout((prev) => {
      const current = cloneLayout(prev)
      current.fields = current.fields.map((field) => (
        field.id === fieldId
          ? { ...field, colSpan: nextFieldWidth(field.colSpan) }
          : field
      ))
      return current
    })
  }

  const toggleRequired = (fieldId) => {
    setLayout((prev) => {
      const current = cloneLayout(prev)
      current.fields = current.fields.map((field) => (
        field.id === fieldId ? { ...field, required: !field.required } : field
      ))
      return current
    })
  }

  const handleResizePointerDown = (event, field) => {
    event.preventDefault()
    event.stopPropagation()
    const startX = event.clientX
    const startSpan = normalizeColSpan(field.colSpan, 25)
    setResizingId(field.id)
    setSelectedFieldId(field.id)

    const onMove = (moveEvent) => {
      const dx = moveEvent.clientX - startX
      setColSpan(field.id, fieldWidthFromDelta(startSpan, dx))
    }
    const onUp = () => {
      setResizingId(null)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const clearFieldDrag = () => {
    setDragging(null)
    setDropTargetSectionId(null)
  }

  const handleDropSection = (targetId) => {
    if (!dragging || dragging.type !== 'section') return
    setLayout((prev) => {
      const current = cloneLayout(prev)
      current.sections = moveItem(current.sections, dragging.id, targetId)
      return current
    })
    clearFieldDrag()
  }

  const handleDropField = (targetId, sectionId) => {
    if (!dragging || dragging.type !== 'field') return
    setLayout((prev) => {
      const current = cloneLayout(prev)
      const moving = current.fields.find((field) => field.id === dragging.id)
      if (!moving) return current
      moving.sectionId = sectionId
      const others = current.fields.filter((field) => field.id !== moving.id)
      const inSection = others.filter((field) => field.sectionId === sectionId)
      const targetIndex = inSection.findIndex((field) => field.id === targetId)
      if (targetIndex >= 0) inSection.splice(targetIndex, 0, moving)
      else inSection.push(moving)
      const rest = others.filter((field) => field.sectionId !== sectionId)
      current.fields = [
        ...rest,
        ...inSection.map((field, index) => ({ ...field, order: index })),
      ]
      return current
    })
    expandSection(sectionId)
    clearFieldDrag()
  }

  const qrFieldOptions = useMemo(() => {
    if (form?.formId !== 'equipment.create' || !layout) return []
    return (layout.fields || []).map((field) => {
      const system = systemFieldById.get(field.id)
      const parsed = parseLayoutId(field.id)
      const catalog = parsed.kind === 'catalog'
        ? catalogParents.find((row) => row.id === parsed.value)
        : null
      return {
        id: field.id,
        label: field.label || system?.label || catalog?.name || field.id,
      }
    })
  }, [form?.formId, layout, systemFieldById, catalogParents])

  const layoutToSave = () => {
    let toSave = augmentLayoutWithEquipmentCatalog(layout, catalogParents)
    if (form?.formId === 'equipment.create') {
      toSave = { ...toSave, qrFieldId: defaultQrFieldId(toSave) }
    }
    return toSave
  }

  const handleSave = async () => {
    setLocalError(null)
    try {
      const toSave = layoutToSave()
      if (toSave !== layout) setLayout(toSave)
      await onSave(toSave)
    } catch (err) {
      setLocalError(err.message)
    }
  }

  const handleMarkDefault = async () => {
    if (!onMarkDefault) return
    setLocalError(null)
    try {
      const toSave = layoutToSave()
      if (toSave !== layout) setLayout(toSave)
      await onMarkDefault(toSave)
    } catch (err) {
      setLocalError(err.message)
    }
  }

  const handleReset = () => {
    setLayout(cloneLayout(seedLayout))
    setLocalError(null)
  }

  const handleUseCurrent = () => {
    setLayout(cloneLayout(defaultLayout))
    setSelectedSectionId(defaultLayout.sections?.[0]?.id || null)
    setLocalError(null)
  }

  if (loading || !payload || !layout) {
    return <div className="form-builder__loading">Loading form…</div>
  }

  return (
    <div className="form-builder-canvas">
      <div className="form-builder__toolbar">
        <button type="button" className="form-builder__back" onClick={onBack}>
          Back
        </button>
        <div>
          <h3 className="form-builder__heading">{form?.label || 'Form'}</h3>
          <p className="form-builder__sub">
            Select a section, then add a Block from the left — or drag a field onto another section.
            Click width (25% / 33% / 50% / 75% / 100%) or drag the right edge to resize. Save to replace the company form.
          </p>
          {form?.info && (
            <p className="form-builder__inherit">{form.info}</p>
          )}
          {form?.inheritFromFormId && (
            <p className="form-builder__inherit">
              Request fields stay on {form.inheritFromLabel || 'the Work Request form'} and show
              read-only on this work order. Reuse a Work Request section if it must also be editable here.
            </p>
          )}
          {payload?.platformDefault?.isSource && (
            <span className="form-builder__card-badge">Default for new companies</span>
          )}
        </div>
        <div className="form-builder-canvas__actions">
          {form?.formId === 'equipment.create' && qrFieldOptions.length > 0 && (
            <label className="form-builder__qr">
              QR code field
              <select
                value={defaultQrFieldId(layout)}
                onChange={(event) => setLayout((prev) => ({ ...prev, qrFieldId: event.target.value }))}
              >
                {qrFieldOptions.map((option) => (
                  <option key={option.id} value={option.id}>{option.label}</option>
                ))}
              </select>
            </label>
          )}
          <button type="button" className="company-btn company-btn--ghost" onClick={handleUseCurrent} disabled={saving}>
            Use current form
          </button>
          <button type="button" className="company-btn company-btn--ghost" onClick={handleReset} disabled={!dirty || saving}>
            Discard
          </button>
          <button
            type="button"
            className="company-btn company-btn--ghost"
            onClick={handleMarkDefault}
            disabled={saving || marking || !layout?.sections?.length}
          >
            {marking ? 'Marking…' : (payload?.platformDefault?.isSource ? 'Update default' : 'Mark as default')}
          </button>
          <button
            type="button"
            className="company-btn company-btn--primary"
            onClick={handleSave}
            disabled={!canSave || saving || marking}
          >
            {saving ? 'Saving…' : 'Save form'}
          </button>
        </div>
      </div>

      {(error || localError) && (
        <div className="company-alert">{localError || error}</div>
      )}

      <div className="form-builder-canvas__split">
        <aside className="form-builder-palette">
          <button type="button" className="form-builder-palette__add" onClick={addCustomSection}>
            + Add section
          </button>
          <button type="button" className="form-builder-palette__add" onClick={() => openNewFieldEditor(selectedSectionId)}>
            + Add field
          </button>
          <button type="button" className="form-builder-palette__add" onClick={() => addRepeatableGroup(selectedSectionId)}>
            + Add repeatable group
          </button>

          {compoundBlocks.length > 0 && (
            <>
              <div className="form-builder-palette__divider">Blocks</div>
              {!selectedSectionId && (
                <p className="form-builder-palette__empty">
                  Select a section on the canvas, then click a Block to add it there.
                </p>
              )}
              {compoundBlocks.map((item) => {
                const usedField = usedFieldIds.has(item.id)
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`form-builder-palette__field ${usedField ? 'is-used' : ''}`}
                    onClick={() => addBlockToSelectedSection(item)}
                    disabled={usedField}
                  >
                    {item.label}
                    <small>{usedField ? 'Added' : 'Block'}</small>
                  </button>
                )
              })}
            </>
          )}

          <h4>This form</h4>
          {(formDef?.systemSections || []).map((section) => {
            const used = usedSectionIds.has(section.id)
            const open = openSystemSection === section.id
            return (
              <div key={section.id} className="form-builder-palette__group">
                <button
                  type="button"
                  className={`form-builder-palette__item ${used ? 'is-used' : ''} ${selectedSectionId === section.id ? 'is-active' : ''}`}
                  onClick={() => {
                    setOpenSystemSection(open ? null : section.id)
                    if (used) setSelectedSectionId(section.id)
                    else addSystemSection(section)
                  }}
                >
                  <span>{section.label}</span>
                  <small>{used ? 'On form' : 'Add'}</small>
                </button>
                {open && (
                  <div className="form-builder-palette__fields">
                    {section.fields.map((item) => {
                      const usedField = usedFieldIds.has(item.id)
                      return (
                        <button
                          key={item.id}
                          type="button"
                          className={`form-builder-palette__field ${usedField ? 'is-used' : ''}`}
                          onClick={() => {
                            if (usedField) return
                            addField(item.id, selectedSectionId || section.id, item.colSpan || 25, item.required)
                          }}
                        >
                          {item.label}
                          <small>{usedField ? 'Added' : (item.compound ? 'Block' : fieldTypeLabel(item.fieldType))}</small>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}

          <div className="form-builder-palette__divider">Masters</div>
          <button
            type="button"
            className="form-builder-palette__item"
            onClick={addEquipmentPicker}
          >
            <span>Asset picker</span>
            <small>Area and asset fields</small>
          </button>
          {masters.map((master) => (
            <button
              key={master.id}
              type="button"
              className="form-builder-palette__item"
              onClick={() => addMappedMaster(master)}
            >
              <span>{master.label}</span>
              <small>{master.multi ? 'Multi-select' : 'Dropdown'}</small>
            </button>
          ))}

          {formDef?.allowCatalogFields && (
            <>
              <div className="form-builder-palette__divider">
                Catalog
                {onGoToSections && (
                  <button type="button" className="form-builder-palette__link" onClick={onGoToSections}>
                    Manage
                  </button>
                )}
              </div>
              {!catalogSections.length && (
                <p className="form-builder-palette__empty">
                  Create sections first, then add them here.
                </p>
              )}
              {catalogSections.filter((row) => row.is_active !== false).map((section) => {
                const sectionLayoutId = catalogId(section.id)
                const open = paletteSectionId === section.id
                const fields = (parentsBySection.get(section.id) || []).filter((row) => row.is_active !== false)
                return (
                  <div key={section.id} className="form-builder-palette__group">
                    <button
                      type="button"
                      className={`form-builder-palette__item ${usedSectionIds.has(sectionLayoutId) ? 'is-used' : ''}`}
                      onClick={() => {
                        setPaletteSectionId(open ? null : section.id)
                        addSection(sectionLayoutId, [], section.name)
                        setSelectedSectionId(sectionLayoutId)
                      }}
                    >
                      <span>{section.name}</span>
                      <small>{fields.length} fields</small>
                    </button>
                    {open && (
                      <div className="form-builder-palette__fields">
                        {fields.map((parent) => {
                          const id = catalogId(parent.id)
                          const used = usedFieldIds.has(id)
                          return (
                            <button
                              key={parent.id}
                              type="button"
                              className={`form-builder-palette__field ${used ? 'is-used' : ''}`}
                              onClick={() => {
                                if (used) return
                                addField(id, sectionLayoutId, parent.field_type === 'textarea' ? 100 : 25, Boolean(parent.is_required))
                              }}
                            >
                              {parent.name}
                              <small>{used ? 'Added' : fieldTypeLabel(parent.field_type)}</small>
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </>
          )}
        </aside>

        <div className="form-builder-board">
          {canvasSections.length > 0 && (
            <div className="form-builder-board__toolbar">
              <button type="button" className="form-builder-board__fold" onClick={expandAllSections}>
                Expand all
              </button>
              <button type="button" className="form-builder-board__fold" onClick={collapseAllSections}>
                Collapse all
              </button>
            </div>
          )}
          {!canvasSections.length ? (
            <div className="form-builder__empty">
              <h3>Empty form</h3>
              <p>Add a section, then choose Blocks, fields from this form, masters, or Add field.</p>
            </div>
          ) : canvasSections.map((section) => {
            const collapsed = collapsedSectionIds.has(section.id)
            const itemCount = (section.fields?.length || 0) + (section.groups?.length || 0)
            return (
            <section
              key={section.id}
              className={`form-builder-board__section ${selectedSectionId === section.id ? 'is-selected' : ''} ${collapsed ? 'is-collapsed' : ''} ${dragging?.id === section.id ? 'is-dragging' : ''} ${dragging?.type === 'field' && dropTargetSectionId === section.id ? 'is-drop-target' : ''}`}
              onClick={() => setSelectedSectionId(section.id)}
              onDragOver={(event) => {
                event.preventDefault()
                if (dragging?.type === 'field') setDropTargetSectionId(section.id)
              }}
              onDrop={(event) => {
                if (dragging?.type === 'field') {
                  event.stopPropagation()
                  handleDropField(null, section.id)
                  return
                }
                handleDropSection(section.id)
              }}
            >
              <header className="form-builder-board__section-head">
                <span
                  className="form-builder-board__handle"
                  draggable
                  onDragStart={() => setDragging({ type: 'section', id: section.id })}
                  onDragEnd={clearFieldDrag}
                >
                  <DragHandle />
                </span>
                <button
                  type="button"
                  className="form-builder-board__toggle"
                  aria-expanded={!collapsed}
                  aria-label={collapsed ? `Expand ${section.label || 'section'}` : `Collapse ${section.label || 'section'}`}
                  onClick={(event) => {
                    event.stopPropagation()
                    toggleSectionCollapsed(section.id)
                  }}
                >
                  <ChevronIcon collapsed={collapsed} />
                </button>
                <input
                  className="form-builder-board__title-input"
                  value={section.label}
                  onChange={(event) => renameSection(section.id, event.target.value)}
                  onClick={(event) => event.stopPropagation()}
                  onMouseDown={(event) => event.stopPropagation()}
                  aria-label="Section name"
                  placeholder="Section name"
                />
                <label
                  className="form-builder-board__filled-by"
                  onClick={(event) => event.stopPropagation()}
                  title="Who should fill this section"
                >
                  <span>Filled by</span>
                  <select
                    value={section.filledBy || 'any'}
                    onChange={(event) => setSectionFilledBy(section.id, event.target.value)}
                  >
                    {FILLED_BY_VALUES.map((value) => (
                      <option key={value} value={value}>{FILLED_BY_LABELS[value]}</option>
                    ))}
                  </select>
                </label>
                <label
                  className="form-builder-board__filled-by"
                  onClick={(event) => event.stopPropagation()}
                  title="When this section appears on the work order"
                >
                  <span>Stage</span>
                  <select
                    value={section.stage || ''}
                    onChange={(event) => setSectionStage(section.id, event.target.value)}
                  >
                    {SECTION_STAGE_VALUES.map((value) => (
                      <option key={value || 'any'} value={value}>
                        {SECTION_STAGE_LABELS[value] || 'Any stage'}
                      </option>
                    ))}
                  </select>
                </label>
                {section.filledBy && section.filledBy !== 'any' && (
                  <span className="form-builder-board__badge">
                    {FILLED_BY_LABELS[section.filledBy]}
                  </span>
                )}
                {section.stage && (
                  <span className="form-builder-board__badge">
                    {SECTION_STAGE_LABELS[section.stage]}
                  </span>
                )}
                {(section.sharedWith || []).some((id) => id !== form?.formId) && (
                  <span className="form-builder-board__badge">Shared</span>
                )}
                {collapsed && (
                  <span className="form-builder-board__count">
                    {itemCount} {itemCount === 1 ? 'item' : 'items'}
                  </span>
                )}
                <button
                  type="button"
                  className="form-builder-board__add-field"
                  onClick={(event) => {
                    event.stopPropagation()
                    openNewFieldEditor(section.id)
                  }}
                >
                  + Field
                </button>
                <button
                  type="button"
                  className="form-builder-board__add-field"
                  onClick={(event) => {
                    event.stopPropagation()
                    addRepeatableGroup(section.id)
                  }}
                >
                  + Group
                </button>
                <button
                  type="button"
                  className="form-builder-board__reuse"
                  onClick={(event) => {
                    event.stopPropagation()
                    setSelectedSectionId(section.id)
                    setReuseSectionId(section.id)
                  }}
                >
                  Reuse
                </button>
                <button type="button" className="form-builder-board__remove" onClick={() => removeSection(section.id)}>
                  Remove
                </button>
              </header>
              {!collapsed && (
              <div
                className="form-builder-board__grid"
                onDragOver={(event) => {
                  event.preventDefault()
                  if (dragging?.type === 'field') setDropTargetSectionId(section.id)
                }}
                onDrop={(event) => {
                  event.stopPropagation()
                  if (dragging?.type === 'field') handleDropField(null, section.id)
                }}
              >
                {!section.fields.length && !section.groups.length && (
                  <p className="form-builder-board__hint">
                    Select this section, then add a Block from the left. Or drag a field onto this section.
                  </p>
                )}
                {section.fields.map((field) => (
                  <article
                    key={field.id}
                    className={`form-builder-board__field span-w-${normalizeColSpan(field.colSpan, 25)} ${field.compound ? 'is-compound' : ''} ${selectedFieldId === field.id ? 'is-selected' : ''} ${resizingId === field.id ? 'is-resizing' : ''}`}
                    onClick={(event) => {
                      event.stopPropagation()
                      if (resizingId === field.id) return
                      setSelectedSectionId(section.id)
                      setSelectedFieldId(field.id)
                      if (field.editable) openFieldEditor(field)
                    }}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                      event.stopPropagation()
                      handleDropField(field.id, section.id)
                    }}
                  >
                    <span
                      className="form-builder-board__handle"
                      draggable
                      onDragStart={(event) => {
                        event.stopPropagation()
                        setDragging({ type: 'field', id: field.id })
                      }}
                      onDragEnd={clearFieldDrag}
                      onClick={(event) => event.stopPropagation()}
                    >
                      <DragHandle />
                    </span>
                    <div className="form-builder-board__field-copy">
                      <strong>{field.label}</strong>
                      <span>
                        {field.compound ? 'Block' : fieldTypeLabel(field.fieldType)}
                        {field.mappedLabel ? ` · ${field.mappedLabel}` : ''}
                        {!field.mappedLabel && field.options?.length
                          ? ` · ${field.options.length} option${field.options.length === 1 ? '' : 's'}${
                            countOptionRules(field.options)
                              ? ` · ${countOptionRules(field.options)} rule${countOptionRules(field.options) === 1 ? '' : 's'}`
                              : ''
                          }`
                          : ''}
                        {field.dependsOnFieldId
                          ? ` · Child of ${
                            section.fields.find((item) => item.id === field.dependsOnFieldId)?.label
                            || layout?.fields?.find((item) => item.id === field.dependsOnFieldId)?.label
                            || 'parent'
                          }`
                          : ''}
                        {field.defaultToCurrentUser ? ' · Logged-in user' : ''}
                      </span>
                    </div>
                    {Boolean(field.options?.length) && (
                      <button
                        type="button"
                        className="form-builder-board__child"
                        onClick={(event) => {
                          event.stopPropagation()
                          openChildFieldEditor(field, section.id)
                        }}
                      >
                        + Child
                      </button>
                    )}
                    <label className="form-builder-board__required" onClick={(event) => event.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={Boolean(field.required)}
                        onChange={() => toggleRequired(field.id)}
                      />
                      Required
                    </label>
                    <button
                      type="button"
                      className="form-builder-board__span"
                      onClick={(event) => {
                        event.stopPropagation()
                        toggleSpan(field.id)
                      }}
                    >
                      {FIELD_WIDTH_LABELS[normalizeColSpan(field.colSpan, 25)]}
                    </button>
                    <button
                      type="button"
                      className="form-builder-board__remove"
                      onClick={(event) => {
                        event.stopPropagation()
                        removeField(field.id)
                      }}
                    >
                      ×
                    </button>
                    <span
                      className="form-builder-board__resize"
                      title="Drag to resize"
                      onPointerDown={(event) => handleResizePointerDown(event, field)}
                      onClick={(event) => event.stopPropagation()}
                    />
                  </article>
                ))}
                {section.groups.map((group) => (
                  <article
                    key={group.id}
                    className={`form-builder-board__group ${selectedGroupId === group.id ? 'is-selected' : ''}`}
                    onClick={(event) => {
                      event.stopPropagation()
                      setSelectedSectionId(section.id)
                      setSelectedGroupId(group.id)
                    }}
                  >
                    <div className="form-builder-board__group-head">
                      <strong>Repeatable group</strong>
                      <input
                        className="form-builder-board__title-input"
                        value={group.label}
                        onClick={(event) => event.stopPropagation()}
                        onChange={(event) => updateGroup(group.id, { label: event.target.value })}
                        aria-label="Group label"
                      />
                      <label className="form-builder-board__group-meta" onClick={(event) => event.stopPropagation()}>
                        Min
                        <input
                          type="number"
                          min={0}
                          max={50}
                          value={group.minRows}
                          onChange={(event) => updateGroup(group.id, {
                            minRows: Math.max(0, Number(event.target.value) || 0),
                          })}
                        />
                      </label>
                      <label className="form-builder-board__group-meta" onClick={(event) => event.stopPropagation()}>
                        Max
                        <input
                          type="number"
                          min={1}
                          max={50}
                          value={group.maxRows}
                          onChange={(event) => updateGroup(group.id, {
                            maxRows: Math.max(1, Number(event.target.value) || 20),
                          })}
                        />
                      </label>
                      <button
                        type="button"
                        className="form-builder-board__remove"
                        onClick={(event) => {
                          event.stopPropagation()
                          removeGroup(group.id)
                        }}
                      >
                        ×
                      </button>
                    </div>
                    <p className="form-builder-board__hint">
                      Runtime: fill a row → Add {group.label || 'item'}. Template fields below.
                    </p>
                    <div className="form-builder-board__group-children">
                      {(group.childFields || []).map((child) => (
                        <button
                          key={child.id}
                          type="button"
                          className="form-builder-board__group-child"
                          onClick={(event) => {
                            event.stopPropagation()
                            openFieldEditor(child, group.id)
                          }}
                        >
                          <strong>{child.label}</strong>
                          <span>{fieldTypeLabel(child.fieldType)}</span>
                          <span
                            role="button"
                            tabIndex={0}
                            className="form-builder-board__remove"
                            onClick={(event) => {
                              event.stopPropagation()
                              removeGroupChild(group.id, child.id)
                            }}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault()
                                event.stopPropagation()
                                removeGroupChild(group.id, child.id)
                              }
                            }}
                          >
                            ×
                          </span>
                        </button>
                      ))}
                      <button
                        type="button"
                        className="form-builder-board__add-field"
                        onClick={(event) => {
                          event.stopPropagation()
                          openGroupChildEditor(group.id, section.id)
                        }}
                      >
                        + Row field
                      </button>
                    </div>
                  </article>
                ))}
              </div>
              )}
            </section>
            )
          })}
        </div>
      </div>

      {editor && (
        <FieldEditor
          draft={editor}
          masters={masters}
          equipmentColumns={equipmentColumns}
          bindOptions={bindOptions}
          parentCandidates={parentCandidates}
          ruleTargetFields={ruleTargetFields}
          filterByCandidates={filterByCandidates}
          groupMode={Boolean(editor.groupId)}
          onChange={(next) => {
            if (!editor.groupId && next.masterSource !== editor.masterSource) {
              let filterByFieldId = next.filterByFieldId || ''
              if (filterByFieldId && next.masterSource) {
                const parent = (layout?.fields || []).find((item) => item.id === filterByFieldId)
                const parsed = parent ? parseLayoutId(parent.id) : null
                const parentSource = parent?.masterSource
                  || (parsed?.kind === 'master' ? parsed.value : '')
                if (!canFilterMasterBy(next.masterSource, parentSource)) filterByFieldId = ''
              } else {
                filterByFieldId = ''
              }
              setEditor({
                ...next,
                bindKey: suggestedBindKey(form?.formId, layout, next.masterSource, next.id),
                filterByFieldId,
              })
              return
            }
            setEditor(next)
          }}
          onSave={saveFieldEditor}
          onClose={() => setEditor(null)}
        />
      )}
      {reuseSectionId && (
        <ReuseSectionDialog
          sectionLabel={canvasSections.find((section) => section.id === reuseSectionId)?.label || 'Section'}
          choices={formChoices.filter((choice) => choice.formId !== form?.formId)}
          selectedIds={(layout?.sections || [])
            .find((section) => section.id === reuseSectionId)?.sharedWith
            ?.filter((id) => id !== form?.formId) || []}
          saving={saving}
          onClose={() => { if (!saving) setReuseSectionId(null) }}
          onApply={(formIds) => applySectionReuse(reuseSectionId, formIds)}
        />
      )}
    </div>
  )
}
