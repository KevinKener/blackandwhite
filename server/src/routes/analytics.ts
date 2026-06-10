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
  const { supabase, tenantId } = res.locals.admin

  const { data, error } = await supabase.rpc('get_analytics_summary', { p_tenant_id: tenantId })

  if (error) {
    res.status(500).json({ error: error.message })
    return
  }

  res.json(data)
})

export default router
