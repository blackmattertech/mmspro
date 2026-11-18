import { useCallback, useState } from 'react'
import ErrorAlertModal from '../components/shared/ErrorAlertModal'
import {
  clearMandatoryFieldId,
  formatMandatoryFieldsAlert,
  scrollToMandatoryField,
} from '../lib/mandatoryFields'

/**
 * Popup + highlight state for missing required fields.
 * `fields` should be `{ id, label }[]`.
 */
export function useMandatoryFieldAlert() {
  const [alert, setAlert] = useState(null)
  const [invalidFieldIds, setInvalidFieldIds] = useState([])

  const showMissing = useCallback((fields = []) => {
    const list = (fields || [])
      .map((field) => (
        typeof field === 'string'
          ? { id: field, label: field }
          : { id: field?.id, label: field?.label || field?.name || field?.id }
      ))
      .filter((field) => field.id || field.label)
    const formatted = formatMandatoryFieldsAlert(list.map((field) => field.label || field.id))
    const ids = [...new Set(list.flatMap((field) => [field.id, field.key].filter(Boolean)))]
    setInvalidFieldIds(ids)
    setAlert(formatted)
    const firstId = ids[0]
    if (firstId) {
      requestAnimationFrame(() => scrollToMandatoryField(firstId))
    }
    return formatted.message
  }, [])

  const clearInvalidField = useCallback((fieldId) => {
    setInvalidFieldIds((current) => clearMandatoryFieldId(current, fieldId))
  }, [])

  const clearAll = useCallback(() => {
    setAlert(null)
    setInvalidFieldIds([])
  }, [])

  const closeAlert = useCallback(() => {
    setAlert(null)
  }, [])

  const alertModal = (
    <ErrorAlertModal
      open={Boolean(alert)}
      title={alert?.title}
      message={alert?.message}
      details={alert?.details}
      onClose={closeAlert}
    />
  )

  return {
    alert,
    invalidFieldIds,
    showMissing,
    clearInvalidField,
    clearAll,
    closeAlert,
    alertModal,
  }
}
