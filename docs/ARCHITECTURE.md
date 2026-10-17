# Architecture

## Overview

```
Browser ──HTTPS──▶ Vercel (Next.js 16)
                    ├─ proxy.ts        auth gate for /app, /admin · per-request CSP nonce
                    ├─ /               static landing (public/landing) via rewrite
                    ├─ Server Components  read through tenant-scoped services
                    ├─ Server Actions     all writes (validated with zod, audited)
                    ├─ /app/export/*      CSV export route handlers
                    └─ /api/cron/daily    maintenance (Vercel Cron, bearer secret)
                          │
                          ▼
                   Postgres (Neon) ── row-level security per organization
                          │
             optional ────┴──── Resend (email) · Anthropic API (header-only mapping hints)
```

A single Next.js application serves the marketing site, the product and the admin console. There is no separate API server: Server Components read data and Server Actions write it, both on the server. Business logic lives in `src/server/services` and `src/server/imports`; the analytics engine (`src/lib/analytics`) is pure TypeScript with no I/O, so every metric is unit-testable and the same code powers pages, insights and exports.

## Tenancy and isolation

Every customer table carries `organization_id`. Isolation is enforced twice:

1. **Application.** All tenant reads and writes go through `withTenant(orgId, fn)` (`src/server/db/index.ts`), and every query also filters on `organization_id`. The organization comes from the server-side session, never from the request.
2. **Database.** `withTenant` opens a transaction, runs `SET LOCAL ROLE asteric_app` (a `NOBYPASSRLS` role) and sets `app.org_id`. RLS policies (`drizzle/0001_security.sql`) restrict every tenant table to `organization_id = app_current_org()`. A bug that forgets a filter therefore returns no rows rather than another firm's rows. The `users` policy only exposes members of the current organization.

`systemDb()` (owner connection, bypasses RLS) is used only for platform operations: authentication, session lookup, organization provisioning, the admin console's counts, maintenance and the demo seeder. It is never used for customer matter reads in the product.

If the database user cannot create the role (rare on managed Postgres), the migration logs a warning, `withTenant` skips `SET ROLE`, and /admin shows "App-layer only".

## Data model

| Area | Tables |
|---|---|
| Identity | `organizations` (settings jsonb, `is_demo`, deletion fields), `users`, `memberships` (role, linked attorney), `sessions`, `auth_tokens`, `invitations`, `rate_limits`, `access_requests` |
| Reference | `attorneys`, `referral_sources`, `categories` (configurable per organization and practice area) |
| Ledger | `matters`, `predictions` (append-only, `version` unique per matter, `source` prospective/historical/sandbox, `supersedes_id`), `procedural_events`, `offers`, `outcomes` (explicit financial fields) |
| Imports | `imports`, `import_files` (private bytea), `import_rows`, `import_value_reviews` |
| Governance | `provenance` (field-level lineage), `audit_events` (append-only), `notification_reads`, `saved_views` |
| Future network | `network.derived_signals` (separate schema, no organization reference, unused in V1) |

**Immutability.** `asteric_app` has no `UPDATE` or `DELETE` grant on `predictions` or `audit_events`, and a trigger rejects modification unless the transaction sets `app.allow_purge = 'on'`, which only organization purge and the demo reset do. A revision is a new row with the next version and a required reason.

**Financial semantics** (`outcomes`): `gross_recovery` is the total paid by the defendant; `attorney_fee` is the firm's contingency fee before any referral split; `referral_fee_paid` is the share paid to a referring attorney; `litigation_expenses` are costs advanced by the firm; `net_to_client` is what the client received. Missing values stay null. They are never imputed, except an optional organization-configured contingency rate for a missing fee, which is labeled "derived" wherever used.

## Analytics definitions

All definitions are also shown in-app in each metric's **Methodology** drawer (`src/lib/analytics/methodology.ts`).

- **Favorable:** settlement, plaintiff judgment or arbitration award with a recovery.
- **Evaluation prediction:** the initial prediction (default) or the latest one recorded before resolution. Only predictions recorded before the outcome count; sandbox predictions never count. Historical estimates from imports can be included or excluded.
- **Brier score:** mean of (p − outcome)² over resolved matters. Shown from 30 resolved predictions. A base-rate reference and skill score accompany it.
- **Calibration:** ten probability bands, observed favorable rate with Wilson 95% intervals. Bands with fewer than five predictions are shown in gray.
- **Range accuracy:** graded only on favorable outcomes with a recorded recovery (the range is the expected recovery *if* favorable). Inside/below/above shares and median recovery ÷ midpoint, by predicted value band.
- **Duration error:** actual months from opening to resolution minus predicted. **Expense error:** final expense ÷ predicted expense − 1.
- **Return on legal capital (ROLC):** Σ return ÷ Σ capital over resolved matters with fees and expenses, where return = net fee + expenses reimbursed from a favorable recovery (configurable). Capital is expense-only, or fully costed (expenses + hours × configured hourly cost, shown only when at least 80% of matters have hours). Aggregating as a ratio of sums weights matters by capital.
- **Insights:** deterministic rules (`insights.ts`), each with a minimum sample (12 to 30), a materiality threshold, the period, n, and a link to the supporting matters built with the same filter code as the matters list. Attorney and referral findings carry a "historical association, not causation" note.
- **Portfolio Watch:** open matters whose expenses exceed the latest forecast by more than the configured threshold, whose elapsed time exceeds or approaches the forecast, which had a major procedural event since the latest prediction, whose prediction is older than the configured age, or which have no prediction.

## Import pipeline

`parseUpload` → `createImport` (stores file privately, detects source system, suggests mapping) → `saveMappingAndBuildReview` (validates one-to-one mapping, builds distinct-value reviews, flags duplicates and unreadable values) → `decideReview` / `acceptAllSuggestions` → `commitImport` (one transaction; creates matters, outcomes, historical predictions and provenance rows; writes the report).

- Uploads: CSV or XLSX only, verified by content (not extension), at most 4 MB, 20,000 rows and 120 columns.
- Normalization: exact, synonym and similarity matching for categories, statuses and resolutions; name clustering for attorneys and referral sources. Values with confidence ≥ 0.85 are accepted automatically; the rest wait for a reviewer. Unreviewed values import as blank.
- Duplicates: same matter ID (in file or already in the workspace) or same name and date opened.
- AI assist (optional): only for columns the deterministic matcher cannot place, and only when both the deployment (`AI_PROVIDER`, key, `AI_MODEL`) and the organization (`aiAssistEnabled`) allow it. Sends headers and inferred types only; suggestions are capped at 0.75 confidence so they always require confirmation.

## Security decisions

| Decision | Rationale |
|---|---|
| First-party auth (scrypt N=2¹⁵, database sessions storing only SHA-256 token hashes) | No third-party identity dependency; sessions are revocable; easy to audit |
| `__Host-` cookie, `HttpOnly`, `Secure`, `SameSite=Lax`; 12 h idle, 14 day absolute | Standard session hardening |
| TOTP two-factor with hashed single-use recovery codes; secrets AES-256-GCM encrypted | Second factor without SMS |
| Postgres fixed-window rate limits keyed by HMAC of IP | Works across serverless instances without Redis; IPs are not stored |
| Enumeration-safe messages on login, reset and signup | Avoid revealing which emails have accounts |
| Invite-only by default; administrator not a member of customer organizations | Customer data is visible only to its firm |
| Strict CSP with per-request nonce and `strict-dynamic`; HSTS, `nosniff`, `frame-ancestors 'none'`, COOP | Limits XSS and clickjacking; every page renders per request so it receives the nonce |
| Server Actions only for writes; zod validation; Next.js origin checks | Built-in CSRF protection |
| Uploaded files stored as bytea, never publicly addressable; abandoned uploads deleted after 14 days | Raw exports may contain sensitive fields |
| CSV export escapes formula triggers | Prevents CSV injection in Excel |
| Structured JSON logs with redaction of secrets; matter names are not logged | Logs are a common leak path |
| Organization deletion: owner + password + typed name, 30-day grace, then cascading purge | Safe against accidents, and complete when it happens |

## Observability

- `src/server/logger.ts` writes one JSON line per event to stdout (visible in Vercel Logs).
- `src/instrumentation.ts` logs every unhandled request error (`request.unhandled`). Add an error-tracking SDK there if desired.
- `/api/health` checks database connectivity for uptime monitors.
- Daily cron results are logged as `cron.daily`.

## Known limitations (V1)

- No integrations with case management systems: data arrives by CSV/XLSX import or manual entry.
- One currency (USD) and US-centric date parsing.
- No SSO/SAML; no per-matter access restrictions inside an organization.
- Analytics are computed on request from the organization's full portfolio. This is fast up to tens of thousands of matters; beyond that, cache or precompute.
- Email delivery requires Resend; otherwise links are shown to administrators.
- The Network is a preview page only; no data is pooled.
