import { useState } from 'react'
import { apiFetchBlob, downloadBlobFile } from '../../lib/api'
import { PdfIcon } from '../reports/ReportActionIcons'

export default function RecordPdfButton({ moduleKey, recordId, filename, title = 'Download PDF' }) {
  const [busy, setBusy] = useState(false)

  if (!moduleKey || !recordId) return null

  const download = async (event) => {
    event.stopPropagation()
    setBusy(true)
    try {
      const file = await apiFetchBlob(`/api/records/${moduleKey}/${recordId}/pdf`)
      downloadBlobFile({
        blob: file.blob,
        filename: filename || file.filename || `${moduleKey}.pdf`,
      })
    } catch (err) {
      window.alert(err.message || 'Could not download PDF')
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      className="company-btn company-btn--secondary company-btn--compact company-btn--icon"
      onClick={download}
      disabled={busy}
      title={title}
      aria-label={title}
    >
      <PdfIcon />
    </button>
  )
}
