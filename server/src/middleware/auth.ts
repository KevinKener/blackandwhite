import type { Request, Response, NextFunction } from 'express'
import { createUserClient, supabaseAdmin } from '../lib/supabase.js'

export interface AdminContext {
  supabase: ReturnType<typeof createUserClient>
  tenantId: string
  role: 'owner' | 'manager'
  locationId: string | null
  userId: string
}

declare global {
  namespace Express {
    interface Locals {
      admin: AdminContext
    }
  }
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '')
  if (!token) {
    res.status(401).json({ error: 'missing authorization header' })
    return
  }

  const supabase = createUserClient(token)
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) {
    res.status(401).json({ error: 'invalid or expired token' })
    return
  }

  let meta = user.app_metadata as Record<string, unknown>
  let tenantId = meta?.tenant_id
  let role = meta?.role
  let locationId: string | null = typeof meta?.location_id === 'string' ? meta.location_id : null

  // Fallback for local dev: auth hook doesn't fire in Supabase CLI local,
  // so app_metadata arrives empty. Query admin_users directly instead.
  if (typeof tenantId !== 'string' || (role !== 'owner' && role !== 'manager')) {
    const { data: adminRow } = await supabaseAdmin
      .from('admin_users')
      .select('tenant_id, role, location_id')
      .eq('user_id', user.id)
      .single()

    if (!adminRow || (adminRow.role !== 'owner' && adminRow.role !== 'manager')) {
      res.status(403).json({ error: 'missing claims — verify auth hook is registered' })
      return
    }

    tenantId = adminRow.tenant_id
    role = adminRow.role
    locationId = adminRow.location_id ?? null
  }

  res.locals.admin = {
    supabase,
    tenantId: tenantId as string,
    role: role as 'owner' | 'manager',
    locationId,
    userId: user.id,
  }

  next()
}
