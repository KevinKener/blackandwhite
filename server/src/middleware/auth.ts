import type { Request, Response, NextFunction } from 'express'
import { createUserClient } from '../lib/supabase.js'

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

  const meta = user.app_metadata as Record<string, unknown>
  const tenantId = meta?.tenant_id
  const role = meta?.role

  if (typeof tenantId !== 'string' || (role !== 'owner' && role !== 'manager')) {
    // Auth hook not yet registered, or user has no admin_users record.
    res.status(403).json({ error: 'missing claims — verify auth hook is registered' })
    return
  }

  res.locals.admin = {
    supabase,
    tenantId,
    role,
    locationId: typeof meta?.location_id === 'string' ? meta.location_id : null,
    userId: user.id,
  }

  next()
}
