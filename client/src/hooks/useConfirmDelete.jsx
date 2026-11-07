import { useCallback, useRef, useState } from 'react'
import ConfirmDeleteModal from '../components/shared/ConfirmDeleteModal'

/**
 * Promise-based delete confirmation for replacing window.confirm.
 * Usage:
 *   const { requestDelete, deleteModal } = useConfirmDelete()
 *   if (!(await requestDelete({ title, message }))) return
 */
export function useConfirmDelete() {
  const [state, setState] = useState(null)
  const resolverRef = useRef(null)

  const close = useCallback((result) => {
    const resolve = resolverRef.current
    resolverRef.current = null
    setState(null)
    resolve?.(Boolean(result))
  }, [])

  const requestDelete = useCallback(({
    title = 'Confirm delete',
    message = 'Delete this item?',
    confirmLabel = 'OK Delete',
    cancelLabel = 'Cancel',
  } = {}) => new Promise((resolve) => {
    if (resolverRef.current) resolverRef.current(false)
    resolverRef.current = resolve
    setState({ title, message, confirmLabel, cancelLabel })
  }), [])

  const deleteModal = (
    <ConfirmDeleteModal
      open={Boolean(state)}
      title={state?.title}
      message={state?.message}
      confirmLabel={state?.confirmLabel}
      cancelLabel={state?.cancelLabel}
      onClose={() => close(false)}
      onConfirm={() => close(true)}
    />
  )

  return { requestDelete, deleteModal }
}

export default useConfirmDelete
