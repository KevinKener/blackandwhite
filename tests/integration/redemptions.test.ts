/**
 * redeem_points() RPC — integration tests
 *
 * Covers:
 * - Happy path: deducts points and returns correct new_balance
 * - FIFO: consumes soonest-to-expire transactions first
 * - Partial FIFO: deducts across multiple transactions when needed
 * - Insufficient balance → P0006
 * - Customer from a different tenant → P0005
 * - Manager (not just owner) can redeem
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { admin, createTenantFixture, cleanupTenant, type TenantFixture } from './helpers/setup.ts'

let t: TenantFixture

beforeAll(async () => {
  t = await createTenantFixture()
})

afterAll(async () => {
  await cleanupTenant(t.tenantId)
})

// ── helpers ──────────────────────────────────────────────────────────────────

async function createCustomer(tenantId: string, phone: string) {
  const { data } = await admin
    .from('customers')
    .insert({ tenant_id: tenantId, phone })
    .select('id')
    .single()
  return data!.id as string
}

async function insertPointTx(opts: {
  tenantId: string
  customerId: string
  points: number
  expiresAt: Date
}) {
  // point_transactions requires an order_id FK — create a dummy completed order
  const { data: order } = await admin
    .from('orders')
    .insert({
      tenant_id: opts.tenantId,
      location_id: t.locationId,
      source: 'admin_manual',
      status: 'completed',
      completed_at: new Date().toISOString(),
    })
    .select('id')
    .single()

  const { data: tx } = await admin
    .from('point_transactions')
    .insert({
      tenant_id: opts.tenantId,
      customer_id: opts.customerId,
      order_id: order!.id,
      points_earned: opts.points,
      remaining_points: opts.points,
      expires_at: opts.expiresAt.toISOString(),
    })
    .select('id')
    .single()
  return tx!.id as string
}

function future(days: number) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000)
}

async function getRemaining(txId: string) {
  const { data } = await admin
    .from('point_transactions')
    .select('remaining_points')
    .eq('id', txId)
    .single()
  return data!.remaining_points as number
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('redeem_points() RPC', () => {
  it('deducts points and returns correct new_balance', async () => {
    const phone = `+549120001${Date.now().toString().slice(-5)}`
    const customerId = await createCustomer(t.tenantId, phone)
    await insertPointTx({ tenantId: t.tenantId, customerId, points: 10, expiresAt: future(30) })

    const { data, error } = await t.ownerClient.rpc('redeem_points', {
      p_customer_id: customerId,
      p_points_to_redeem: 10,
      p_reward_type: 'Bebida gratis',
    })

    expect(error).toBeNull()
    expect(data.points_redeemed).toBe(10)
    expect(data.new_balance).toBe(0)
    expect(data.reward_type).toBe('Bebida gratis')
    expect(data.customer_id).toBe(customerId)
    expect(data.id).toBeTruthy()
  })

  it('FIFO: deducts from soonest-to-expire transaction first', async () => {
    const phone = `+549120002${Date.now().toString().slice(-5)}`
    const customerId = await createCustomer(t.tenantId, phone)

    // tx1 expires in 10 days (sooner), tx2 expires in 60 days
    const tx1 = await insertPointTx({ tenantId: t.tenantId, customerId, points: 5, expiresAt: future(10) })
    const tx2 = await insertPointTx({ tenantId: t.tenantId, customerId, points: 5, expiresAt: future(60) })

    const { error } = await t.ownerClient.rpc('redeem_points', {
      p_customer_id: customerId,
      p_points_to_redeem: 5,
      p_reward_type: 'Hamburguesa gratis',
    })

    expect(error).toBeNull()
    expect(await getRemaining(tx1)).toBe(0)  // tx1 fully consumed
    expect(await getRemaining(tx2)).toBe(5)  // tx2 untouched
  })

  it('partial FIFO: deducts across multiple transactions when needed', async () => {
    const phone = `+549120003${Date.now().toString().slice(-5)}`
    const customerId = await createCustomer(t.tenantId, phone)

    const tx1 = await insertPointTx({ tenantId: t.tenantId, customerId, points: 3, expiresAt: future(10) })
    const tx2 = await insertPointTx({ tenantId: t.tenantId, customerId, points: 7, expiresAt: future(60) })

    const { data, error } = await t.ownerClient.rpc('redeem_points', {
      p_customer_id: customerId,
      p_points_to_redeem: 8,
      p_reward_type: 'Papas gratis',
    })

    expect(error).toBeNull()
    expect(data.new_balance).toBe(2)
    expect(await getRemaining(tx1)).toBe(0)  // fully consumed
    expect(await getRemaining(tx2)).toBe(2)  // partially consumed
  })

  it('rejects when balance is insufficient → P0006', async () => {
    const phone = `+549120004${Date.now().toString().slice(-5)}`
    const customerId = await createCustomer(t.tenantId, phone)
    await insertPointTx({ tenantId: t.tenantId, customerId, points: 5, expiresAt: future(30) })

    const { error } = await t.ownerClient.rpc('redeem_points', {
      p_customer_id: customerId,
      p_points_to_redeem: 10,
      p_reward_type: 'Recompensa',
    })

    expect(error).not.toBeNull()
    expect(error!.code).toBe('P0006')
  })

  it('rejects when customer belongs to a different tenant → P0005', async () => {
    // Create a second tenant and a customer in it
    const { data: otherTenant } = await admin
      .from('tenants')
      .insert({ name: 'Other Tenant' })
      .select('id')
      .single()
    const otherTenantId = otherTenant!.id

    const phone = `+549120005${Date.now().toString().slice(-5)}`
    const { data: otherCustomer } = await admin
      .from('customers')
      .insert({ tenant_id: otherTenantId, phone })
      .select('id')
      .single()

    const { error } = await t.ownerClient.rpc('redeem_points', {
      p_customer_id: otherCustomer!.id,
      p_points_to_redeem: 1,
      p_reward_type: 'Recompensa',
    })

    expect(error).not.toBeNull()
    expect(error!.code).toBe('P0005')

    // cleanup
    await admin.from('tenants').delete().eq('id', otherTenantId)
  })

  it('expired points are not counted toward balance', async () => {
    const phone = `+549120006${Date.now().toString().slice(-5)}`
    const customerId = await createCustomer(t.tenantId, phone)

    // Insert an expired transaction (expires_at in the past)
    await insertPointTx({
      tenantId: t.tenantId,
      customerId,
      points: 20,
      expiresAt: new Date(Date.now() - 1000),  // already expired
    })

    const { error } = await t.ownerClient.rpc('redeem_points', {
      p_customer_id: customerId,
      p_points_to_redeem: 1,
      p_reward_type: 'Recompensa',
    })

    // Should fail with insufficient balance because the only tx is expired
    expect(error).not.toBeNull()
    expect(error!.code).toBe('P0006')
  })

  it('manager can also redeem points', async () => {
    const phone = `+549120007${Date.now().toString().slice(-5)}`
    const customerId = await createCustomer(t.tenantId, phone)
    await insertPointTx({ tenantId: t.tenantId, customerId, points: 5, expiresAt: future(30) })

    const { data, error } = await t.managerClient.rpc('redeem_points', {
      p_customer_id: customerId,
      p_points_to_redeem: 5,
      p_reward_type: 'Combo gratis',
    })

    expect(error).toBeNull()
    expect(data.new_balance).toBe(0)
  })

  it('inserts a redemption record in the database', async () => {
    const phone = `+549120008${Date.now().toString().slice(-5)}`
    const customerId = await createCustomer(t.tenantId, phone)
    await insertPointTx({ tenantId: t.tenantId, customerId, points: 10, expiresAt: future(30) })

    const { data } = await t.ownerClient.rpc('redeem_points', {
      p_customer_id: customerId,
      p_points_to_redeem: 10,
      p_reward_type: 'Premio especial',
    })

    const { data: row } = await admin
      .from('redemptions')
      .select('*')
      .eq('id', data.id)
      .single()

    expect(row).not.toBeNull()
    expect(row!.tenant_id).toBe(t.tenantId)
    expect(row!.customer_id).toBe(customerId)
    expect(row!.points_redeemed).toBe(10)
    expect(row!.reward_type).toBe('Premio especial')
  })
})
