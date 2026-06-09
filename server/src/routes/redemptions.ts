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
// The employee marks that a customer redeemed their points for a reward.
// This records the event; the actual discount is applied manually (Phase 1: Opción A).
router.post('/', requireAdmin, async (req, res) => {
  const { supabase, tenantId } = res.locals.admin
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

  // Verify the customer has enough active (non-expired) points.
  const { data: txRows, error: txError } = await supabase
    .from('point_transactions')
    .select('id, remaining_points, expires_at')
    .eq('tenant_id', tenantId)
    .eq('customer_id', customer_id)
    .gt('remaining_points', 0)
    .gt('expires_at', new Date().toISOString())
    .order('expires_at', { ascending: true })

  if (txError) { res.status(500).json({ error: txError.message }); return }

  const balance = (txRows ?? []).reduce((s, t) => s + t.remaining_points, 0)
  if (balance < pts) {
    res.status(409).json({ error: `insufficient points: balance is ${balance}, requested ${pts}` })
    return
  }

  // FIFO: deduct from soonest-to-expire transactions first.
  let remaining = pts
  const updates: Array<{ id: string; remaining_points: number }> = []

  for (const tx of txRows ?? []) {
    if (remaining <= 0) break
    const deduct = Math.min(tx.remaining_points, remaining)
    updates.push({ id: tx.id, remaining_points: tx.remaining_points - deduct })
    remaining -= deduct
  }

  // Apply deductions + insert redemption record in a single RPC call for
  // atomicity. Since we don't have a dedicated RPC for this yet, we run
  // the updates sequentially inside a try/catch. A future migration can
  // wrap this in a SECURITY DEFINER function if needed.
  for (const u of updates) {
    const { error: upErr } = await supabase
      .from('point_transactions')
      .update({ remaining_points: u.remaining_points })
      .eq('id', u.id)

    if (upErr) { res.status(500).json({ error: upErr.message }); return }
  }

  const { data, error } = await supabase
    .from('redemptions')
    .insert({ tenant_id: tenantId, customer_id, points_redeemed: pts, reward_type: reward_type.trim() })
    .select()
    .single()

  if (error) { res.status(500).json({ error: error.message }); return }
  res.status(201).json({ ...data, new_balance: balance - pts })
})

export default router
