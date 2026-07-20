import { useMemo, useState, useEffect, useRef } from 'react'
import { useOrg } from '../../hooks/useOrg'
import { useAssetFields } from '../../hooks/useAssetFields'
import {
  fieldTypeLabel,
  fieldTypeSupportsOptions,
  applyFieldFilters,
  sortAssetFields,
  kindLabel,
  dropdownValuesLabel,
  getSortOptionsForView,
  defaultSortForView,
  nextSortOrder,
} from '../../lib/assetFieldTypes'
import { dependencyLabel } from '../../lib/assetFieldDependencies'
import { readFormDraft, writeFormDraft, clearFormDraft } from '../../lib/formDraftStorage'
import { deleteSectionIcon, uploadSectionIcon } from '../../lib/orgAssets'
import { reorderItemsById } from '../../lib/assetFormSchema'
import GooToggle from '../ui/GooToggle'
import TrashIcon from '../ui/TrashIcon'
import EditIcon from '../ui/EditIcon'
import FieldModal from './FieldModal'
import AssetFieldSortMenu from './AssetFieldSortMenu'
import AssetFormLayoutModal from './AssetFormLayoutModal'
import '../company/CompanyShared.css'
import './AssetsFields.css'
import './AssetFormLayoutModal.css'

function AssetSettingsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 15C13.6569 15 15 13.6569 15 12C15 10.3431 13.6569 9 12 9C10.3431 9 9 10.3431 9 12C9 13.6569 10.3431 15 12 15Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeMiterlimit="10"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M2 12.8799V11.1199C2 10.0799 2.85 9.21994 3.9 9.21994C5.71 9.21994 6.45 7.93994 5.54 6.36994C5.02 5.46994 5.33 4.29994 6.24 3.77994L7.97 2.78994C8.76 2.31994 9.78 2.59994 10.25 3.38994L10.36 3.57994C11.26 5.14994 12.74 5.14994 13.65 3.57994L13.76 3.38994C14.23 2.59994 15.25 2.31994 16.04 2.78994L17.77 3.77994C18.68 4.29994 18.99 5.46994 18.47 6.36994C17.56 7.93994 18.3 9.21994 20.11 9.21994C21.15 9.21994 22.01 10.0699 22.01 11.1199V12.8799C22.01 13.9199 21.16 14.7799 20.11 14.7799C18.3 14.7799 17.56 16.0599 18.47 17.6299C18.99 18.5399 18.68 19.6999 17.77 20.2199L16.04 21.2099C15.25 21.6799 14.23 21.3999 13.76 20.6099L13.65 20.4199C12.75 18.8499 11.27 18.8499 10.36 20.4199L10.25 20.6099C9.78 21.3999 8.76 21.6799 7.97 21.2099L6.24 20.2199C5.33 19.6999 5.02 18.5299 5.54 17.6299C6.45 16.0599 5.71 14.7799 3.9 14.7799C2.85 14.7799 2 13.9199 2 12.8799Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeMiterlimit="10"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

const VIEW_TABS = [
  { id: 'all', label: 'All' },
  { id: 'sections', label: 'Sections' },
  { id: 'parents', label: 'Parents' },
  { id: 'children', label: 'Children' },
]

function hierarchyLabel(field) {
  if (field.kind === 'section') return '—'
  if (field.kind === 'parent') return field.section_name || '—'
  const parts = [field.section_name, field.parent_name].filter(Boolean)
  return parts.length ? parts.join(' → ') : '—'
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

function FieldPill({ children }) {
  if (!children || children === '—') return '—'
  return <span className="company-badge company-badge--primary">{children}</span>
}

function FieldNameCell({ field }) {
  const isSection = field.kind === 'section'
  return (
    <div className="asset-field-name">
      {isSection ? (
        <span className="asset-field-name__icon" aria-hidden={!field.icon_signed_url}>
          {field.icon_signed_url ? (
            <img src={field.icon_signed_url} alt="" className="asset-field-name__icon-img" />
          ) : (
            <span className="asset-field-name__icon-placeholder">
              <svg width="14" height="14" viewBox="0 0 18 18" fill="none">
                <rect x="3" y="3" width="5" height="5" rx="1" fill="currentColor" opacity="0.35" />
                <rect x="10" y="3" width="5" height="5" rx="1" fill="currentColor" opacity="0.25" />
                <rect x="3" y="10" width="5" height="5" rx="1" fill="currentColor" opacity="0.25" />
                <rect x="10" y="10" width="5" height="5" rx="1" fill="currentColor" opacity="0.15" />
              </svg>
            </span>
          )}
        </span>
      ) : (
        <span className="asset-field-name__icon asset-field-name__icon--spacer" aria-hidden="true" />
      )}
      <FieldPill>{field.name}</FieldPill>
    </div>
  )
}

export default function AssetsFieldsPanel({
  canManageSchema,
  canManageChildren,
  orgId: orgIdProp,
  fieldsState,
}) {
  const { org } = useOrg()
  const orgId = orgIdProp || org?.id
  const internalState = useAssetFields({ enabled: !fieldsState })
  const {
    fields,
    sections,
    parents,
    loading,
    saving,
    error,
    create,
    update,
    remove,
    toggleActive,
    reorderSections,
    reorderParents,
    uploadIcon,
    removeIcon,
  } = fieldsState || internalState
  const modalStateKey = orgId ? `mms:asset-field-modal:${orgId}` : null
  const [view, setView] = useState('all')
  const [search, setSearch] = useState('')
  const [sectionFilter, setSectionFilter] = useState('')
  const [parentFilter, setParentFilter] = useState('')
  const [sortBy, setSortBy] = useState('parent')
  const [sortDir, setSortDir] = useState('asc')
  const [modalOpen, setModalOpen] = useState(false)
  const [layoutModalOpen, setLayoutModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState('all')
  const [valuesOnly, setValuesOnly] = useState(false)
  const [editing, setEditing] = useState(null)
  const [togglingId, setTogglingId] = useState(null)
  const [draggingId, setDraggingId] = useState(null)
  const [dropTargetId, setDropTargetId] = useState(null)
  const modalRestoredRef = useRef(false)
  const sectionCreatedCallbackRef = useRef(null)
  const [sectionCreateOpen, setSectionCreateOpen] = useState(false)

  const sectionOptions = useMemo(
    () => fields.filter((f) => f.kind === 'section'),
    [fields],
  )

  const parentOptions = useMemo(() => {
    let list = fields.filter((f) => f.kind === 'parent')
    if (sectionFilter) list = list.filter((f) => f.section_id === sectionFilter)
    return list
  }, [fields, sectionFilter])

  useEffect(() => {
    if (!modalStateKey || loading || modalRestoredRef.current) return
    const saved = readFormDraft(modalStateKey)
    if (!saved?.open) {
      modalRestoredRef.current = true
      return
    }
    if (saved.editingId && !fields.some((f) => f.id === saved.editingId)) return

    modalRestoredRef.current = true
    setModalOpen(true)
    setModalMode(saved.mode || 'all')
    if (saved.editingId) {
      setEditing(fields.find((f) => f.id === saved.editingId) || null)
    } else {
      setEditing(null)
    }
  }, [modalStateKey, loading, fields])

  useEffect(() => {
    if (!modalStateKey) return
    if (modalOpen) {
      writeFormDraft(modalStateKey, {
        open: true,
        mode: modalMode,
        editingId: editing?.id || null,
      })
    } else {
      clearFormDraft(modalStateKey)
    }
  }, [modalOpen, modalMode, editing, modalStateKey])

  const visibleFields = useMemo(() => {
    const filtered = applyFieldFilters(fields, {
      view,
      search,
      sectionId: sectionFilter,
      parentId: parentFilter,
    })
    return sortAssetFields(filtered, { sortBy, sortDir })
  }, [fields, view, search, sectionFilter, parentFilter, sortBy, sortDir])

  const hasFilters = Boolean(search.trim() || sectionFilter || parentFilter)
  const showSectionFilter = view !== 'sections'
  const showParentFilter = view === 'parents' || view === 'children' || view === 'all'

  const canReorderRows = Boolean(
    canManageSchema
    && typeof reorderSections === 'function'
    && !search.trim()
    && !parentFilter
    && sortBy === 'sort_order'
    && sortDir === 'asc'
    && (
      view === 'sections'
      || (view === 'parents' && sectionFilter && typeof reorderParents === 'function')
    )
    && visibleFields.length > 1
  )

  const handleDragStart = (event, id) => {
    if (!canReorderRows || saving) return
    setDraggingId(id)
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', id)
  }

  const handleDragOver = (event, targetId) => {
    if (!canReorderRows || !draggingId || draggingId === targetId || saving) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    setDropTargetId(targetId)
  }

  const handleDragEnd = () => {
    setDraggingId(null)
    setDropTargetId(null)
  }

  const handleDrop = async (event, targetId) => {
    event.preventDefault()
    if (!canReorderRows || !draggingId || draggingId === targetId || saving) {
      handleDragEnd()
      return
    }

    const toIndex = visibleFields.findIndex((field) => field.id === targetId)
    if (toIndex < 0) {
      handleDragEnd()
      return
    }

    const next = reorderItemsById(visibleFields, draggingId, toIndex)
    const ids = next.map((field) => field.id)
    handleDragEnd()

    try {
      if (view === 'sections') {
        await reorderSections(ids)
      } else if (view === 'parents' && sectionFilter) {
        await reorderParents(sectionFilter, ids)
      }
    } catch {
      // error surfaced via fieldsState.error
    }
  }

  const openCreate = (mode = 'all') => {
    setEditing(null)
    setModalMode(mode)
    setValuesOnly(false)
    setModalOpen(true)
  }

  const openEdit = (field, { valuesOnly: valuesOnlyMode = false } = {}) => {
    if (field.kind === 'child') return
    if (valuesOnlyMode) {
      if (!canManageChildren || field.kind !== 'parent' || !fieldTypeSupportsOptions(field.field_type)) return
    } else if (!canManageSchema) {
      return
    }
    setEditing(field)
    setModalMode(field.kind === 'section' ? 'section' : 'parent')
    setValuesOnly(valuesOnlyMode)
    setModalOpen(true)
  }

  const openParentValues = (childField) => {
    const parent = fields.find((f) => f.id === childField.parent_id)
    if (parent) openEdit(parent, { valuesOnly: true })
  }

  const handleCreateSectionInline = async (name) => {
    const saved = await create({
      name,
      is_section: true,
      is_parent: false,
      field_type: 'text',
      sort_order: nextSortOrder(fields, { kind: 'section' }),
    })
    return saved
  }

  const handleRequestCreateSection = (onCreated) => {
    sectionCreatedCallbackRef.current = onCreated
    setSectionCreateOpen(true)
  }

  const handleSectionCreateSave = async (payload, iconMeta = {}) => {
    const { iconFile, removeIcon: shouldRemoveIcon } = iconMeta
    let saved = await create({
      ...payload,
      is_section: true,
      is_parent: false,
    })
    const sectionId = saved?.id
    if (sectionId && orgId) {
      if (shouldRemoveIcon) {
        if (typeof removeIcon === 'function') {
          await removeIcon(sectionId)
        }
      } else if (iconFile) {
        if (typeof uploadIcon === 'function') {
          saved = await uploadIcon(sectionId, iconFile) || saved
        } else {
          const path = await uploadSectionIcon(orgId, sectionId, iconFile)
          saved = await update(sectionId, { icon_path: path }) || saved
        }
      }
    }
    const created = saved || fields.find((f) => f.id === sectionId)
    sectionCreatedCallbackRef.current?.(created)
    sectionCreatedCallbackRef.current = null
    setSectionCreateOpen(false)
  }

  const handleSave = async (payload, iconMeta = {}) => {
    const { iconFile, removeIcon: shouldRemoveIcon } = iconMeta
    const isSection = payload.is_section || editing?.kind === 'section'

    let saved
    if (payload.kind === 'child') {
      const parent = fields.find((item) => (
        item.id === payload.parent_id
        && item.kind === 'parent'
        && fieldTypeSupportsOptions(item.field_type)
      ))
      if (!parent) throw new Error('Option parent field not found')
      const existingValues = parent.dropdown_options || []
      const toAdd = (payload.dropdown_options?.length
        ? payload.dropdown_options
        : payload.name
          ? [payload.name]
          : []
      )
        .map((value) => String(value).trim())
        .filter(Boolean)
      if (!toAdd.length) throw new Error('Add at least one option value')
      const nextValues = [...existingValues]
      for (const value of toAdd) {
        const exists = nextValues.some((existing) => existing.toLowerCase() === value.toLowerCase())
        if (exists) {
          throw new Error(`"${value}" already exists under ${parent.name}`)
        }
        nextValues.push(value)
      }
      saved = await update(parent.id, {
        dropdown_options: nextValues,
      })
    } else if (valuesOnly && editing) {
      saved = await update(editing.id, { dropdown_options: payload.dropdown_options })
    } else if (editing) {
      const { dropdown_options: optionValues, ...schemaPayload } = payload
      saved = await update(editing.id, schemaPayload)
      // Server rejects an empty values-only update, so only sync when options exist
      if (optionValues?.length && canManageChildren) {
        saved = await update(editing.id, { dropdown_options: optionValues })
      }
    } else {
      saved = await create(payload)
    }

    const sectionId = editing?.id || saved?.id
    if (!valuesOnly && isSection && sectionId && orgId) {
      if (shouldRemoveIcon) {
        if (typeof removeIcon === 'function') {
          await removeIcon(sectionId)
        } else if (editing?.icon_path) {
          await deleteSectionIcon(editing.icon_path)
          await update(sectionId, { icon_path: null })
        }
      } else if (iconFile) {
        if (typeof uploadIcon === 'function') {
          await uploadIcon(sectionId, iconFile)
        } else {
          if (editing?.icon_path) {
            await deleteSectionIcon(editing.icon_path)
          }
          const path = await uploadSectionIcon(orgId, sectionId, iconFile)
          await update(sectionId, { icon_path: path })
        }
      }
    }

    setModalOpen(false)
  }

  const handleDelete = async (field) => {
    if (!window.confirm(`Permanently delete "${field.name}"? This cannot be undone.`)) return
    if (field.kind === 'child') {
      const parent = fields.find((item) => item.id === field.parent_id)
      if (!parent) throw new Error('Dropdown parent field not found')
      const nextValues = (parent.dropdown_options || []).filter((value) => (
        value.toLowerCase() !== field.name.toLowerCase()
      ))
      await update(parent.id, { dropdown_options: nextValues })
      return
    }
    await remove(field.id)
  }

  const canDeleteField = (field) => {
    if (field.kind === 'child') return canManageChildren
    return canManageSchema
  }

  const canToggleField = (field) => {
    if (field.kind === 'child') return canManageChildren
    return canManageSchema
  }

  const handleToggle = async (field, isActive) => {
    setTogglingId(field.id)
    try {
      await toggleActive(field.id, isActive)
    } finally {
      setTogglingId(null)
    }
  }

  const createModeForView = view === 'sections'
    ? 'section'
    : view === 'parents'
      ? 'parent'
      : view === 'children'
        ? 'child'
        : 'all'

  const showAddButton = (canManageSchema && view !== 'children')
    || (canManageChildren && view === 'children')

  const handleViewChange = (tabId) => {
    setView(tabId)
    setParentFilter('')
    if (tabId === 'sections') setSectionFilter('')
    const defaults = defaultSortForView(tabId)
    setSortBy(defaults.sortBy)
    setSortDir(defaults.sortDir)
  }

  const handleSortChange = ({ sortBy: nextSortBy, sortDir: nextSortDir }) => {
    const allowed = getSortOptionsForView(view).map((o) => o.value)
    setSortBy(allowed.includes(nextSortBy) ? nextSortBy : defaultSortForView(view).sortBy)
    setSortDir(nextSortDir === 'desc' ? 'desc' : 'asc')
  }

  const handleSectionFilterChange = (value) => {
    setSectionFilter(value)
    if (value && parentFilter) {
      const parent = fields.find((f) => f.id === parentFilter)
      if (parent?.section_id !== value) setParentFilter('')
    }
  }

  return (
    <div className="company-panel">
      <div className="company-panel__toolbar">
        <nav className="asset-field-tabs" aria-label="Field views">
          {VIEW_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`asset-field-tabs__btn ${view === tab.id ? 'asset-field-tabs__btn--active' : ''}`}
              onClick={() => handleViewChange(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </nav>
        <div className="asset-field-toolbar__actions">
          {canManageSchema && (
            <button
              type="button"
              className="asset-form-layout-btn"
              onClick={() => setLayoutModalOpen(true)}
              aria-label="Arrange form layout"
              title="Arrange form layout"
            >
              <AssetSettingsIcon />
            </button>
          )}
          {showAddButton && (
            <button
              type="button"
              className="company-btn company-btn--primary"
              onClick={() => openCreate(createModeForView)}
            >
              {view === 'children' ? '+ Add Child' : '+ Add Field'}
            </button>
          )}
        </div>
      </div>

      <div className="asset-field-filters">
        <div className="asset-field-filters__search-group">
          <label className="company-filter asset-field-filters__search">
            <span>Search</span>
            <input
              type="search"
              className="company-form__input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search…"
            />
          </label>
          <AssetFieldSortMenu
            view={view}
            sortBy={sortBy}
            sortDir={sortDir}
            onChange={handleSortChange}
          />
        </div>
        {showSectionFilter && (
          <label className="company-filter">
            <span>Section</span>
            <select
              className="company-form__input company-form__input--select"
              value={sectionFilter}
              onChange={(e) => handleSectionFilterChange(e.target.value)}
            >
              <option value="">All sections</option>
              {sectionOptions.map((section) => (
                <option key={section.id} value={section.id}>{section.name}</option>
              ))}
            </select>
          </label>
        )}
        {showParentFilter && (
          <label className="company-filter">
            <span>Parent</span>
            <select
              className="company-form__input company-form__input--select"
              value={parentFilter}
              onChange={(e) => setParentFilter(e.target.value)}
            >
              <option value="">All parents</option>
              {parentOptions.map((parent) => (
                <option key={parent.id} value={parent.id}>{parent.name}</option>
              ))}
            </select>
          </label>
        )}
        <p className="company-panel__count">
          {visibleFields.length} result(s)
        </p>
      </div>

      {error && <div className="company-alert">{error}</div>}

      {canManageSchema && (view === 'sections' || view === 'parents') && (
        <p className="asset-field-reorder-hint">
          {search.trim()
            ? 'Clear search to enable drag reordering.'
            : view === 'sections'
              ? (canReorderRows
                ? 'Drag rows to change section display order.'
                : (sortBy !== 'sort_order' || sortDir !== 'asc')
                  ? 'Sort by Display order (ascending) to drag and reorder sections.'
                  : 'Add more sections to reorder them by dragging.')
              : !sectionFilter
                ? 'Select a section to drag and reorder its parent fields.'
                : canReorderRows
                  ? 'Drag rows to change parent field order within this section.'
                  : (sortBy !== 'sort_order' || sortDir !== 'asc')
                    ? 'Sort by Display order (ascending) to drag and reorder parent fields.'
                    : 'Add more parent fields in this section to reorder them by dragging.'}
        </p>
      )}

      {loading ? (
        <div className="company-loading">Loading fields…</div>
      ) : visibleFields.length === 0 ? (
        <div className="company-empty">
          {hasFilters && 'No fields match your search or filters.'}
          {!hasFilters && view === 'sections' && (
            canManageSchema
              ? 'No sections yet. Add a section to group parent fields for this organization.'
              : 'No sections yet. Ask Super Admin to add sections first.'
          )}
          {!hasFilters && view === 'parents' && (
            canManageSchema
              ? 'No parent fields yet. Create a section first, then add parent fields.'
              : 'No parent fields yet. Ask Super Admin to add parent fields first.'
          )}
          {!hasFilters && view === 'children' && (
            canManageChildren
              ? 'No child values yet. Add a child value to an existing option-backed parent.'
              : 'No child values yet. Ask Super Admin to add a Dropdown or Checkbox parent field, then add values here.'
          )}
          {!hasFilters && view === 'all' && (
            canManageSchema
              ? 'No fields yet. Add sections and parent fields for this organization. Companies can add option values in their org app.'
              : 'No fields yet. Super Admin adds sections and parent fields; your company adds option values.'
          )}
        </div>
      ) : (
        <div className="company-table-wrap">
          <table className="company-table master-table">
            <thead>
              <tr>
                {canReorderRows && <th className="asset-field-drag-col" aria-label="Reorder" />}
                <th>Name</th>
                {view === 'all' && <th>Type</th>}
                {view !== 'sections' && <th>Section</th>}
                {view === 'children' && <th>Parent</th>}
                {view !== 'sections' && view !== 'children' && <th>Field type</th>}
                {view === 'sections' && <th>Order</th>}
                {view === 'sections' && <th>Parents</th>}
                {view === 'sections' && <th>Values</th>}
                {view === 'parents' && <th>Order</th>}
                {view === 'parents' && <th>Values</th>}
                {view === 'parents' && <th>Dependency</th>}
                {(view === 'all' || view === 'children') && <th>Hierarchy</th>}
                {(canManageSchema || canManageChildren) && <th>Active</th>}
                {(canManageSchema || canManageChildren) && <th aria-label="Actions" />}
              </tr>
            </thead>
            <tbody>
              {visibleFields.map((field) => {
                const isDragging = draggingId === field.id
                const isDropTarget = dropTargetId === field.id && draggingId !== field.id
                return (
                <tr
                  key={field.id}
                  className={[
                    field.is_active === false ? 'company-table__row--inactive' : '',
                    isDragging ? 'asset-field-row--dragging' : '',
                    isDropTarget ? 'asset-field-row--drop-target' : '',
                  ].filter(Boolean).join(' ')}
                  onDragOver={(event) => handleDragOver(event, field.id)}
                  onDrop={(event) => handleDrop(event, field.id)}
                >
                  {canReorderRows && (
                    <td className="asset-field-drag-col">
                      <span
                        className="asset-field-drag-handle"
                        draggable={!saving}
                        onDragStart={(event) => handleDragStart(event, field.id)}
                        onDragEnd={handleDragEnd}
                        aria-label={`Drag to reorder ${field.name}`}
                        title="Drag to reorder"
                      >
                        <DragHandle />
                      </span>
                    </td>
                  )}
                  <td><FieldNameCell field={field} /></td>
                  {view === 'all' && <td>{kindLabel(field.kind)}</td>}
                  {view !== 'sections' && <td>{field.section_name || '—'}</td>}
                  {view === 'children' && (
                    <td><FieldPill>{field.parent_name}</FieldPill></td>
                  )}
                  {view !== 'sections' && view !== 'children' && <td>{fieldTypeLabel(field.field_type)}</td>}
                  {view === 'sections' && <td>{field.sort_order ?? 0}</td>}
                  {view === 'sections' && <td>{field.parent_count ?? 0}</td>}
                  {view === 'sections' && <td>{field.child_count ?? 0}</td>}
                  {view === 'parents' && <td>{field.sort_order ?? 0}</td>}
                  {view === 'parents' && (
                    <td className="asset-field-hierarchy">
                      {fieldTypeSupportsOptions(field.field_type) && field.dropdown_options?.length ? (
                        <div className="company-tag-list">
                          {field.dropdown_options.map((opt) => (
                            <span key={opt} className="company-badge company-badge--primary">{opt}</span>
                          ))}
                        </div>
                      ) : (
                        dropdownValuesLabel(field)
                      )}
                    </td>
                  )}
                  {view === 'parents' && (
                    <td className="asset-field-dependency-cell">
                      {dependencyLabel(field) || '—'}
                    </td>
                  )}
                  {view === 'all' && (
                    <td className="asset-field-hierarchy">
                      {field.kind === 'section'
                        ? field.name
                        : fieldTypeSupportsOptions(field.field_type) && field.dropdown_options?.length
                          ? `${field.section_name || '—'} → ${field.dropdown_options.join(', ')}`
                          : hierarchyLabel(field)}
                    </td>
                  )}
                  {view === 'children' && (
                    <td className="asset-field-hierarchy">{hierarchyLabel(field)}</td>
                  )}
                  {(canManageSchema || canManageChildren) && (
                    <td>
                      {canToggleField(field) ? (
                        <GooToggle
                          checked={field.is_active !== false}
                          disabled={togglingId === field.id}
                          onChange={(checked) => handleToggle(field, checked)}
                          ariaLabel={`Toggle ${field.name}`}
                        />
                      ) : (
                        '—'
                      )}
                    </td>
                  )}
                  {(canManageSchema || canManageChildren) && (
                    <td className="company-table__actions">
                      {field.kind === 'child' && canManageChildren && (
                        <button
                          type="button"
                          className="company-btn company-btn--secondary company-btn--compact company-btn--icon"
                          onClick={() => openParentValues(field)}
                          aria-label={`Edit values for ${field.parent_name || field.name}`}
                          title="Edit values"
                        >
                          <EditIcon />
                        </button>
                      )}
                      {field.kind === 'parent' && fieldTypeSupportsOptions(field.field_type) && canManageChildren && !canManageSchema && (
                        <button
                          type="button"
                          className="company-btn company-btn--secondary company-btn--compact company-btn--icon"
                          onClick={() => openEdit(field, { valuesOnly: true })}
                          aria-label={`Edit values for ${field.name}`}
                          title="Edit values"
                        >
                          <EditIcon />
                        </button>
                      )}
                      {field.kind !== 'child' && canManageSchema && (
                        <button
                          type="button"
                          className="company-btn company-btn--secondary company-btn--compact company-btn--icon"
                          onClick={() => openEdit(field)}
                          aria-label={`Edit ${field.name}`}
                          title="Edit"
                        >
                          <EditIcon />
                        </button>
                      )}
                      {canDeleteField(field) && (
                        <button
                          type="button"
                          className="company-btn company-btn--danger company-btn--compact company-btn--icon"
                          onClick={() => handleDelete(field)}
                          aria-label={`Delete ${field.name}`}
                          title="Delete"
                        >
                          <TrashIcon />
                        </button>
                      )}
                    </td>
                  )}
                </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {layoutModalOpen && (
        <AssetFormLayoutModal
          fields={fields}
          saving={saving}
          onClose={() => setLayoutModalOpen(false)}
          onSave={reorderSections}
        />
      )}

      {modalOpen && (
        <FieldModal
          field={editing}
          mode={modalMode}
          valuesOnly={valuesOnly}
          canManageChildren={canManageChildren}
          canManageSchema={canManageSchema}
          orgId={orgId}
          sections={sectionOptions}
          dependencySections={sectionOptions}
          parents={parents}
          allFields={fields}
          saving={saving}
          onClose={() => setModalOpen(false)}
          onSave={handleSave}
          onCreateSection={canManageSchema ? handleCreateSectionInline : undefined}
          onRequestCreateSection={canManageSchema ? handleRequestCreateSection : undefined}
        />
      )}

      {sectionCreateOpen && (
        <FieldModal
          mode="section"
          canManageChildren={false}
          canManageSchema={canManageSchema}
          orgId={orgId}
          sections={sectionOptions}
          parents={parents}
          allFields={fields}
          saving={saving}
          onClose={() => {
            sectionCreatedCallbackRef.current = null
            setSectionCreateOpen(false)
          }}
          onSave={handleSectionCreateSave}
        />
      )}
    </div>
  )
}
