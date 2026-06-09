/**
 * E2E — Flujo completo Fase 1 (from test plan)
 *
 * Admin crea pedido → completa con teléfono → cliente accede al link → ve saldo.
 *
 * Requires:
 *   - supabase start + supabase db reset (local Supabase running)
 *   - Express API + admin panel + customer PWA running (see playwright.config.ts)
 *   - ADMIN_EMAIL / ADMIN_PASSWORD env vars (an owner seeded in the DB)
 *   - ADMIN_URL  (default http://localhost:5173)
 *   - CUSTOMER_URL (default http://localhost:5174)
 */

import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://localhost:54321'
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? ''
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? ''
const CUSTOMER_URL = process.env.CUSTOMER_URL ?? 'http://localhost:5174'

test.skip(!ADMIN_EMAIL || !ADMIN_PASSWORD || !SERVICE_KEY, 'E2E credentials not set')

test('full Phase 1 flow: admin completes order → customer sees points', async ({ page }) => {
  const serviceClient = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

  // ------------------------------------------------------------------
  // 1. Log in as admin
  // ------------------------------------------------------------------
  await page.goto('/login')
  await page.getByLabel('Email').fill(ADMIN_EMAIL)
  await page.getByLabel('Contraseña').fill(ADMIN_PASSWORD)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page).toHaveURL(/\/orders/)

  // ------------------------------------------------------------------
  // 2. Find admin's tenant + location from the DB to create order
  // ------------------------------------------------------------------
  const { data: session } = await createClient(SUPABASE_URL, process.env.SUPABASE_ANON_KEY ?? '', {
    auth: { persistSession: false },
  }).auth.signInWithPassword({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD })

  const userId = session.user!.id
  const { data: adminUser } = await serviceClient
    .from('admin_users')
    .select('tenant_id, location_id')
    .eq('user_id', userId)
    .single()
  const { tenantId, locationId } = { tenantId: adminUser!.tenant_id, locationId: adminUser!.location_id }

  // ------------------------------------------------------------------
  // 3. Create a new order via the API (bypasses UI to keep test focused)
  // ------------------------------------------------------------------
  const { data: order } = await serviceClient
    .from('orders')
    .insert({ tenant_id: tenantId, location_id: locationId, source: 'admin_manual' })
    .select('id')
    .single()
  const orderId = order!.id

  // ------------------------------------------------------------------
  // 4. Complete the order via the UI — click "Completar" button
  // ------------------------------------------------------------------
  const customerPhone = `+549110002${Date.now().toString().slice(-4)}`

  await page.reload()
  await page.getByText('Pendiente').first().waitFor()

  // Find the "Completar" button for our order and click it
  const row = page.locator(`[data-order-id="${orderId}"]`)
  if (await row.count() === 0) {
    // Fallback: click first visible "Completar" button
    await page.getByRole('button', { name: 'Completar' }).first().click()
  } else {
    await row.getByRole('button', { name: 'Completar' }).click()
  }

  await page.getByLabel('Teléfono').fill(customerPhone)
  await page.getByRole('button', { name: 'Confirmar y asignar puntos' }).click()
  await expect(page.getByText('Pedido completado')).toBeVisible()

  // ------------------------------------------------------------------
  // 5. Get the customer's registration token
  // ------------------------------------------------------------------
  const { data: customer } = await serviceClient
    .from('customers')
    .select('registration_token')
    .eq('tenant_id', tenantId)
    .eq('phone', customerPhone)
    .single()
  const token = customer!.registration_token

  // ------------------------------------------------------------------
  // 6. Customer opens their points page and sees a non-zero balance
  // ------------------------------------------------------------------
  const customerPage = await page.context().newPage()
  await customerPage.goto(`${CUSTOMER_URL}/puntos/${token}`)
  await expect(customerPage.getByText('Tus puntos')).toBeVisible()

  const balanceText = await customerPage.locator('text=/^\\d+$/').first().textContent()
  expect(Number(balanceText)).toBeGreaterThan(0)

  // ------------------------------------------------------------------
  // Cleanup
  // ------------------------------------------------------------------
  await serviceClient.from('tenants').delete().eq('id', tenantId).throwOnError()
    .then(() => {}) // cascade handles related rows; ignore if tenant is shared
})

test('customer token 404 — shows friendly error page', async ({ page }) => {
  const CUSTOMER_BASE = process.env.CUSTOMER_URL ?? 'http://localhost:5174'
  await page.goto(`${CUSTOMER_BASE}/puntos/00000000-0000-0000-0000-000000000000`)
  await expect(page.getByText('Link no encontrado')).toBeVisible()
})
