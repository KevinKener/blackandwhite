import { supabase } from './supabase.ts'

const API_BASE = import.meta.env.VITE_API_URL ?? '/api'

async function authFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token

  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new ApiError(res.status, body.error ?? res.statusText)
  }

  return res
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

// Orders
export async function getOrders(params: { page?: number; limit?: number; status?: string } = {}) {
  const qs = new URLSearchParams()
  if (params.page) qs.set('page', String(params.page))
  if (params.limit) qs.set('limit', String(params.limit))
  if (params.status) qs.set('status', params.status)
  const res = await authFetch(`/orders?${qs}`)
  return res.json() as Promise<{ data: Order[]; total: number; page: number; limit: number }>
}

export async function createOrder(locationId: string) {
  const res = await authFetch('/orders', {
    method: 'POST',
    body: JSON.stringify({ location_id: locationId }),
  })
  return res.json() as Promise<Order>
}

export async function completeOrder(orderId: string, customerPhone: string) {
  const res = await authFetch(`/orders/${orderId}/complete`, {
    method: 'POST',
    body: JSON.stringify({ customer_phone: customerPhone }),
  })
  return res.json() as Promise<CompleteOrderResult>
}

// Customers
export async function getCustomers(params: { page?: number; limit?: number; search?: string } = {}) {
  const qs = new URLSearchParams()
  if (params.page) qs.set('page', String(params.page))
  if (params.limit) qs.set('limit', String(params.limit))
  if (params.search) qs.set('search', params.search)
  const res = await authFetch(`/customers?${qs}`)
  return res.json() as Promise<{ data: Customer[]; total: number; page: number; limit: number }>
}

export async function createCustomer(phone: string, name?: string) {
  const res = await authFetch('/customers', {
    method: 'POST',
    body: JSON.stringify({ phone, name }),
  })
  return res.json() as Promise<Customer>
}

// Analytics
export async function getAnalyticsSummary() {
  const res = await authFetch('/analytics/summary')
  return res.json() as Promise<AnalyticsSummary>
}

// Types
export interface Order {
  id: string
  tenant_id: string
  location_id: string
  customer_id: string | null
  status: 'pending' | 'completed'
  source: 'admin_manual' | 'customer_pwa'
  created_at: string
  completed_at: string | null
  customers: { id: string; phone: string; name: string | null } | null
}

export interface Customer {
  id: string
  tenant_id: string
  phone: string
  name: string | null
  registration_token: string
  created_at: string
}

export interface CompleteOrderResult {
  order_id: string
  customer_id: string
  transaction_id: string
  points_earned: number
  expires_at: string
}

export interface AnalyticsSummary {
  orders: { total: number; completed: number; pending: number }
  customers: { total: number }
  points: { total_issued: number; active_balance: number }
}

export interface TenantSettings {
  points_per_order: number
  points_for_reward: number
  expiry_days: number
  updated_at: string
}

export interface Redemption {
  id: string
  tenant_id: string
  customer_id: string
  points_redeemed: number
  reward_type: string
  created_at: string
  customers: { phone: string; name: string | null } | null
}

// Settings
export async function getSettings() {
  const res = await authFetch('/settings')
  return res.json() as Promise<TenantSettings>
}

export async function updateSettings(patch: Partial<Pick<TenantSettings, 'points_per_order' | 'points_for_reward' | 'expiry_days'>>) {
  const res = await authFetch('/settings', { method: 'PATCH', body: JSON.stringify(patch) })
  return res.json() as Promise<TenantSettings>
}

// Redemptions
export async function getRedemptions(params: { customer_id?: string; page?: number; limit?: number } = {}) {
  const qs = new URLSearchParams()
  if (params.customer_id) qs.set('customer_id', params.customer_id)
  if (params.page) qs.set('page', String(params.page))
  if (params.limit) qs.set('limit', String(params.limit))
  const res = await authFetch(`/redemptions?${qs}`)
  return res.json() as Promise<{ data: Redemption[]; total: number; page: number; limit: number }>
}

export async function createRedemption(customerId: string, pointsRedeemed: number, rewardType: string) {
  const res = await authFetch('/redemptions', {
    method: 'POST',
    body: JSON.stringify({ customer_id: customerId, points_redeemed: pointsRedeemed, reward_type: rewardType }),
  })
  return res.json() as Promise<Redemption & { new_balance: number }>
}
