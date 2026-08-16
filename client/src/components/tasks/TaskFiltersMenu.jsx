import { useEffect, useMemo, useRef, useState } from 'react'
import FilterableSelect from '../ui/FilterableSelect'
import { assetUrl } from '../../lib/assets'
import { VISIBILITY_OPTIONS } from '../../config/tasks'
import './TaskFiltersMenu.css'

const FILTER_ICON_URL = assetUrl('Assets/icons/filter3-outline.svg')

const FILTER_BY_OPTIONS = [
  { value: 'status', label: 'Status' },
  { value: 'priority', label: 'Priority' },
  { value: 'category', label: 'Category' },
  { value: 'tag', label: 'Tag' },
  { value: 'visibility', label: 'Task type' },
]

function countActiveFilters(values) {
  return Object.values(values).filter(Boolean).length
}

function resolveLabel(options, value) {
  if (!value) return null
  return options.find((opt) => opt.value === value)?.label || value
}

export default function TaskFiltersMenu({
  statusFilter,
  onStatusFilterChange,
  priorityFilter,
  onPriorityFilterChange,
  categoryFilter,
  onCategoryFilterChange,
  tagFilter,
  onTagFilterChange,
  visibilityFilter,
  onVisibilityFilterChange,
  activeStatuses = [],
  activePriorities = [],
  activeCategories = [],
  activeTags = [],
}) {
  const [open, setOpen] = useState(false)
  const [filterBy, setFilterBy] = useState('')
  const rootRef = useRef(null)

  const activeCount = useMemo(() => countActiveFilters({
    status: statusFilter,
    priority: priorityFilter,
    category: categoryFilter,
    tag: tagFilter,
    visibility: visibilityFilter,
  }), [statusFilter, priorityFilter, categoryFilter, tagFilter, visibilityFilter])

  const activeChips = useMemo(() => {
    const chips = []
    if (statusFilter) {
      chips.push({
        key: 'status',
        label: `Status: ${resolveLabel(
          activeStatuses.map((s) => ({ value: s.id, label: s.name })),
          statusFilter,
        )}`,
        onClear: () => onStatusFilterChange(''),
      })
    }
    if (priorityFilter) {
      chips.push({
        key: 'priority',
        label: `Priority: ${resolveLabel(
          activePriorities.map((p) => ({ value: p.id, label: p.name })),
          priorityFilter,
        )}`,
        onClear: () => onPriorityFilterChange(''),
      })
    }
    if (categoryFilter) {
      chips.push({
        key: 'category',
        label: `Category: ${resolveLabel(
          activeCategories.map((c) => ({ value: c.id, label: c.name })),
          categoryFilter,
        )}`,
        onClear: () => onCategoryFilterChange(''),
      })
    }
    if (tagFilter) {
      chips.push({
        key: 'tag',
        label: `Tag: ${resolveLabel(
          activeTags.map((t) => ({ value: t.id, label: t.name })),
          tagFilter,
        )}`,
        onClear: () => onTagFilterChange(''),
      })
    }
    if (visibilityFilter) {
      chips.push({
        key: 'visibility',
        label: `Task type: ${resolveLabel(VISIBILITY_OPTIONS, visibilityFilter)}`,
        onClear: () => onVisibilityFilterChange(''),
      })
    }
    return chips
  }, [
    statusFilter,
    priorityFilter,
    categoryFilter,
    tagFilter,
    visibilityFilter,
    activeStatuses,
    activePriorities,
    activeCategories,
    activeTags,
    onStatusFilterChange,
    onPriorityFilterChange,
    onCategoryFilterChange,
    onTagFilterChange,
    onVisibilityFilterChange,
  ])

  useEffect(() => {
    if (!open) return undefined

    const handleClick = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) {
        setOpen(false)
      }
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  const clearAll = () => {
    setFilterBy('')
    onStatusFilterChange('')
    onPriorityFilterChange('')
    onCategoryFilterChange('')
    onTagFilterChange('')
    onVisibilityFilterChange('')
  }

  const valueField = useMemo(() => {
    switch (filterBy) {
      case 'status':
        return {
          id: 'task-status-filter',
          label: 'Status',
          value: statusFilter,
          onChange: onStatusFilterChange,
          options: [
            { value: '', label: 'All statuses' },
            ...activeStatuses.map((s) => ({ value: s.id, label: s.name })),
          ],
        }
      case 'priority':
        return {
          id: 'task-priority-filter',
          label: 'Priority',
          value: priorityFilter,
          onChange: onPriorityFilterChange,
          options: [
            { value: '', label: 'All priorities' },
            ...activePriorities.map((p) => ({ value: p.id, label: p.name })),
          ],
        }
      case 'category':
        return {
          id: 'task-category-filter',
          label: 'Category',
          value: categoryFilter,
          onChange: onCategoryFilterChange,
          options: [
            { value: '', label: 'All categories' },
            ...activeCategories.map((c) => ({ value: c.id, label: c.name })),
          ],
        }
      case 'tag':
        return {
          id: 'task-tag-filter',
          label: 'Tag',
          value: tagFilter,
          onChange: onTagFilterChange,
          options: [
            { value: '', label: 'All tags' },
            ...activeTags.map((t) => ({ value: t.id, label: t.name })),
          ],
        }
      case 'visibility':
        return {
          id: 'task-visibility-filter',
          label: 'Task type',
          value: visibilityFilter,
          onChange: onVisibilityFilterChange,
          options: [
            { value: '', label: 'All types' },
            ...VISIBILITY_OPTIONS,
          ],
        }
      default:
        return null
    }
  }, [
    filterBy,
    statusFilter,
    priorityFilter,
    categoryFilter,
    tagFilter,
    visibilityFilter,
    onStatusFilterChange,
    onPriorityFilterChange,
    onCategoryFilterChange,
    onTagFilterChange,
    onVisibilityFilterChange,
    activeStatuses,
    activePriorities,
    activeCategories,
    activeTags,
  ])

  return (
    <div className="task-filters-menu" ref={rootRef}>
      <button
        type="button"
        className={`task-filters-menu__trigger${open ? ' task-filters-menu__trigger--open' : ''}${activeCount > 0 ? ' task-filters-menu__trigger--active' : ''}`}
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="Filter tasks"
      >
        <span
          className="task-filters-menu__icon"
          style={{ WebkitMaskImage: `url("${FILTER_ICON_URL}")`, maskImage: `url("${FILTER_ICON_URL}")` }}
          aria-hidden="true"
        />
        <span className="task-filters-menu__trigger-label">Filter</span>
        {activeCount > 0 && (
          <span className="task-filters-menu__badge">{activeCount}</span>
        )}
      </button>

      {open && (
        <div className="task-filters-menu__panel" role="dialog" aria-label="Task filters">
          <div className="task-filters-menu__header">
            <div>
              <strong className="task-filters-menu__title">Filter tasks</strong>
              <p className="task-filters-menu__subtitle">Choose a field, then pick a value</p>
            </div>
            {activeCount > 0 && (
              <button type="button" className="task-filters-menu__clear" onClick={clearAll}>
                Clear all
              </button>
            )}
          </div>

          {activeChips.length > 0 && (
            <div className="task-filters-menu__active" aria-label="Active filters">
              {activeChips.map((chip) => (
                <span key={chip.key} className="task-filters-menu__active-chip">
                  <span className="task-filters-menu__active-chip-label">{chip.label}</span>
                  <button
                    type="button"
                    className="task-filters-menu__active-chip-remove"
                    onClick={chip.onClear}
                    aria-label={`Remove ${chip.label}`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}

          <div className="task-filters-menu__step">
            <span className="task-filters-menu__step-label">1. Filter by</span>
            <div className="task-filters-menu__choices" role="group" aria-label="Filter by">
              {FILTER_BY_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`task-filters-menu__choice${filterBy === option.value ? ' task-filters-menu__choice--active' : ''}`}
                  onClick={() => setFilterBy(option.value)}
                  aria-pressed={filterBy === option.value}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {valueField && (
            <div className="task-filters-menu__step task-filters-menu__step--value">
              <span className="task-filters-menu__step-label">2. {valueField.label}</span>
              <FilterableSelect
                id={valueField.id}
                value={valueField.value}
                onChange={valueField.onChange}
                options={valueField.options}
                getOptionValue={(opt) => opt.value}
                getOptionLabel={(opt) => opt.label}
                allowEmpty={false}
                placeholder={`Select ${valueField.label.toLowerCase()}…`}
                inputClassName="task-filters-menu__select company-form__input"
                className="task-filters-menu__select-wrap"
              />
            </div>
          )}

          <div className="task-filters-menu__footer">
            <button
              type="button"
              className="company-btn company-btn--secondary company-btn--compact"
              onClick={() => setOpen(false)}
            >
              Close
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
