import { useState } from 'react'
import TemplatePickerModal from './TemplatePickerModal'

export default function TemplatesButton({
  moduleKey,
  disabled = false,
  className = 'company-btn company-btn--secondary',
  label = 'Templates',
  onSelect,
}) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        className={className}
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        {label}
      </button>
      {open ? (
        <TemplatePickerModal
          moduleKey={moduleKey}
          onClose={() => setOpen(false)}
          onSelect={(row) => {
            setOpen(false)
            onSelect?.(row)
          }}
        />
      ) : null}
    </>
  )
}
