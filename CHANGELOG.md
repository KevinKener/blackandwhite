# Changelog

All notable changes to this project will be documented in this file.

## [0.1.0.0] - 2026-06-04

### Added

- **Initial database schema** (`supabase/migrations/001_initial_schema.sql`): full multi-tenant schema for the Black & White loyalty system. Includes `tenants`, `locations`, `tenant_settings`, `admin_users`, `customers`, `orders`, `point_transactions`, `redemptions`, and `menu_items` (Phase 2 placeholder).
- **Ledger-based points model**: `point_transactions` stores `remaining_points` and `expires_at` per earning event, enabling per-transaction expiration and FIFO redemption without future schema changes.
- **Composite FK tenant isolation**: `orders`, `point_transactions`, `redemptions`, `admin_users`, and `menu_items` use composite foreign keys (e.g. `(tenant_id, customer_id) → customers(tenant_id, id)`) so the database rejects cross-tenant associations independently of application-layer RLS.
- **Role/location invariant**: `admin_users` enforces `(role='owner' AND location_id IS NULL) OR (role='manager' AND location_id IS NOT NULL)` via a CHECK constraint. `ON DELETE RESTRICT` on `location_id` prevents accidentally elevating managers to owner-level access when a location is deleted.
- **Order state integrity**: CHECK constraints ensure `completed_at IS NULL` when `status='pending'` and `completed_at IS NOT NULL` when `status='completed'`, and that `completed_at >= created_at`.
- **tenant_settings bootstrap trigger**: every new tenant automatically gets a `tenant_settings` row with defaults (`points_per_order=1`, `points_for_reward=10`, `expiry_days=180`), preventing the `complete_order()` RPC from failing on a new tenant's first order.
- **gstack session startup**: CLAUDE.md now auto-invokes the `gstack` skill at the start of every session in this project.
