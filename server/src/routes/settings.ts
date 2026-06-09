import { Router } from 'express'
import { requireAdmin } from '../middleware/auth.js'

const router = Router()

// GET /settings  — all admins can read
router.get('/', requireAdmin, async (req, res) => {
  const { supabase } = res.locals.admin

  const { data, error } = await supabase
    .from('tenant_settings')
    .select('points_per_order, points_for_reward, expiry_days, updated_at')
    .single()

  if (error) { res.status(500).json({ error: error.message }); return }
  res.json(data)
})

// PATCH /settings  — owner only (enforced by RLS policy in 002)
// Body: { points_per_order?, points_for_reward?, expiry_days? }
router.patch('/', requireAdmin, async (req, res) => {
  const { supabase, role } = res.locals.admin

  if (role !== 'owner') {
    res.status(403).json({ error: 'only owners can update settings' })
    return
  }

  const { points_per_order, points_for_reward, expiry_days } = req.body as {
    points_per_order?: unknown
    points_for_reward?: unknown
    expiry_days?: unknown
  }

  const patch: Record<string, number> = {}

  for (const [key, val] of [
    ['points_per_order', points_per_order],
    ['points_for_reward', points_for_reward],
    ['expiry_days', expiry_days],
  ] as [string, unknown][]) {
    if (val !== undefined) {
      const n = Number(val)
      if (!Number.isInteger(n) || n < 1) {
        res.status(400).json({ error: `${key} must be a positive integer` })
        return
      }
      patch[key] = n
    }
  }

  if (Object.keys(patch).length === 0) {
    res.status(400).json({ error: 'no fields to update' })
    return
  }

  const { data, error } = await supabase
    .from('tenant_settings')
    .update(patch)
    .select('points_per_order, points_for_reward, expiry_days, updated_at')
    .single()

  if (error) { res.status(500).json({ error: error.message }); return }
  res.json(data)
})

export default router
