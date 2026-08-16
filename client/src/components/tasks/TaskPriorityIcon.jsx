export const PRIORITY_ICON_OPTIONS = [
  { value: 'alert', label: 'Alert' },
  { value: 'arrowUp', label: 'High' },
  { value: 'minus', label: 'Medium' },
  { value: 'arrowDown', label: 'Low' },
]

export default function TaskPriorityIcon({ icon = 'minus', size = 18, color = 'currentColor' }) {
  const props = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': true }

  if (icon === 'alert') {
    return (
      <svg {...props}>
        <path
          d="M12 2.25L3.75 19.5h16.5L12 2.25z"
          stroke={color}
          strokeWidth="1.75"
          strokeLinejoin="round"
        />
        <path d="M12 9v5" stroke={color} strokeWidth="1.75" strokeLinecap="round" />
        <circle cx="12" cy="16.5" r="1" fill={color} />
      </svg>
    )
  }

  if (icon === 'arrowUp') {
    return (
      <svg {...props}>
        <path
          d="M12 5l6 6M12 5l-6 6M12 5v14"
          stroke={color}
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    )
  }

  if (icon === 'arrowDown') {
    return (
      <svg {...props}>
        <path
          d="M12 19l6-6M12 19l-6-6M12 19V5"
          stroke={color}
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    )
  }

  return (
    <svg {...props}>
      <circle cx="12" cy="12" r="9" stroke={color} strokeWidth="1.75" />
      <path d="M8 12h8" stroke={color} strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  )
}
