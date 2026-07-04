import { createContext, useContext, useMemo, useState, useCallback } from 'react'

const WorkOrderToolbarContext = createContext(null)

export function WorkOrderToolbarProvider({ children }) {
  const [toolbar, setToolbarState] = useState({ left: null, right: null })

  const setToolbar = useCallback((left, right) => {
    setToolbarState({ left, right })
  }, [])

  const clearToolbar = useCallback(() => {
    setToolbarState({ left: null, right: null })
  }, [])

  const value = useMemo(() => ({
    toolbarLeft: toolbar.left,
    toolbarRight: toolbar.right,
    setToolbar,
    clearToolbar,
  }), [toolbar.left, toolbar.right, setToolbar, clearToolbar])

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
