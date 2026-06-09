/**
 * CRÍTICO — RLS tenant isolation (from test plan)
 *
 * These tests use two real Supabase Auth users (tenant A, tenant B) so the
 * auth hook injects the correct JWT claims. Every query goes through RLS.
 *
 * Run against local Supabase: supabase start && supabase db reset
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { admin, createTenantFixture, cleanupTenant, type TenantFixture } from './helpers/setup.ts'

let tenantA: TenantFixture
let tenantB: TenantFixture

beforeAll(async () => {
  ;[tenantA, tenantB] = await Promise.all([createTenantFixture(), createTenantFixture()])

  // Seed: one order per tenant
  await admin.from('orders').insert([
    { tenant_id: tenantA.tenantId, location_id: tenantA.locationId, source: 'admin_manual' },
    { tenant_id: tenantB.tenantId, location_id: tenantB.locationId, source: 'admin_manual' },
  ])
})

afterAll(async () => {
  await Promise.all([cleanupTenant(tenantA.tenantId), cleanupTenant(tenantB.tenantId)])
})

describe('RLS — read isolation', () => {
  it('owner sees only their own tenant orders', async () => {
    const { data } = await tenantA.ownerClient.from('orders').select('tenant_id')
    expect(data).not.toBeNull()
    expect(data!.length).toBeGreaterThan(0)
    expect(data!.every((r) => r.tenant_id === tenantA.tenantId)).toBe(true)
  })

  it('owner of tenant A gets 0 rows from tenant B orders', async () => {
    const { data } = await tenantA.ownerClient
      .from('orders')
      .select('id')
      .eq('tenant_id', tenantB.tenantId)
    // RLS blocks cross-tenant reads — result is empty, not an error
    expect(data).toEqual([])
  })

  it('owner of tenant A gets 0 rows from tenant B customers', async () => {
    await admin.from('customers').insert({ tenant_id: tenantB.tenantId, phone: '+549111111111' })
    const { data } = await tenantA.ownerClient
      .from('customers')
      .select('id')
      .eq('tenant_id', tenantB.tenantId)
    expect(data).toEqual([])
  })

  it('owner of tenant A cannot read tenant B tenant_settings', async () => {
    const { data } = await tenantA.ownerClient
      .from('tenant_settings')
      .select('id')
      .eq('tenant_id', tenantB.tenantId)
    expect(data).toEqual([])
  })
})

describe('RLS — write isolation', () => {
  it('owner of tenant A cannot INSERT an order with tenant B tenant_id', async () => {
    const { error } = await tenantA.ownerClient.from('orders').insert({
      tenant_id: tenantB.tenantId,
      location_id: tenantB.locationId,
      source: 'admin_manual',
    })
    expect(error).not.toBeNull()
  })

  it('owner of tenant A cannot INSERT a customer into tenant B', async () => {
    const { error } = await tenantA.ownerClient.from('customers').insert({
      tenant_id: tenantB.tenantId,
      phone: '+549999999999',
    })
    expect(error).not.toBeNull()
  })
})

describe('RLS — role scoping', () => {
  it('manager sees only orders from their location', async () => {
    // Create a second location in tenant A and an order for it
    const { data: loc2 } = await admin
      .from('locations')
      .insert({ tenant_id: tenantA.tenantId, name: 'Local 2' })
      .select('id')
      .single()

    await admin.from('orders').insert({
      tenant_id: tenantA.tenantId,
      location_id: loc2!.id,
      source: 'admin_manual',
    })

    const { data } = await tenantA.managerClient.from('orders').select('location_id')
    expect(data).not.toBeNull()
    // Manager's location_id is tenantA.locationId — should see only that
    expect(data!.every((r) => r.location_id === tenantA.locationId)).toBe(true)
  })

  it('manager cannot create an order for a different location', async () => {
    const { data: otherLoc } = await admin
      .from('locations')
      .insert({ tenant_id: tenantA.tenantId, name: 'Other Local' })
      .select('id')
      .single()

    const { error } = await tenantA.managerClient.from('orders').insert({
      tenant_id: tenantA.tenantId,
      location_id: otherLoc!.id,
      source: 'admin_manual',
    })
    expect(error).not.toBeNull()
  })
})
