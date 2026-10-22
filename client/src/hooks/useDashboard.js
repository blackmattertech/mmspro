import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useOrg } from './useOrg'
import { usePermissions } from './usePermissions'
import { getDashboardSummary } from '../lib/api-dashboard'
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
  const { isOrgAdmin, locationId: scopedLocationId, canCreate, canRead, loading: permLoading } = usePermissions()

  const canSeeAllLocations = isOrgAdmin
  const userLocationId = scopedLocationId || null
  const canReadWorkOrders = canRead('work_orders_received')
    || canRead('work_orders_assigned')
    || canRead('work_orders_manual')
    || canRead('work_orders_scheduled')
    || canRead('work_orders')

  const [locations, setLocations] = useState([])
  const [overview, setOverview] = useState([])
  const [modules, setModules] = useState([])
  const [charts, setCharts] = useState(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(null)
  const [locationFilter, setLocationFilter] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const filterLocations = useMemo(() => {
    if (canSeeAllLocations) return locations
    if (!userLocationId) return []
    return locations.filter((loc) => loc.id === userLocationId)
  }, [canSeeAllLocations, locations, userLocationId])

  const fetchLocationId = canSeeAllLocations ? locationFilter : (userLocationId || locationFilter)

  useEffect(() => {
    if (!canSeeAllLocations) {
      if (userLocationId && locationFilter !== userLocationId) setLocationFilter(userLocationId)
      return
    }
    if (locationFilter !== 'all' && locations.length && !locations.some((loc) => loc.id === locationFilter)) {
      setLocationFilter('all')
    }
  }, [canSeeAllLocations, userLocationId, locations, locationFilter])

  const fetchData = useCallback(async () => {
    if (permLoading) return
    setRefreshing(true)
    setError(null)
    try {
      const summary = await getDashboardSummary({
        locationId: fetchLocationId,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      })

      setOverview(Array.isArray(summary?.overview) ? summary.overview : [])
      setModules(Array.isArray(summary?.modules) ? summary.modules : [])
      setCharts(summary?.charts && typeof summary.charts === 'object' ? summary.charts : null)
      if (Array.isArray(summary?.locations) && summary.locations.length) {
        setLocations(summary.locations)
      }
    } catch (err) {
      setOverview([])
      setModules([])
      setCharts(null)
      setError(err.message || 'Failed to load dashboard')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [permLoading, fetchLocationId, dateFrom, dateTo])

  useEffect(() => {
    if (permLoading) return
    fetchData()
  }, [permLoading, fetchData])

  const createWorkOrder = async () => {
    if (!org?.slug) return { data: null, error: { message: 'No organization found' } }
    if (canCreate && !canCreate('work_orders_manual') && !canCreate('work_orders')) {
      return { data: null, error: { message: 'You do not have permission to create work orders' } }
    }
    navigate(orgPath(org.slug, 'work-orders/manual/create'))
    return { data: null, error: null }
  }

  const createWorkRequest = async () => {
    if (!org?.slug) return { data: null, error: { message: 'No organization found' } }
    if (canCreate && !canCreate('work_request_create') && !canCreate('work_request')) {
      return { data: null, error: { message: 'You do not have permission to create work requests' } }
    }
    navigate(orgPath(org.slug, 'work-request/create'))
    return { data: null, error: null }
  }

  return {
    loading,
    refreshing,
    error,
    isDemo: false,
    locations: filterLocations,
    canSeeAllLocations,
    canReadWorkOrders,
    workOrders: charts?.recent_work_orders || [],
    recentOrders: charts?.recent_work_orders || [],
    trendData: [],
    locationBreakdown: charts?.locations || [],
    plantBreakdown: charts?.locations || [],
    statusBreakdown: [],
    priorityBreakdown: [],
    stats: EMPTY_STATS,
    overview,
    modules,
    charts,
    locationFilter,
    setLocationFilter,
    plantFilter: locationFilter,
    setPlantFilter: setLocationFilter,
    dateFrom,
    setDateFrom,
    dateTo,
    setDateTo,
    createWorkOrder,
    createWorkRequest,
    canCreateWorkOrder: !canCreate || canCreate('work_orders_manual') || canCreate('work_orders'),
    canCreateWorkRequest: !canCreate || canCreate('work_request_create') || canCreate('work_request'),
    refresh: fetchData,
  }
}
