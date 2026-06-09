import { Router } from 'express'
import { requireAdmin } from '../middleware/auth.js'
import { supabaseAdmin } from '../lib/supabase.js'

const router = Router()

// GET /customers?page=1&limit=20&search=phone_or_name
router.get('/', requireAdmin, async (req, res) => {
  const { supabase } = res.locals.admin
  const page = Math.max(1, Number(req.query.page) || 1)
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20))
  const offset = (page - 1) * limit
  const search = (req.query.search as string | undefined)?.trim()

  let query = supabase
    .from('customers')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (search) {
    // Escape characters that have structural meaning in PostgREST filter syntax
    // (comma = condition separator, parens = grouping) and SQL ilike wildcards
    // (% and _) so the search is treated as a literal substring match.
    const safe = search.replace(/[%_,()]/g, '\\$&')
    query = query.or(`phone.ilike.%${safe}%,name.ilike.%${safe}%`)
  }

  const { data, error, count } = await query

  if (error) {
    res.status(500).json({ error: error.message })
    return
  }

  res.json({ data, total: count ?? 0, page, limit })
})

// POST /customers
// Body: { phone: string, name?: string }
router.post('/', requireAdmin, async (req, res) => {
  const { supabase, tenantId } = res.locals.admin
  const { phone, name } = req.body as { phone?: string; name?: string }

  if (!phone) {
    res.status(400).json({ error: 'phone is required' })
    return
  }

  const { data, error } = await supabase
    .from('customers')
    .insert({ tenant_id: tenantId, phone, name: name ?? null })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      res.status(409).json({ error: 'customer with this phone already exists' })
      return
    }
    res.status(500).json({ error: error.message })
    return
  }

  res.status(201).json(data)
})

// GET /customers/by-token/:token  — public route (no JWT required)
// Used by the customer-facing PWA to display point balance via registration link.
// Uses the service-role client to bypass RLS; tenant scoping is enforced by the
// unique(tenant_id, registration_token) constraint — tokens are unguessable UUIDs.
router.get('/by-token/:token', async (req, res) => {
  const { token } = req.params

  // Basic UUID format check to avoid unnecessary DB queries.
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!uuidPattern.test(token)) {
    res.status(404).json({ error: 'not found' })
    return
  }

  const { data: customer, error: customerError } = await supabaseAdmin
    .from('customers')
    .select('id, tenant_id, phone, name, registration_token, created_at')
    .eq('registration_token', token)
    .single()

  if (customerError || !customer) {
    res.status(404).json({ error: 'not found' })
    return
  }

  // Sum non-expired remaining points for the balance.
  const { data: txRows, error: txError } = await supabaseAdmin
    .from('point_transactions')
    .select('id, points_earned, remaining_points, expires_at, created_at')
    .eq('tenant_id', customer.tenant_id)
    .eq('customer_id', customer.id)
    .gt('remaining_points', 0)
    .gt('expires_at', new Date().toISOString())
    .order('expires_at', { ascending: true })

  if (txError) {
    res.status(500).json({ error: txError.message })
    return
  }

  const balance = (txRows ?? []).reduce((sum, tx) => sum + tx.remaining_points, 0)

  const { data: settings } = await supabaseAdmin
    .from('tenant_settings')
    .select('points_for_reward')
    .eq('tenant_id', customer.tenant_id)
    .single()

  res.json({
    customer: { name: customer.name, phone: customer.phone },
    balance,
    points_for_reward: settings?.points_for_reward ?? null,
    transactions: txRows ?? [],
  })
})

export default router
