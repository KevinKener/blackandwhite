import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://localhost:54321'
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const ANON_KEY = process.env.SUPABASE_ANON_KEY ?? ''

if (!SERVICE_KEY || !ANON_KEY) {
  throw new Error('SUPABASE_SERVICE_ROLE_KEY and SUPABASE_ANON_KEY must be set')
}

export const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
})

export function anonClient() {
  return createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } })
}

export interface TenantFixture {
  tenantId: string
  locationId: string
  ownerClient: ReturnType<typeof createClient>
  managerClient: ReturnType<typeof createClient>
  ownerEmail: string
  managerEmail: string
}

let fixtureCount = 0

export async function createTenantFixture(): Promise<TenantFixture> {
  const n = ++fixtureCount
  const ownerEmail = `test-owner-${n}-${Date.now()}@example.com`
  const managerEmail = `test-manager-${n}-${Date.now()}@example.com`
  const password = 'test-password-123'

  // 1. Create tenant
  const { data: tenant } = await admin.from('tenants').insert({ name: `Test Tenant ${n}` }).select('id').single()
  const tenantId = tenant!.id

  // 2. Create location
  const { data: location } = await admin.from('locations').insert({ tenant_id: tenantId, name: `Local ${n}` }).select('id').single()
  const locationId = location!.id

  // 3. Create auth users
  const { data: ownerAuth } = await admin.auth.admin.createUser({ email: ownerEmail, password, email_confirm: true })
  const { data: managerAuth } = await admin.auth.admin.createUser({ email: managerEmail, password, email_confirm: true })

  // 4. Insert admin_users (auth hook picks these up on next sign-in)
  await admin.from('admin_users').insert([
    { user_id: ownerAuth.user!.id, tenant_id: tenantId, role: 'owner', location_id: null },
    { user_id: managerAuth.user!.id, tenant_id: tenantId, role: 'manager', location_id: locationId },
  ])

  // 5. Sign in to get JWTs with claims injected by the auth hook
  const ownerClient = anonClient()
  const managerClient = anonClient()
  await ownerClient.auth.signInWithPassword({ email: ownerEmail, password })
  await managerClient.auth.signInWithPassword({ email: managerEmail, password })

  return { tenantId, locationId, ownerClient, managerClient, ownerEmail, managerEmail }
}

export async function cleanupTenant(tenantId: string) {
  // Cascade delete: tenants → locations, admin_users, customers, orders, etc.
  await admin.from('tenants').delete().eq('id', tenantId)
}
