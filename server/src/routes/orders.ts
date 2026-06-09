import { Router } from 'express'
import { requireAdmin } from '../middleware/auth.js'

const router = Router()

// GET /orders?page=1&limit=20&status=pending
// Owner: all orders in the tenant. Manager: their location only (enforced by RLS).
router.get('/', requireAdmin, async (req, res) => {
  const { supabase } = res.locals.admin
  const page = Math.max(1, Number(req.query.page) || 1)
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20))
  const offset = (page - 1) * limit
  const status = req.query.status as string | undefined

  let query = supabase
    .from('orders')
    .select('*, customers(id, phone, name)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (status === 'pending' || status === 'completed') {
    query = query.eq('status', status)
  }

  const { data, error, count } = await query

  if (error) {
    res.status(500).json({ error: error.message })
    return
  }

  res.json({ data, total: count ?? 0, page, limit })
})

// POST /orders
// Body: { location_id: string }
router.post('/', requireAdmin, async (req, res) => {
  const { supabase, tenantId, role, locationId } = res.locals.admin
  const { location_id } = req.body as { location_id?: string }

  if (!location_id) {
    res.status(400).json({ error: 'location_id is required' })
    return
  }

  // Manager can only create orders for their own location.
  if (role === 'manager' && location_id !== locationId) {
    res.status(403).json({ error: 'managers can only create orders for their location' })
    return
  }

  const { data, error } = await supabase
    .from('orders')
    .insert({ tenant_id: tenantId, location_id, source: 'admin_manual' })
    .select()
    .single()

  if (error) {
    res.status(500).json({ error: error.message })
    return
  }

  res.status(201).json(data)
})

// POST /orders/:id/complete
// Body: { customer_phone: string }
// Delegates to the complete_order() RPC which handles everything atomically.
router.post('/:id/complete', requireAdmin, async (req, res) => {
  const { supabase } = res.locals.admin
  const orderId = req.params.id
  const { customer_phone } = req.body as { customer_phone?: string }

  if (!customer_phone) {
    res.status(400).json({ error: 'customer_phone is required' })
    return
  }

  const { data, error } = await supabase.rpc('complete_order', {
    p_order_id: orderId,
    p_customer_phone: customer_phone,
  })

  if (error) {
    const code = error.code
    // Map Postgres custom error codes from the RPC to HTTP status codes.
    if (code === 'P0001') { res.status(401).json({ error: 'unauthorized' }); return }
    if (code === 'P0002') { res.status(404).json({ error: 'order not found' }); return }
    if (code === 'P0003') { res.status(403).json({ error: 'access denied' }); return }
    if (code === 'P0004') { res.status(409).json({ error: 'order already completed' }); return }
    res.status(500).json({ error: error.message })
    return
  }

  res.json(data)
})

export default router
