import { Router } from 'express'
import { requireAdmin } from '../middleware/auth.js'

const router = Router()

// GET /analytics/summary
// Returns key Phase 1 metrics for the admin dashboard:
//   - total orders and breakdown by status
//   - total customers
//   - total points issued and currently active (non-expired)
//   - number of customers who have received at least one order (adoption rate input)
router.get('/summary', requireAdmin, async (req, res) => {
  const { supabase } = res.locals.admin

  const [pendingResult, completedResult, customersResult, pointsResult, activePointsResult] = await Promise.all([
    supabase.from('orders').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('orders').select('*', { count: 'exact', head: true }).eq('status', 'completed'),
    supabase.from('customers').select('*', { count: 'exact', head: true }),
    supabase.from('point_transactions').select('points_earned.sum()'),
    supabase
      .from('point_transactions')
      .select('remaining_points.sum()')
      .gt('remaining_points', 0)
      .gt('expires_at', new Date().toISOString()),
  ])

  if (pendingResult.error || completedResult.error || customersResult.error || pointsResult.error || activePointsResult.error) {
    const err = pendingResult.error ?? completedResult.error ?? customersResult.error ?? pointsResult.error ?? activePointsResult.error
    res.status(500).json({ error: err?.message })
    return
  }

  const pendingOrders = pendingResult.count ?? 0
  const completedOrders = completedResult.count ?? 0
  const totalOrders = pendingOrders + completedOrders

  // PostgREST aggregate syntax returns { sum: value }, not { field_name: value }.
  const totalPointsIssued = (pointsResult.data as Array<{ sum: number }>)[0]?.sum ?? 0
  const activePoints = (activePointsResult.data as Array<{ sum: number }>)[0]?.sum ?? 0

  res.json({
    orders: {
      total: totalOrders,
      completed: completedOrders,
      pending: pendingOrders,
    },
    customers: {
      total: customersResult.count ?? 0,
    },
    points: {
      total_issued: totalPointsIssued,
      active_balance: activePoints,
    },
  })
})

export default router
