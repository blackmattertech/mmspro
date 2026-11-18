import { useState } from 'react'
import { createRecordTemplate } from '../../lib/api-record-templates'
import { defaultTemplateName } from '../../lib/recordTemplates'

export default function SaveAsTemplateButton({
  moduleKey,
  sourceRecordId,
  defaultName = '',
  disabled = false,
  className = 'company-btn company-btn--secondary company-btn--compact',
  label = 'Save as template',
  onSaved,
}) {
  const [busy, setBusy] = useState(false)

  const handleClick = async () => {
    if (!moduleKey || !sourceRecordId || busy) return
    const name = window.prompt('Template name', defaultTemplateName(defaultName))
    if (name == null) return
    setBusy(true)
    try {
      const template = await createRecordTemplate({
        module_key: moduleKey,
        source_record_id: sourceRecordId,
        name,
      })
      onSaved?.(template)
      window.alert(`Template “${template.name}” saved.`)
    } catch (err) {
      window.alert(err.message || 'Could not save template')
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      className={className}
      onClick={handleClick}
      disabled={disabled || busy || !sourceRecordId}
      title={label}
    >
      {busy ? 'Saving…' : label}
    </button>
  )
}
