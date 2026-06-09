import { Router } from 'express'
import { requireAdmin } from '../middleware/auth.js'

const router = Router()

// GET /redemptions?customer_id=uuid&page=1&limit=20
router.get('/', requireAdmin, async (req, res) => {
  const { supabase } = res.locals.admin
  const page = Math.max(1, Number(req.query.page) || 1)
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20))
  const offset = (page - 1) * limit
  const customerId = req.query.customer_id as string | undefined

  let query = supabase
    .from('redemptions')
    .select('*, customers(phone, name)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (customerId) query = query.eq('customer_id', customerId)

  const { data, error, count } = await query
  if (error) { res.status(500).json({ error: error.message }); return }
  res.json({ data, total: count ?? 0, page, limit })
})

// POST /redemptions
// Body: { customer_id: string, points_redeemed: number, reward_type: string }
router.post('/', requireAdmin, async (req, res) => {
  const { supabase } = res.locals.admin
  const { customer_id, points_redeemed, reward_type } = req.body as {
    customer_id?: string
    points_redeemed?: unknown
    reward_type?: string
  }

  if (!customer_id) { res.status(400).json({ error: 'customer_id is required' }); return }
  if (!reward_type?.trim()) { res.status(400).json({ error: 'reward_type is required' }); return }

  const pts = Number(points_redeemed)
  if (!Number.isInteger(pts) || pts < 1) {
    res.status(400).json({ error: 'points_redeemed must be a positive integer' })
    return
  }

  const { data, error } = await supabase.rpc('redeem_points', {
    p_customer_id:      customer_id,
    p_points_to_redeem: pts,
    p_reward_type:      reward_type.trim(),
  })

  if (error) {
    const code = (error as { code?: string }).code
    if (code === '55P03') {
      res.status(409).json({ error: 'redemption in progress for this customer, please retry' })
      return
    }
    if (code === 'P0005') { res.status(404).json({ error: 'customer not found' }); return }
    if (code === 'P0006') { res.status(409).json({ error: error.message }); return }
    res.status(500).json({ error: error.message })
    return
  }

  res.status(201).json(data)
})

export default router
