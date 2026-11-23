import { useEffect, useMemo, useState } from 'react'
import { getStatusFilterModule } from '../lib/api-status-filters'
import { peekReferenceData, seedReferenceData } from '../lib/referenceDataCache'
import { phasesForEntity } from '../lib/statusPhases'
import { loadOrgBootstrap } from '../lib/orgBootstrap'

/**
 * Org Status Filter maps → StatusPhaseBar phases for a module.
 * Prefers bootstrap cache; falls back to defaults while loading.
 */
export function useStatusPhaseMaps(entityType) {
  const cachedAll = peekReferenceData('status-phase-maps', {}) || {}
  const [mapsByEntity, setMapsByEntity] = useState(cachedAll)
  const [loading, setLoading] = useState(!cachedAll[entityType])

  useEffect(() => {
    let cancelled = false

    async function load() {
      const existing = peekReferenceData('status-phase-maps', {}) || {}
      if (existing[entityType]?.length) {
        if (!cancelled) {
          setMapsByEntity(existing)
          setLoading(false)
        }
        return
      }

      try {
        const payload = await loadOrgBootstrap()
        const maps = payload?.status_phase_maps || {}
        if (!cancelled && maps[entityType]?.length) {
          setMapsByEntity(maps)
          setLoading(false)
          return
        }
      } catch {
        // Fall through to module endpoint.
      }

      try {
        const module = await getStatusFilterModule(entityType)
        const rows = module?.mappings || []
        if (cancelled) return
        seedReferenceData('status-phase-maps', { entityType }, rows)
        setMapsByEntity((prev) => {
          const next = { ...prev, [entityType]: rows }
          seedReferenceData('status-phase-maps', {}, next)
          return next
        })
      } catch {
        // Keep defaults via phasesForEntity.
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [entityType])

  const phases = useMemo(
    () => phasesForEntity(entityType, mapsByEntity),
    [entityType, mapsByEntity],
  )

  return {
    phases,
    maps: mapsByEntity?.[entityType] || [],
    mapsByEntity,
    loading,
  }
}
