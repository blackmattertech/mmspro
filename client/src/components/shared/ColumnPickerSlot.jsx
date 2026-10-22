import { createContext, useContext, useState } from 'react'
import { createPortal } from 'react-dom'

const SlotContext = createContext(null)

export function ColumnPickerScope({ children }) {
  const [el, setEl] = useState(null)
  return (
    <SlotContext.Provider value={{ el, setEl }}>
      {children}
    </SlotContext.Provider>
  )
}

export function ColumnPickerMount() {
  const ctx = useContext(SlotContext)
  if (!ctx) return null
  return <div ref={ctx.setEl} className="column-picker-mount" />
}

export function ColumnPickerPortal({ children }) {
  const ctx = useContext(SlotContext)
  if (!ctx) return children
  if (!ctx.el) return null
  return createPortal(children, ctx.el)
}
