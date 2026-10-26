# Asteric

Decision intelligence for contingency litigation. Firms record what they expect on each matter (a recovery range, the probability of a favorable result, duration and expense) before they know the outcome. Asteric then measures those predictions against what actually happened and shows where the firm's judgment and capital perform well or poorly.

V2 turns that into a working loop: a 30-second **Quick Case Assessment** (comparative questions, attorney-confirmed, never an AI estimate); **Decision Moments** opened by configured developments (offers, mediation, discovery, rulings, large expenses); a **Decision Inbox** home screen for drift, stale assessments and firm review rules; **Firm Review Rules** that management creates, often straight from a **Firm Learning** finding; and a record of firm **decisions** and **declined or referred intake**. Every action is audited, and assessments and decisions are append-only.

This repository holds both the public marketing site and the authenticated multi-tenant application.

| Path | What it is |
|---|---|
| `/` | Marketing landing page (static HTML in `public/landing/`, served by a rewrite) |
| `/security`, `/privacy`, `/terms`, `/contact`, `/request-access` | Public pages |
| `/login`, `/signup`, `/invite/…`, `/forgot-password` | Authentication |
| `/app/…` | The product (requires sign-in) |
| `/admin` | Platform administration (platform administrators only; no customer case data) |
| `/api/health`, `/api/cron/daily` | Health check and daily maintenance |

**Not technical?** Start with [FOUNDER_GUIDE.md](FOUNDER_GUIDE.md), which explains deploying, inviting a firm and running a demo step by step.

## Stack

- **Next.js 16** (App Router, Server Components, Server Actions), TypeScript, React 19
- **Postgres** through **Drizzle ORM** and node-postgres. Any managed Postgres works; Neon is the documented default.
- First-party authentication (scrypt passwords, database sessions, TOTP two-factor authentication)
- Recharts for charts; self-hosted Geist and EB Garamond fonts
- Vitest (unit and integration tests against a real Postgres) and Playwright (smoke tests)
- Hosting: Vercel, with the daily job on Vercel Cron. Email via Resend (optional).

## Local development

Prerequisites: Node.js 20.9+ and a Postgres 15+ database.

```bash
npm install
cp .env.example .env.local        # then fill in DATABASE_URL, APP_ENCRYPTION_KEY, etc.
npm run db:migrate                # creates tables, row-level security and immutability triggers
npm run seed:demo                 # optional: synthetic "Keller & Ross Employment Law" workspace
npm run dev                       # http://localhost:3000
```

Create the first administrator by opening `/signup?setup=<SETUP_TOKEN>` with an email listed in `PLATFORM_ADMIN_EMAILS`. From `/admin`, provision an organization and invite its owner.

### Tests

```bash
npm run typecheck
npm test                 # unit + integration (needs Postgres; uses database asteric_test)
npm run test:e2e         # Playwright smoke tests against a running app (npm run dev + seed:demo first)
```

Integration tests use `TEST_DATABASE_URL`, defaulting to `postgres://asteric:asteric_dev@localhost:5432/asteric_test`. The test setup migrates that database and truncates it between tests. Never point it at a real database.

What is covered: tenant isolation (application layer and Postgres RLS, reads and writes), prediction immutability (permissions and triggers), role permissions, the demo sandbox, the full import pipeline (mapping, normalization, review, duplicates, commit, provenance), analytics math (Brier score, calibration bins, Wilson intervals, range/duration/expense accuracy, ROLC, insights thresholds), CSV formula-injection escaping, organization purge, the demo seed and its walkthrough findings.

### Useful scripts

| Command | Purpose |
|---|---|
| `npm run db:migrate` | Apply migrations (also runs on every Vercel build) |
| `npm run db:generate` | Generate a migration after editing `src/server/db/schema.ts` |
| `npm run seed:demo` | Create or fully regenerate the synthetic demo workspace (touches only the `is_demo` organization) |
| `npm run demo:reset` | Remove sandbox predictions recorded by demo visitors |
| `npm run org:purge` | Purge organizations past their 30-day deletion grace period; clear expired sessions |

## Project structure

```
public/landing/          marketing page (HTML, CSS, JS) — unchanged design
public/samples/          sample import file
drizzle/                 SQL migrations (0001_security.sql = RLS, roles, immutability)
scripts/                 migrate, seed-demo, purge-orgs
src/proxy.ts             auth gate for /app and /admin, per-request CSP nonce
src/app/(auth)           login, signup, invitations, password reset, MFA
src/app/(public)         security, privacy, terms, contact, request access
src/app/app/(shell)      the product: overview, matters, ledger, analytics, imports, settings
src/app/app/onboarding   first-run onboarding
src/app/admin            platform administration
src/app/api              health check and cron
src/components           UI (ui/ primitives, app/ product components, charts/)
src/lib/analytics        pure analytics engine (no I/O; fully unit tested)
src/lib/imports          column mapping and value normalization
src/server/auth          sessions, passwords, MFA, rate limiting
src/server/db            schema and tenant-scoped database access
src/server/services      ledger, portfolio loading, accounts, audit log
src/server/imports       upload parsing and the import pipeline
src/server/demo          synthetic data generator and seeder
tests/                   unit, integration and e2e tests
docs/                    architecture, security and operations notes
```

## Documentation

- [FOUNDER_GUIDE.md](FOUNDER_GUIDE.md): deploy, configure, invite firms, demo, day-to-day operations
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): architecture, data model, analytics definitions, security design
- [V2_ROADMAP.md](V2_ROADMAP.md): what is deliberately not in V1
