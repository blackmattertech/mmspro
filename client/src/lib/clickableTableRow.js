export function stopTableRowClick(event) {
  event.stopPropagation()
}

export function tableRowClickProps({ onOpen, label, className = '' }) {
  return {
    className: ['company-table__row--clickable', className].filter(Boolean).join(' '),
    onClick: onOpen,
    onKeyDown: (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        onOpen(event)
      }
    },
    tabIndex: 0,
    role: 'button',
    'aria-label': label,
  }
}
