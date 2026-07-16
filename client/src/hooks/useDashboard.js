import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useOrg } from './useOrg'
import { useLocations } from './useLocations'
import { usePermissions } from './usePermissions'
import { getDashboardWorkOrders } from '../lib/api-work-orders'
import { orgPath } from '../config/navigation'

const EMPTY_STATS = {
  total: 0,
  created: 0,
  draft: 0,
  assigned: 0,
  received: 0,
  open: 0,
  inProgress: 0,
  completed: 0,
  overdue: 0,
  trendPercent: 0,
  slaPercent: null,
  slaTrend: null,
}

export const useDashboard = () => {
  const navigate = useNavigate()
  const { org } = useOrg()
  const { locations: orgLocations, loading: locationsLoading } = useLocations()
  const { isOrgAdmin, locationId: scopedLocationId, canCreate } = usePermissions()

  const canSeeAllLocations = isOrgAdmin
  const userLocationId = scopedLocationId || null

  const [workOrders, setWorkOrders] = useState([])
  const [stats, setStats] = useState(EMPTY_STATS)
  const [statusBreakdown, setStatusBreakdown] = useState([])
  const [locationBreakdown, setLocationBreakdown] = useState([])
  const [trendData, setTrendData] = useState([])
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
      const recent = Array.isArray(data?.recent_orders)
        ? data.recent_orders
        : (Array.isArray(data?.work_orders) ? data.work_orders : [])
      setWorkOrders(recent)
      setStats(data?.stats && typeof data.stats === 'object' ? { ...EMPTY_STATS, ...data.stats } : EMPTY_STATS)
      setStatusBreakdown(Array.isArray(data?.status_breakdown) ? data.status_breakdown : [])
      setLocationBreakdown(Array.isArray(data?.location_breakdown) ? data.location_breakdown : [])
      setTrendData(Array.isArray(data?.trend_data) ? data.trend_data : [])
    } catch (err) {
      setWorkOrders([])
      setStats(EMPTY_STATS)
      setStatusBreakdown([])
      setLocationBreakdown([])
      setTrendData([])
      setError(err.message || 'Failed to load dashboard')
    } finally {
      setLoading(false)
    }
  }, [canSeeAllLocations, locationFilter, userLocationId, dateFrom, dateTo])

  useEffect(() => {
    fetchData()
  }, [fetchData])

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
