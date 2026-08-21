import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

/** Open a record from `?open=` (notification deep links) and strip it when closed. */
export function useOpenQueryId() {
  const [params, setParams] = useSearchParams()
  const openId = params.get('open')
  const [selectedId, setSelectedId] = useState(openId)

  useEffect(() => {
    if (openId) setSelectedId(openId)
  }, [openId])

  const closeSelected = useCallback(() => {
    setSelectedId(null)
    if (!params.has('open')) return
    const next = new URLSearchParams(params)
    next.delete('open')
    setParams(next, { replace: true })
  }, [params, setParams])

  return [selectedId, setSelectedId, closeSelected]
}
