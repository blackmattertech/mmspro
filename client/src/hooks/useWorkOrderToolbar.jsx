import { createContext, useContext, useMemo, useState, useCallback } from 'react'

const WorkOrderToolbarContext = createContext(null)

function isToolbarSlots(value) {
  return Boolean(
    value
    && typeof value === 'object'
    && !value.$$typeof
    && ('back' in value || 'tools' in value || 'actions' in value),
  )
}

export function WorkOrderToolbarProvider({ children }) {
  const [toolbar, setToolbarState] = useState({ left: null, tools: null, right: null })

  const setToolbar = useCallback((left, right) => {
    if (isToolbarSlots(left)) {
      setToolbarState({
        left: left.back ?? null,
        tools: left.tools ?? null,
        right: left.actions ?? null,
      })
      return
    }
    setToolbarState({ left: left ?? null, tools: null, right: right ?? null })
  }, [])

  const clearToolbar = useCallback(() => {
    setToolbarState({ left: null, tools: null, right: null })
  }, [])

  const value = useMemo(() => ({
    toolbarLeft: toolbar.left,
    toolbarTools: toolbar.tools,
    toolbarRight: toolbar.right,
    setToolbar,
    clearToolbar,
  }), [toolbar.left, toolbar.tools, toolbar.right, setToolbar, clearToolbar])

  return (
    <WorkOrderToolbarContext.Provider value={value}>
      {children}
    </WorkOrderToolbarContext.Provider>
  )
}

export function useWorkOrderToolbar() {
  const context = useContext(WorkOrderToolbarContext)
  if (!context) {
    throw new Error('useWorkOrderToolbar must be used within WorkOrderToolbarProvider')
  }
  return context
}
