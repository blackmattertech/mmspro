import { useEffect, useRef, useState } from 'react'
import FilterableSelect from '../ui/FilterableSelect'
import {
  WR_ADVANCED_FILTER_FIELDS,
  FILTER_JOIN_OPTIONS,
  createWorkRequestFilterRule,
  getOperatorsForWorkRequestField,
} from '../../lib/workRequestFilters'
import '../company/CompanyShared.css'
import '../workorders/WorkOrderAdvancedFilter.css'

const WR_STATUS_OPTIONS = [
  { value: 'submitted', label: 'Submitted' },
  { value: 'pending_approval', label: 'Pending approval' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'need_info', label: 'Need info' },
  { value: 'cancelled', label: 'Cancelled' },
]

const WR_PRIORITY_OPTIONS = [
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
]

const WR_TYPE_OPTIONS = [
  { value: 'inter_department', label: 'Inter department' },
  { value: 'intra_department', label: 'Intra department' },
  { value: 'user_self', label: 'User self' },
  { value: 'manual', label: 'Manual' },
]

function AdvSelect(props) {
  return (
    <FilterableSelect
      inputClassName="wo-adv-filter__select"
      {...props}
    />
  )
}

function FilterValueInput({ rule, departments, onChange }) {
  if (rule.field === 'status') {
    return (
      <AdvSelect
        value={rule.value}
        onChange={onChange}
        options={WR_STATUS_OPTIONS}
        getOptionValue={(o) => o.value}
        getOptionLabel={(o) => o.label}
        placeholder="Select status..."
      />
    )
  }

  if (rule.field === 'priority') {
    return (
      <AdvSelect
        value={rule.value}
        onChange={onChange}
        options={WR_PRIORITY_OPTIONS}
        getOptionValue={(o) => o.value}
        getOptionLabel={(o) => o.label}
        placeholder="Select priority..."
      />
    )
  }

  if (rule.field === 'request_type') {
    return (
      <AdvSelect
        value={rule.value}
        onChange={onChange}
        options={WR_TYPE_OPTIONS}
        getOptionValue={(o) => o.value}
        getOptionLabel={(o) => o.label}
        placeholder="Select type..."
      />
    )
  }

  if (rule.field === 'order_from' || rule.field === 'order_to') {
    return (
      <AdvSelect
        value={rule.value}
        onChange={onChange}
        options={departments}
        getOptionValue={(dept) => dept.id}
        getOptionLabel={(dept) => dept.name}
        placeholder="Select department..."
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

export default function WorkRequestAdvancedFilter({
  rules,
  onChange,
  departments = [],
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
    onChange(next.length ? next : [createWorkRequestFilterRule()])
  }

  const addRule = () => {
    onChange([...rules, createWorkRequestFilterRule()])
  }

  const clearAll = () => {
    onChange([createWorkRequestFilterRule()])
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
              const operators = getOperatorsForWorkRequestField(rule.field)
              return (
                <div key={rule.id} className="wo-adv-filter__rule">
                  {index > 0 && (
                    <AdvSelect
                      value={rule.join}
                      onChange={(join) => updateRule(rule.id, { join })}
                      options={FILTER_JOIN_OPTIONS}
                      getOptionValue={(opt) => opt.id}
                      getOptionLabel={(opt) => opt.label}
                      allowEmpty={false}
                      aria-label="Combine with previous rule"
                      className="wo-adv-filter__join-wrap"
                      inputClassName="wo-adv-filter__join"
                    />
                  )}

                  <AdvSelect
                    value={rule.field}
                    onChange={(field) => updateRule(rule.id, {
                      field,
                      operator: getOperatorsForWorkRequestField(field)[0]?.id || 'contains',
                      value: '',
                    })}
                    options={WR_ADVANCED_FILTER_FIELDS}
                    getOptionValue={(field) => field.id}
                    getOptionLabel={(field) => field.label}
                    allowEmpty={false}
                  />

                  <AdvSelect
                    value={rule.operator}
                    onChange={(operator) => updateRule(rule.id, { operator })}
                    options={operators}
                    getOptionValue={(op) => op.id}
                    getOptionLabel={(op) => op.label}
                    allowEmpty={false}
                    className="wo-adv-filter__select--operator"
                  />

                  <FilterValueInput
                    rule={rule}
                    departments={departments}
                    onChange={(value) => updateRule(rule.id, { value })}
                  />

                  <button
                    type="button"
                    className="wo-adv-filter__remove"
                    onClick={() => removeRule(rule.id)}
                    aria-label="Remove filter"
                  >
                    ×
                  </button>
                </div>
              )
            })}
          </div>

          <button type="button" className="wo-adv-filter__add" onClick={addRule}>
            + Add filter
          </button>
        </div>
      )}
    </div>
  )
}
