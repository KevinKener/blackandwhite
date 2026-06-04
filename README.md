# Black & White — Loyalty & Order Management PWA

A full-stack Progressive Web App built for a two-location burger chain in Argentina. Customers earn points on every purchase, track their balance, and redeem rewards — all without changing the restaurant's existing WhatsApp + cash payment workflow.

Built as a production system and portfolio project by a solo developer. Designed with SaaS scalability from day one: every table is multi-tenant, every policy is row-level secured.

---

## Overview

Black & White has two burger locations and no digital customer data. The owner knows his regulars by memory. This system changes that.

**Phase 1 (weeks 1–3) — live now:**
- Admin panel: staff creates orders manually, marks them complete → points assigned automatically
- Customer view: unique registration link sent via WhatsApp → customer sees their point balance
- No changes to the existing order flow (WhatsApp + cash/MercadoPago)

**Phase 2 (weeks 4–10) — in progress:**
- Customer-facing PWA: browse menu, build order, confirm → order appears directly on the admin panel screen
- Auto-detection of nearest location by GPS
- Installable PWA (home screen icon, offline support)
- Full customer history: purchases, rewards, redemptions

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Vite + TypeScript |
| Backend | Node.js + Express + TypeScript |
| Database | PostgreSQL via Supabase |
| Auth | Supabase Auth + custom JWT claims (Auth Hook) |
| Security | Row Level Security (RLS) — all tenant isolation enforced at DB level |
| Hosting | Vercel (frontend + serverless API) |
| CI/CD | GitHub Actions + Vercel auto-deploy |
| Testing | Vitest (unit/integration) + Playwright (E2E) |
| Local DB | Supabase CLI (Docker) |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        CLIENTS                              │
│                                                             │
│   ┌──────────────────┐        ┌──────────────────────┐     │
│   │   Customer PWA   │        │     Admin Panel      │     │
│   │  (React + Vite)  │        │   (React + Vite)     │     │
│   │                  │        │                      │     │
│   │ • Point balance  │        │ • Order management   │     │
│   │ • Order history  │        │ • Customer list      │     │
│   │ • Menu + cart    │        │ • Analytics/metrics  │     │
│   │ • Redeem rewards │        │ • Points config      │     │
│   └────────┬─────────┘        └──────────┬───────────┘     │
│            │  registration_token         │  JWT (Supabase)  │
└────────────┼─────────────────────────────┼─────────────────┘
             │                             │
┌────────────▼─────────────────────────────▼─────────────────┐
│                   Express API (Vercel)                       │
│                                                             │
│   Auth middleware: validates JWT (admin) or token (customer)│
│   All routes scoped to tenant_id from JWT claims            │
└────────────────────────────┬────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────┐
│                    Supabase (PostgreSQL)                      │
│                                                             │
│  ┌─────────────┐   ┌──────────────┐   ┌─────────────────┐  │
│  │   tenants   │   │   locations  │   │  tenant_settings │  │
│  │             │──▶│              │   │  points_per_order│  │
│  │  tenant_id  │   │  location_id │   │  points_for_rwd  │  │
│  └─────────────┘   └──────┬───────┘   │  expiry_days     │  │
│                           │           └─────────────────┘  │
│  ┌─────────────┐   ┌──────▼───────┐   ┌─────────────────┐  │
│  │  customers  │   │    orders    │   │point_transactions│  │
│  │             │──▶│              │──▶│                  │  │
│  │  phone      │   │  status      │   │  remaining_pts   │  │
│  │  reg_token  │   │  source      │   │  expires_at      │  │
│  └─────────────┘   └─────────────┘   └─────────────────┘  │
│                                                             │
│  RLS: every table enforces tenant_id from JWT on all ops    │
│  RPC: complete_order() — atomic order + points in one tx    │
└─────────────────────────────────────────────────────────────┘
```

### Key Architecture Decisions

**Points as a ledger, not a counter.** Each transaction has its own `remaining_points` and `expires_at`. This makes per-transaction expiration (6 months) and FIFO redemption (consume soonest-to-expire first) native to the data model — no rewrite needed when the business needs it.

**Atomic order completion via Supabase RPC.** Marking an order complete and assigning points happen in a single SQL transaction (`complete_order()`). No partial state: either both succeed or neither does.

**RLS enforced at the database level.** Tenant isolation is not just a middleware check — it's enforced by PostgreSQL RLS policies using JWT claims. A bug in the Express layer cannot leak another tenant's data.

**Supabase Auth Hook for custom JWT claims.** Admin users get `tenant_id`, `role`, and `location_id` injected into their JWT at login. RLS read policies branch on role: `owner` sees all locations, `manager` sees only their own.

**Supavisor connection pooling.** All Vercel serverless functions connect via Supabase's Supavisor (port 6543, transaction-mode pooling) to avoid exhausting PostgreSQL's connection limit under concurrent load.

---

## Data Model

```
tenants
  id, name, created_at

locations
  id, tenant_id, name, address

tenant_settings
  id, tenant_id, points_per_order, points_for_reward, expiry_days

admin_users         (in Supabase auth.users + custom claims via Auth Hook)
  user_id, tenant_id, role (owner|manager), location_id

customers           (NOT in auth.users — identified by registration_token in Phase 1)
  id, tenant_id, phone, name, registration_token (UUID), created_at

orders
  id, tenant_id, location_id, customer_id (nullable), status (pending|completed),
  source (admin_manual|customer_pwa), created_at, completed_at

point_transactions  (ledger — one row per earning event)
  id, tenant_id, customer_id, order_id, points_earned,
  remaining_points, expires_at, created_at

redemptions
  id, tenant_id, customer_id, points_redeemed, reward_type, created_at

menu_items          (Phase 2)
  id, tenant_id, location_id, name, price, category,
  points_eligible (boolean), available, created_at
```

---

## Development Phases

### Phase 1 — Admin Panel + Points System

- [ ] DB schema + Supabase migrations
- [ ] RLS policies (tenant isolation on all tables)
- [ ] Supabase Auth Hook (custom JWT claims)
- [ ] `complete_order()` RPC (atomic order completion + points)
- [ ] `tenant_settings` table (owner configures points rules without a deploy)
- [ ] Express API: orders, customers, analytics routes
- [ ] Admin panel: order management, customer list, adoption metrics
- [ ] Customer view: point balance via unique registration link
- [ ] CI/CD: GitHub Actions + Supabase CLI for integration tests
- [ ] Deploy to Vercel

### Phase 2 — Menu + Order Flow + Installable PWA

- [ ] `menu_items` table (per location, with `points_eligible` flag)
- [ ] Menu management UI (admin panel)
- [ ] Customer PWA: menu browsing, order builder
- [ ] Order confirmation flow → appears directly in admin panel
- [ ] GPS-based location auto-detection (fallback: manual selection)
- [ ] Customer history: purchases, available rewards, redemption log
- [ ] Service worker + web app manifest (installable PWA)
- [ ] OTP auth via WhatsApp for returning customers (Phase 1 uses token link)

---

## Project Structure

```
blackandwhite/
│
├── client/
│   ├── admin/                  # Admin panel (React + Vite)
│   │   └── src/
│   │       ├── components/
│   │       ├── pages/
│   │       └── main.tsx
│   └── customer/               # Customer-facing PWA (React + Vite)
│       └── src/
│           ├── components/
│           ├── pages/
│           └── main.tsx
│
├── server/                     # Express API
│   └── src/
│       ├── routes/
│       │   ├── orders.ts
│       │   ├── customers.ts
│       │   └── analytics.ts
│       ├── middleware/
│       │   └── auth.ts         # JWT + registration_token validation
│       └── index.ts
│
├── supabase/
│   ├── migrations/
│   │   ├── 001_initial_schema.sql
│   │   ├── 002_rls_policies.sql
│   │   ├── 003_auth_hook.sql
│   │   ├── 004_complete_order_rpc.sql
│   │   └── 005_indexes.sql
│   └── config.toml
│
├── tests/
│   ├── integration/            # Vitest — runs against local Supabase
│   │   ├── rls-isolation.test.ts   # Cross-tenant access tests (2 real tenants)
│   │   └── points.test.ts          # Expiration, FIFO, balance edge cases
│   └── e2e/                    # Playwright
│       └── phase1-flow.spec.ts     # Admin creates order → customer sees points
│
├── .github/
│   └── workflows/
│       └── test.yml            # CI: Supabase CLI + Vitest + Playwright
│
├── CLAUDE.md
├── TODOS.md
└── README.md
```

---

## Running Locally

### Prerequisites

- [Node.js](https://nodejs.org/) 20+
- [Bun](https://bun.sh/) (recommended) or npm
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (required for Supabase local)
- [Supabase CLI](https://supabase.com/docs/guides/cli)

```bash
npm install -g supabase
```

### 1. Clone and install dependencies

```bash
git clone https://github.com/your-username/blackandwhite.git
cd blackandwhite

# Install all workspaces
bun install
```

### 2. Set up environment variables

```bash
cp .env.example .env
```

Fill in `.env`:

```env
# Supabase — use LOCAL values when developing
SUPABASE_URL=http://localhost:54321
SUPABASE_ANON_KEY=<from supabase start output>
SUPABASE_SERVICE_ROLE_KEY=<from supabase start output>

# Use Supavisor URL (port 6543) — required for Vercel, good habit locally too
DATABASE_URL=postgresql://postgres:postgres@localhost:6543/postgres

# For production (Vercel), use the Supavisor URL from your Supabase dashboard
```

### 3. Start Supabase locally

```bash
supabase start
```

This starts a local PostgreSQL instance with all RLS policies applied. Takes ~30 seconds on first run.

### 4. Run migrations

```bash
supabase db reset
```

This applies all migrations in `supabase/migrations/` in order, including RLS policies, the Auth Hook function, and indexes.

### 5. Start the dev servers

```bash
# In separate terminals:

# API server
bun run dev:server

# Admin panel
bun run dev:admin

# Customer PWA
bun run dev:customer
```

| Service | URL |
|---------|-----|
| Admin panel | http://localhost:5173 |
| Customer PWA | http://localhost:5174 |
| Express API | http://localhost:3000 |
| Supabase Studio | http://localhost:54323 |

### 6. Run tests

```bash
# Unit + integration tests (requires Supabase local running)
bun test

# E2E tests
bun run test:e2e

# Integration tests only (RLS isolation)
bun test tests/integration/
```

---

## Deployment

The project deploys automatically to Vercel on every push to `main`.

```
GitHub push → GitHub Actions (tests) → Vercel deploy
```

**Required Vercel environment variables:**

| Variable | Where to get it |
|----------|----------------|
| `SUPABASE_URL` | Supabase dashboard → Project Settings → API |
| `SUPABASE_ANON_KEY` | Supabase dashboard → Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase dashboard → Project Settings → API |
| `DATABASE_URL` | Supabase dashboard → Project Settings → Database → **Connection pooling URL (port 6543)** |

> ⚠️ **Use the Supavisor URL (port 6543) for `DATABASE_URL`**, not the direct connection (port 5432). Vercel runs serverless functions — direct connections exhaust PostgreSQL's connection limit under load.

---

## Security

- **Row Level Security on every table.** Tenant isolation is enforced at the database level, not just the API. A misconfigured route cannot expose another tenant's data.
- **JWT custom claims via Auth Hook.** `tenant_id`, `role`, and `location_id` are injected server-side at login — clients cannot forge them.
- **Customer tokens are server-generated UUIDs.** Registration links use `crypto.randomUUID()` — not sequential IDs, not email-based tokens.
- **No secrets in code.** All credentials live in environment variables. `.env` is gitignored.
- **Integration tests verify RLS isolation** against a real database with real policies — not mocks.

---

## License

MIT
