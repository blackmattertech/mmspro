import {
  ACCESS_MODULES,
  ACCESS_MODULE_GROUPS,
  PERMISSION_ACTIONS,
  permissionsByModule,
  togglePermissionRow,
  toggleModuleRow,
  isModuleFullyChecked,
  isActionColumnChecked,
  toggleActionColumn,
  isGroupFullyChecked,
  isGroupPartiallyChecked,
  toggleGroupModules,
} from '../../lib/accessModules'
import './RolePermissionsTable.css'

function ColumnToggle({ checked, disabled, onChange, label }) {
  return (
    <button
      type="button"
      className={`role-perm__col-toggle ${checked ? 'role-perm__col-toggle--checked' : ''}`}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      aria-label={label}
      aria-pressed={checked}
    >
      <span className="role-perm__col-toggle-icon" aria-hidden="true">−</span>
      <span>{label}</span>
    </button>
  )
}

function PermCheckbox({ checked, indeterminate = false, disabled, onChange, label }) {
  return (
    <label className={`role-perm__checkbox ${disabled ? 'role-perm__checkbox--disabled' : ''}`}>
      <input
        type="checkbox"
        checked={checked}
        ref={(el) => {
          if (el) el.indeterminate = Boolean(indeterminate) && !checked
        }}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        aria-label={label}
      />
      <span className="role-perm__checkbox-box" aria-hidden="true" />
    </label>
  )
}

export default function RolePermissionsTable({
  permissions,
  canEdit,
  onChange,
}) {
  const rows = permissionsByModule(permissions)

  const handleGroupToggle = (group, checked) => {
    if (!onChange) return
    onChange(toggleGroupModules(group, rows, checked))
  }

  const handleModuleToggle = (module, row, checked) => {
    if (!onChange) return
    onChange(rows.map((r) => (
      r.module_key === module.key ? toggleModuleRow(module, row, checked) : r
    )))
  }

  const handleCellToggle = (moduleKey, action, checked) => {
    if (!onChange) return
    onChange(rows.map((r) => (
      r.module_key === moduleKey ? togglePermissionRow(r, action, checked) : r
    )))
  }

  const handleColumnToggle = (action, checked) => {
    if (!onChange) return
    onChange(toggleActionColumn(rows, action, checked))
  }

  return (
    <div className="role-perm">
      <table className="role-perm__table">
        <thead>
          <tr>
            <th className="role-perm__th-module">Module</th>
            {PERMISSION_ACTIONS.map((action) => (
              <th key={action} className="role-perm__th-action">
                <ColumnToggle
                  checked={isActionColumnChecked(rows, action)}
                  disabled={!canEdit || !ACCESS_MODULES.some((m) => m.actions.includes(action))}
                  onChange={(checked) => handleColumnToggle(action, checked)}
                  label={action.charAt(0).toUpperCase() + action.slice(1)}
                />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ACCESS_MODULE_GROUPS.map((group) => {
            const groupChecked = isGroupFullyChecked(group, rows)
            const groupPartial = isGroupPartiallyChecked(group, rows)
            const showGroupHeader = group.modules.length > 1

            return (
              <GroupRows
                key={group.id}
                group={group}
                rows={rows}
                showGroupHeader={showGroupHeader}
                groupChecked={groupChecked}
                groupPartial={groupPartial}
                canEdit={canEdit}
                onGroupToggle={handleGroupToggle}
                onModuleToggle={handleModuleToggle}
                onCellToggle={handleCellToggle}
              />
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function GroupRows({
  group,
  rows,
  showGroupHeader,
  groupChecked,
  groupPartial,
  canEdit,
  onGroupToggle,
  onModuleToggle,
  onCellToggle,
}) {
  return (
    <>
      {showGroupHeader && (
        <tr className="role-perm__group-row">
          <td className="role-perm__module" colSpan={1}>
            <div className="role-perm__module-cell role-perm__module-cell--group">
              <PermCheckbox
                checked={groupChecked}
                indeterminate={groupPartial}
                disabled={!canEdit}
                onChange={(checked) => onGroupToggle(group, checked)}
                label={`All permissions for ${group.label}`}
              />
              <span>{group.label}</span>
            </div>
          </td>
          {PERMISSION_ACTIONS.map((action) => (
            <td key={action} className="role-perm__cell role-perm__cell--group" />
          ))}
        </tr>
      )}
      {group.modules.map((module) => {
        const row = rows.find((r) => r.module_key === module.key)
        const moduleChecked = isModuleFullyChecked(module, row)

        return (
          <tr
            key={module.key}
            className={showGroupHeader ? 'role-perm__child-row' : undefined}
          >
            <td className="role-perm__module">
              <div className={`role-perm__module-cell ${showGroupHeader ? 'role-perm__module-cell--child' : ''}`}>
                <PermCheckbox
                  checked={moduleChecked}
                  disabled={!canEdit}
                  onChange={(checked) => onModuleToggle(module, row, checked)}
                  label={`All permissions for ${module.label}`}
                />
                <span>{module.label}</span>
              </div>
            </td>
            {PERMISSION_ACTIONS.map((action) => (
              <td key={action} className="role-perm__cell">
                {module.actions.includes(action) ? (
                  <PermCheckbox
                    checked={Boolean(row[`can_${action}`])}
                    disabled={!canEdit}
                    onChange={(checked) => onCellToggle(module.key, action, checked)}
                    label={`${action} ${module.label}`}
                  />
                ) : (
                  <span className="role-perm__na" aria-hidden="true" />
                )}
              </td>
            ))}
          </tr>
        )
      })}
    </>
  )
}
