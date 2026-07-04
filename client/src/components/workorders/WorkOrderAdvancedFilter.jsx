import { useEffect, useRef, useState } from 'react'
import {
  ADVANCED_FILTER_FIELDS,
  FILTER_JOIN_OPTIONS,
  createFilterRule,
  getOperatorsForField,
} from '../../lib/workOrderFilters'
import './WorkOrderAdvancedFilter.css'

function FilterValueInput({ rule, locations, onChange }) {
  if (rule.field === 'location') {
    return (
      <select
        className="wo-adv-filter__select"
        value={rule.value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Select location...</option>
        {locations.map((loc) => (
          <option key={loc.id} value={loc.id}>{loc.name}</option>
        ))}
      </select>
    )
  }

  if (rule.field === 'status') {
    return (
      <select
        className="wo-adv-filter__select"
        value={rule.value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Select status...</option>
        <option value="created">Created</option>
        <option value="draft">Draft</option>
      </select>
    )
  }

  return (
    <input
      type="text"
      className="wo-adv-filter__input"
      value={rule.value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Enter value..."
    />
  )
}

export default function WorkOrderAdvancedFilter({
  rules,
  onChange,
  locations,
  activeCount = 0,
}) {
  const [open, setOpen] = useState(false)
  const panelRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined

    const handleClick = (event) => {
      if (panelRef.current && !panelRef.current.contains(event.target)) {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  const updateRule = (id, patch) => {
    onChange(rules.map((rule) => (rule.id === id ? { ...rule, ...patch } : rule)))
  }

  const removeRule = (id) => {
    const next = rules.filter((rule) => rule.id !== id)
    onChange(next.length ? next : [createFilterRule()])
  }

  const addRule = () => {
    onChange([...rules, createFilterRule()])
  }

  const clearAll = () => {
    onChange([createFilterRule()])
  }

  return (
    <div className="wo-adv-filter" ref={panelRef}>
      <button
        type="button"
        className={`wo-adv-filter__trigger${activeCount > 0 ? ' wo-adv-filter__trigger--active' : ''}`}
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M2 4H14M4 8H12M6 12H10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
        Filters
        {activeCount > 0 && (
          <span className="wo-adv-filter__badge">{activeCount}</span>
        )}
      </button>

      {open && (
        <div className="wo-adv-filter__panel">
          <div className="wo-adv-filter__header">
            <strong>Advanced filters</strong>
            <button type="button" className="wo-adv-filter__clear" onClick={clearAll}>
              Clear all
            </button>
          </div>

          <div className="wo-adv-filter__rules">
            {rules.map((rule, index) => {
              const operators = getOperatorsForField(rule.field)
              return (
                <div key={rule.id} className="wo-adv-filter__rule">
                  {index > 0 ? (
                    <select
                      className="wo-adv-filter__join"
                      value={rule.join}
                      onChange={(e) => updateRule(rule.id, { join: e.target.value })}
                    >
                      {FILTER_JOIN_OPTIONS.map((option) => (
                        <option key={option.id} value={option.id}>{option.label}</option>
                      ))}
                    </select>
                  ) : (
                    <span className="wo-adv-filter__where">Where</span>
                  )}

                  <select
                    className="wo-adv-filter__select"
                    value={rule.field}
                    onChange={(e) => updateRule(rule.id, {
                      field: e.target.value,
                      operator: getOperatorsForField(e.target.value)[0]?.id || 'contains',
                      value: '',
                    })}
                  >
                    {ADVANCED_FILTER_FIELDS.map((field) => (
                      <option key={field.id} value={field.id}>{field.label}</option>
                    ))}
                  </select>

                  <select
                    className="wo-adv-filter__select wo-adv-filter__select--operator"
                    value={rule.operator}
                    onChange={(e) => updateRule(rule.id, { operator: e.target.value })}
                  >
                    {operators.map((operator) => (
                      <option key={operator.id} value={operator.id}>{operator.label}</option>
                    ))}
                  </select>

                  <FilterValueInput
                    rule={rule}
                    locations={locations}
                    onChange={(value) => updateRule(rule.id, { value })}
                  />

                  {rules.length > 1 && (
                    <button
                      type="button"
                      className="wo-adv-filter__remove"
                      onClick={() => removeRule(rule.id)}
                      aria-label="Remove condition"
                    >
                      ×
                    </button>
                  )}
                </div>
              )
            })}
          </div>

          <div className="wo-adv-filter__footer">
            <button type="button" className="wo-adv-filter__add" onClick={addRule}>
              + Add condition
            </button>
            <button
              type="button"
              className="company-btn company-btn--primary company-btn--compact"
              onClick={() => setOpen(false)}
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
