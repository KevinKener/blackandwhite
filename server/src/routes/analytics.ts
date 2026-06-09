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

  const [ordersResult, customersResult, pointsResult, activePointsResult] = await Promise.all([
    supabase
      .from('orders')
      .select('status', { count: 'exact', head: false }),

    supabase
      .from('customers')
      .select('id', { count: 'exact', head: true }),

    supabase
      .from('point_transactions')
      .select('points_earned.sum()', { count: 'exact', head: false }),

    supabase
      .from('point_transactions')
      .select('remaining_points.sum()')
      .gt('remaining_points', 0)
      .gt('expires_at', new Date().toISOString()),
  ])

  if (ordersResult.error || customersResult.error || pointsResult.error || activePointsResult.error) {
    const err = ordersResult.error ?? customersResult.error ?? pointsResult.error ?? activePointsResult.error
    res.status(500).json({ error: err?.message })
    return
  }

  const orders = ordersResult.data ?? []
  const totalOrders = orders.length
  const completedOrders = orders.filter((o) => o.status === 'completed').length
  const pendingOrders = totalOrders - completedOrders

  const totalPointsIssued = (pointsResult.data as Array<{ points_earned: number }>)
    .reduce((sum, row) => sum + (row.points_earned ?? 0), 0)

  const activePoints = (activePointsResult.data as Array<{ remaining_points: number }>)
    .reduce((sum, row) => sum + (row.remaining_points ?? 0), 0)

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
