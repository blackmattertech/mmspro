export function ImportGroupList({ groups, title }) {
  if (!groups?.length) return null
  const visible = groups.filter((group) => group.action !== 'blocked' || group.item_count > 0)
  if (!visible.length) return null

  return (
    <div className="import-groups">
      {title && <p className="import-groups__heading">{title}</p>}
      <ol className="import-groups__list">
        {visible.map((group, index) => (
          <li className="import-groups__card" key={`${group.po_number}-${group.invoice_number}-${group.vendor}-${index}`}>
            <p className="import-groups__title">Purchase #{index + 1}</p>
            <p className="import-groups__vendor">{group.vendor || 'Vendor'}</p>
            <p className="import-groups__ref">
              {group.po_number || '—'} / {group.invoice_number || '—'}
            </p>
            <p className="import-groups__items">
              {group.item_count} item{group.item_count === 1 ? '' : 's'}
              {group.action_label ? ` · ${group.action_label}` : ''}
            </p>
            {group.item_names?.length > 0 && (
              <p className="import-groups__names">{group.item_names.join(', ')}</p>
            )}
          </li>
        ))}
      </ol>
    </div>
  )
}
