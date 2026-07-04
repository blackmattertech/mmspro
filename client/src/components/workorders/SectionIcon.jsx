const DEFAULT_COLORS = ['#3B82F6', '#10B981', '#8B5CF6', '#F59E0B', '#EF4444', '#14B8A6', '#6366F1']

function DefaultSectionIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <rect x="3" y="3" width="5" height="5" rx="1" fill="white" opacity="0.9" />
      <rect x="10" y="3" width="5" height="5" rx="1" fill="white" opacity="0.7" />
      <rect x="3" y="10" width="5" height="5" rx="1" fill="white" opacity="0.7" />
      <rect x="10" y="10" width="5" height="5" rx="1" fill="white" opacity="0.5" />
    </svg>
  )
}

export function sectionFallbackColor(index = 0) {
  return DEFAULT_COLORS[index % DEFAULT_COLORS.length]
}

export default function SectionIcon({ iconUrl, color, className = '' }) {
  if (iconUrl) {
    return (
      <span className={`wo-section__icon wo-section__icon--image ${className}`.trim()} aria-hidden="true">
        <img src={iconUrl} alt="" />
      </span>
    )
  }

  return (
    <span
      className={`wo-section__icon ${className}`.trim()}
      style={{ background: color || DEFAULT_COLORS[0] }}
      aria-hidden="true"
    >
      <DefaultSectionIcon />
    </span>
  )
}
