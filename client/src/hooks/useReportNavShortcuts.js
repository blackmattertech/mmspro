import { useCallback, useEffect, useState } from 'react'
import { listAllCustomReports } from '../lib/api-reports'
import { asListArray } from '../lib/listResponse'
import { onCustomReportsChanged } from '../lib/reportNavEvents'

export function useReportNavShortcuts({ enabled = true } = {}) {
  const [shortcuts, setShortcuts] = useState([])

  const reload = useCallback(async () => {
    if (!enabled) {
      setShortcuts([])
      return
    }
    try {
      const data = await listAllCustomReports()
      setShortcuts(asListArray(data))
    } catch {
      setShortcuts([])
    }
  }, [enabled])

  useEffect(() => {
    reload()
    return onCustomReportsChanged(reload)
  }, [reload])

  return shortcuts
}
