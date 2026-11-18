import DuplicateIcon from './DuplicateIcon'

/** Compact Duplicate icon button for table row actions. */
export default function DuplicateRowButton({
  onClick,
  disabled = false,
  label = 'Duplicate',
  className = 'company-btn company-btn--secondary company-btn--compact company-btn--icon',
}) {
  return (
    <button
      type="button"
      className={className}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
    >
      <DuplicateIcon />
    </button>
  )
}
