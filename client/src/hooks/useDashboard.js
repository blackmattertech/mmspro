import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useOrg } from './useOrg'
import { useLocations } from './useLocations'
import { usePermissions } from './usePermissions'
import { getDashboardWorkOrders } from '../lib/api-work-orders'
import { orgPath } from '../config/navigation'

const countBy = (items, key) =>
  items.reduce((acc, item) => {
    const k = item[key]
    acc[k] = (acc[k] || 0) + 1
    return acc
  }, {})

function pct(part, total) {
  if (!total) return 0
  return Math.round((part / total) * 1000) / 10
}

function buildTrend(orders) {
  const days = []
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  for (let i = 6; i >= 0; i -= 1) {
    const d = new Date(today)
    d.setDate(today.getDate() - i)
    days.push(d)
  }

  return days.map((day) => {
    const next = new Date(day)
    next.setDate(day.getDate() + 1)
    const value = orders.filter((o) => {
      const created = new Date(o.created_at)
      return created >= day && created < next
    }).length
    return {
      date: day.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      value,
    }
  })
}

function trendPercent(orders) {
  const now = Date.now()
  const day = 86400000
  const last30 = orders.filter((o) => now - new Date(o.created_at).getTime() <= 30 * day).length
  const prev30 = orders.filter((o) => {
    const age = now - new Date(o.created_at).getTime()
    return age > 30 * day && age <= 60 * day
  }).length
  if (!prev30) return last30 > 0 ? 100 : 0
  return Math.round(((last30 - prev30) / prev30) * 1000) / 10
}

export const useDashboard = () => {
  const navigate = useNavigate()
  const { org } = useOrg()
  const { locations: orgLocations, loading: locationsLoading } = useLocations()
  const { isOrgAdmin, locationId: scopedLocationId, canCreate } = usePermissions()

  const canSeeAllLocations = isOrgAdmin
  const userLocationId = scopedLocationId || null

  const [workOrders, setWorkOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [locationFilter, setLocationFilter] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const locations = useMemo(
    () => (orgLocations || []).filter((loc) => loc.is_active !== false),
    [orgLocations],
  )

  const filterLocations = useMemo(() => {
    if (canSeeAllLocations) return locations
    if (!userLocationId) return []
    return locations.filter((loc) => loc.id === userLocationId)
  }, [canSeeAllLocations, locations, userLocationId])

  useEffect(() => {
    if (!canSeeAllLocations) {
      if (userLocationId) setLocationFilter(userLocationId)
      return
    }
    if (locationFilter !== 'all' && !locations.some((loc) => loc.id === locationFilter)) {
      setLocationFilter('all')
    }
  }, [canSeeAllLocations, userLocationId, locations, locationFilter])

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const locationId = canSeeAllLocations ? locationFilter : (userLocationId || locationFilter)
      const data = await getDashboardWorkOrders({
        locationId,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      })
      setWorkOrders(Array.isArray(data?.work_orders) ? data.work_orders : [])
    } catch (err) {
      setWorkOrders([])
      setError(err.message || 'Failed to load dashboard')
    } finally {
      setLoading(false)
    }
  }, [canSeeAllLocations, locationFilter, userLocationId, dateFrom, dateTo])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const stats = useMemo(() => {
    const total = workOrders.length
    const statusCounts = countBy(workOrders, 'status')
    const created = statusCounts.created || 0
    const draft = statusCounts.draft || 0
    const assigned = workOrders.filter((o) => o.assignee_count > 0).length
    const received = workOrders.filter((o) => o.is_received).length
    const change = trendPercent(workOrders)

    return {
      total,
      created,
      draft,
      assigned,
      received,
      // Back-compat aliases used by older widget props
      open: created,
      inProgress: draft,
      completed: assigned,
      overdue: received,
      trendPercent: change,
      slaPercent: null,
      slaTrend: null,
    }
  }, [workOrders])

  const statusBreakdown = useMemo(() => {
    const counts = countBy(workOrders, 'status')
    return ['created', 'draft'].map((status) => ({
      status,
      count: counts[status] || 0,
      percent: pct(counts[status] || 0, workOrders.length),
    }))
  }, [workOrders])

  const locationBreakdown = useMemo(() => {
    const counts = {}
    workOrders.forEach((o) => {
      const name = o.location_name || 'Unassigned'
      counts[name] = (counts[name] || 0) + 1
    })
    return Object.entries(counts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
  }, [workOrders])

  const trendData = useMemo(() => buildTrend(workOrders), [workOrders])

  const createWorkOrder = async () => {
    if (!org?.slug) return { data: null, error: { message: 'No organization found' } }
    if (canCreate && !canCreate('work_orders_manual') && !canCreate('work_orders')) {
      return { data: null, error: { message: 'You do not have permission to create work orders' } }
    }
    navigate(orgPath(org.slug, 'work-orders/manual/create'))
    return { data: null, error: null }
  }

  return {
    loading: loading || locationsLoading,
    error,
    isDemo: false,
    locations: filterLocations,
    canSeeAllLocations,
    workOrders,
    recentOrders: workOrders.slice(0, 5),
    upcomingTasks: [],
    trendData,
    locationBreakdown,
    plantBreakdown: locationBreakdown,
    statusBreakdown,
    priorityBreakdown: [],
    stats,
    locationFilter,
    setLocationFilter,
    plantFilter: locationFilter,
    setPlantFilter: setLocationFilter,
    dateFrom,
    setDateFrom,
    dateTo,
    setDateTo,
    createWorkOrder,
    refresh: fetchData,
  }
}
