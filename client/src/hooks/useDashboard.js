import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import { useAuth } from './useAuth'
import {
  DEMO_WORK_ORDERS,
  DEMO_PLANTS,
  TREND_DATA,
  PLANT_COUNTS,
  UPCOMING_TASKS,
} from '../data/dashboardDemo'

const countBy = (items, key) =>
  items.reduce((acc, item) => {
    const k = item[key]
    acc[k] = (acc[k] || 0) + 1
    return acc
  }, {})

export const useDashboard = () => {
  const { user } = useAuth()
  const [plants, setPlants] = useState([])
  const [workOrders, setWorkOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [plantFilter, setPlantFilter] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [isDemo, setIsDemo] = useState(false)

  const fetchData = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase || !user) {
      setPlants(DEMO_PLANTS)
      setWorkOrders(DEMO_WORK_ORDERS)
      setIsDemo(true)
      setLoading(false)
      return
    }

    setLoading(true)

    const { data: profile } = await supabase
      .from('profiles')
      .select('org_id')
      .eq('id', user.id)
      .single()

    if (!profile?.org_id) {
      setPlants(DEMO_PLANTS)
      setWorkOrders(DEMO_WORK_ORDERS)
      setIsDemo(true)
      setLoading(false)
      return
    }

    const [plantsRes, ordersRes] = await Promise.all([
      supabase.from('plants').select('id, name').eq('org_id', profile.org_id).order('name'),
      supabase
        .from('work_orders')
        .select('*, plants(name)')
        .eq('org_id', profile.org_id)
        .order('created_at', { ascending: false }),
    ])

    if (!plantsRes.data?.length && !ordersRes.data?.length) {
      setPlants(DEMO_PLANTS)
      setWorkOrders(DEMO_WORK_ORDERS)
      setIsDemo(true)
    } else {
      setPlants(plantsRes.data || [])
      setWorkOrders(ordersRes.data || [])
      setIsDemo(false)
    }

    setLoading(false)
  }, [user])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const filteredOrders = useMemo(() => {
    let orders = [...workOrders]

    if (plantFilter !== 'all') {
      orders = orders.filter((o) => o.plant_id === plantFilter)
    }

    if (dateFrom) {
      orders = orders.filter((o) => new Date(o.created_at) >= new Date(dateFrom))
    }

    if (dateTo) {
      orders = orders.filter((o) => new Date(o.created_at) <= new Date(dateTo + 'T23:59:59'))
    }

    return orders
  }, [workOrders, plantFilter, dateFrom, dateTo])

  const stats = useMemo(() => {
    const total = filteredOrders.length || (isDemo ? 1246 : 0)
    const statusCounts = countBy(filteredOrders, 'status')
    const open = statusCounts.open || (isDemo ? 278 : 0)
    const inProgress = statusCounts.in_progress || (isDemo ? 356 : 0)
    const completed = statusCounts.completed || (isDemo ? 532 : 0)
    const overdue = statusCounts.overdue || (isDemo ? 80 : 0)
    const scheduled = statusCounts.scheduled || (isDemo ? 0 : 0)

    const demoTotal = isDemo && plantFilter === 'all' && !dateFrom && !dateTo

    return {
      total: demoTotal ? 1246 : total,
      open: demoTotal ? 278 : open,
      inProgress: demoTotal ? 356 : inProgress,
      completed: demoTotal ? 532 : completed,
      overdue: demoTotal ? 80 : overdue,
      scheduled: demoTotal ? 0 : scheduled,
      trendPercent: 12.5,
      slaPercent: 92,
      slaTrend: 8,
    }
  }, [filteredOrders, isDemo, plantFilter, dateFrom, dateTo])

  const statusBreakdown = useMemo(() => {
    if (isDemo && plantFilter === 'all' && !dateFrom && !dateTo) {
      return [
        { status: 'open', count: 278, percent: 22.3 },
        { status: 'in_progress', count: 356, percent: 28.6 },
        { status: 'scheduled', count: 0, percent: 0 },
        { status: 'completed', count: 532, percent: 42.8 },
        { status: 'overdue', count: 80, percent: 6.4 },
      ]
    }
    const counts = countBy(filteredOrders, 'status')
    const total = filteredOrders.length || 1
    return ['open', 'in_progress', 'scheduled', 'completed', 'overdue'].map((status) => ({
      status,
      count: counts[status] || 0,
      percent: Math.round(((counts[status] || 0) / total) * 1000) / 10,
    }))
  }, [filteredOrders, isDemo, plantFilter, dateFrom, dateTo])

  const priorityBreakdown = useMemo(() => {
    if (isDemo && plantFilter === 'all' && !dateFrom && !dateTo) {
      return [
        { priority: 'high', count: 374, percent: 30 },
        { priority: 'medium', count: 561, percent: 45 },
        { priority: 'low', count: 311, percent: 25 },
      ]
    }
    const counts = countBy(filteredOrders, 'priority')
    const total = filteredOrders.length || 1
    return ['high', 'medium', 'low'].map((priority) => ({
      priority,
      count: counts[priority] || 0,
      percent: Math.round(((counts[priority] || 0) / total) * 1000) / 10,
    }))
  }, [filteredOrders, isDemo, plantFilter, dateFrom, dateTo])

  const plantBreakdown = useMemo(() => {
    if (isDemo && plantFilter === 'all') return PLANT_COUNTS
    const counts = {}
    filteredOrders.forEach((o) => {
      const name = o.plants?.name || plants.find((p) => p.id === o.plant_id)?.name || 'Unknown'
      counts[name] = (counts[name] || 0) + 1
    })
    return Object.entries(counts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
  }, [filteredOrders, plants, isDemo, plantFilter])

  const createWorkOrder = async ({ title, plantId, priority, status }) => {
    if (isDemo || !isSupabaseConfigured || !supabase || !user) {
      const newOrder = {
        id: String(Date.now()),
        work_order_number: `WO-${1266 + workOrders.length}`,
        title,
        status: status || 'open',
        priority: priority || 'medium',
        plant_id: plantId,
        plants: { name: plants.find((p) => p.id === plantId)?.name || 'Plant 1' },
        created_at: new Date().toISOString(),
        scheduled_at: new Date(Date.now() + 86400000).toISOString(),
      }
      setWorkOrders((prev) => [newOrder, ...prev])
      return { data: newOrder, error: null }
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('org_id')
      .eq('id', user.id)
      .single()

    if (!profile?.org_id) return { data: null, error: { message: 'No organization found' } }

    const { count } = await supabase
      .from('work_orders')
      .select('*', { count: 'exact', head: true })
      .eq('org_id', profile.org_id)

    const woNumber = `WO-${1260 + (count || 0)}`

    const { data, error } = await supabase
      .from('work_orders')
      .insert({
        org_id: profile.org_id,
        plant_id: plantId || null,
        work_order_number: woNumber,
        title,
        status: status || 'open',
        priority: priority || 'medium',
        created_by: user.id,
        scheduled_at: new Date(Date.now() + 86400000).toISOString(),
      })
      .select('*, plants(name)')
      .single()

    if (!error) await fetchData()
    return { data, error }
  }

  return {
    loading,
    isDemo,
    plants,
    workOrders: filteredOrders,
    recentOrders: filteredOrders.slice(0, 5),
    upcomingTasks: UPCOMING_TASKS,
    trendData: TREND_DATA,
    plantBreakdown,
    statusBreakdown,
    priorityBreakdown,
    stats,
    plantFilter,
    setPlantFilter,
    dateFrom,
    setDateFrom,
    dateTo,
    setDateTo,
    createWorkOrder,
    refresh: fetchData,
  }
}
