import { useEffect, useRef, useState } from 'react'
import FilterableSelect from '../ui/FilterableSelect'
import {
  ADVANCED_FILTER_FIELDS,
  FILTER_JOIN_OPTIONS,
  createFilterRule,
  getOperatorsForField,
} from '../../lib/workOrderFilters'
import '../company/CompanyShared.css'
import './WorkOrderAdvancedFilter.css'

const WO_STATUS_OPTIONS = [
  { value: 'created', label: 'Created' },
  { value: 'draft', label: 'Draft' },
]

function AdvSelect(props) {
  return (
    <FilterableSelect
      inputClassName="wo-adv-filter__select"
      {...props}
    />
  )
}

function FilterValueInput({ rule, locations, onChange }) {
  if (rule.field === 'location') {
    return (
      <AdvSelect
        value={rule.value}
        onChange={onChange}
        options={locations}
        getOptionValue={(loc) => loc.id}
        getOptionLabel={(loc) => loc.name}
        placeholder="Select location..."
      />
    )
  }

  if (rule.field === 'status') {
    return (
      <AdvSelect
        value={rule.value}
        onChange={onChange}
        options={WO_STATUS_OPTIONS}
        getOptionValue={(o) => o.value}
        getOptionLabel={(o) => o.label}
        placeholder="Select status..."
      />
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
                    <AdvSelect
                      value={rule.join}
                      onChange={(join) => updateRule(rule.id, { join })}
                      options={FILTER_JOIN_OPTIONS}
                      getOptionValue={(option) => option.id}
                      getOptionLabel={(option) => option.label}
                      allowEmpty={false}
                      inputClassName="wo-adv-filter__join"
                    />
                  ) : (
                    <span className="wo-adv-filter__where">Where</span>
                  )}

                  <AdvSelect
                    value={rule.field}
                    onChange={(field) => updateRule(rule.id, {
                      field,
                      operator: getOperatorsForField(field)[0]?.id || 'contains',
                      value: '',
                    })}
                    options={ADVANCED_FILTER_FIELDS}
                    getOptionValue={(field) => field.id}
                    getOptionLabel={(field) => field.label}
                    allowEmpty={false}
                  />

                  <AdvSelect
                    value={rule.operator}
                    onChange={(operator) => updateRule(rule.id, { operator })}
                    options={operators}
                    getOptionValue={(operator) => operator.id}
                    getOptionLabel={(operator) => operator.label}
                    allowEmpty={false}
                    className="wo-adv-filter__select--operator"
                  />

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
