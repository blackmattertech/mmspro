import { useMemo, useState, useEffect, useRef } from 'react'
import { useOrg } from '../../hooks/useOrg'
import { useAssetFields } from '../../hooks/useAssetFields'
import {
  fieldTypeLabel,
  applyFieldFilters,
  sortAssetFields,
  kindLabel,
  dropdownValuesLabel,
  getSortOptionsForView,
  defaultSortForView,
} from '../../lib/assetFieldTypes'
import { dependencyLabel } from '../../lib/assetFieldDependencies'
import { readFormDraft, writeFormDraft, clearFormDraft } from '../../lib/formDraftStorage'
import { deleteSectionIcon, uploadSectionIcon } from '../../lib/orgAssets'
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

function FieldPill({ children }) {
  if (!children || children === '—') return '—'
  return <span className="company-badge company-badge--primary">{children}</span>
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
  const modalRestoredRef = useRef(false)

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

  const openCreate = (mode = 'all') => {
    setEditing(null)
    setModalMode(mode)
    setValuesOnly(false)
    setModalOpen(true)
  }

  const openEdit = (field, { valuesOnly: valuesOnlyMode = false } = {}) => {
    if (field.kind === 'child') return
    if (valuesOnlyMode) {
      if (!canManageChildren || field.kind !== 'parent' || field.field_type !== 'dropdown') return
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

  const handleSave = async (payload, iconMeta = {}) => {
    const { iconFile, removeIcon } = iconMeta
    const isSection = payload.is_section || editing?.kind === 'section'

    let saved
    if (valuesOnly && editing) {
      saved = await update(editing.id, { dropdown_options: payload.dropdown_options })
    } else if (editing) {
      saved = await update(editing.id, payload)
    } else {
      saved = await create(payload)
    }

    const sectionId = editing?.id || saved?.id
    if (!valuesOnly && isSection && sectionId && orgId) {
      if (removeIcon && editing?.icon_path) {
        await deleteSectionIcon(editing.icon_path)
        await update(sectionId, { icon_path: null })
      } else if (iconFile) {
        if (editing?.icon_path) {
          await deleteSectionIcon(editing.icon_path)
        }
        const path = await uploadSectionIcon(orgId, sectionId, iconFile)
        await update(sectionId, { icon_path: path })
      }
    }

    setModalOpen(false)
  }

  const handleDelete = async (field) => {
    if (!window.confirm(`Permanently delete "${field.name}"? This cannot be undone.`)) return
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
      : 'all'

  const showAddButton = canManageSchema && view !== 'children'

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
              + Add Field
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
            canManageSchema
              ? 'No child values yet. Companies add dropdown values in their org app after you create dropdown parents.'
              : 'No child values yet. Ask Super Admin to add a dropdown parent field, then add values here.'
          )}
          {!hasFilters && view === 'all' && (
            canManageSchema
              ? 'No fields yet. Add sections and parent fields for this organization. Companies will add dropdown values in their app.'
              : 'No fields yet. Super Admin adds sections and parent fields; your company adds dropdown values.'
          )}
        </div>
      ) : (
        <div className="company-table-wrap">
          <table className="company-table master-table">
            <thead>
              <tr>
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
              {visibleFields.map((field) => (
                <tr key={field.id} className={field.is_active === false ? 'company-table__row--inactive' : ''}>
                  <td><FieldPill>{field.name}</FieldPill></td>
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
                      {field.field_type === 'dropdown' && field.dropdown_options?.length ? (
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
                        : field.field_type === 'dropdown' && field.dropdown_options?.length
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
                          className="company-btn company-btn--ghost"
                          onClick={() => openParentValues(field)}
                        >
                          Edit values
                        </button>
                      )}
                      {field.kind === 'parent' && field.field_type === 'dropdown' && canManageChildren && !canManageSchema && (
                        <button
                          type="button"
                          className="company-btn company-btn--ghost"
                          onClick={() => openEdit(field, { valuesOnly: true })}
                        >
                          Edit values
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
              ))}
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
          orgId={orgId}
          sections={sections}
          dependencySections={sectionOptions}
          parents={parents}
          allFields={fields}
          saving={saving}
          onClose={() => setModalOpen(false)}
          onSave={handleSave}
        />
      )}
    </div>
  )
}
