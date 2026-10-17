# V2 roadmap

What V1 deliberately does not do, roughly in priority order. Each item notes why it was deferred.

## Data in

1. **Direct integrations** with Filevine, Litify (Salesforce), Clio and SmartAdvocate: scheduled sync of matters, events and financials, instead of periodic CSV exports. *Deferred: requires vendor API agreements and per-customer credentials.*
2. **Incremental re-imports**: update existing matters from a newer export by matter ID, with a field-level diff for review. V1 skips existing IDs as duplicates.
3. **Document-assisted extraction**: propose outcome financials from settlement statements, always requiring confirmation. *Deferred: needs a careful data-handling review; V1 deliberately avoids documents.*
4. **Configurable categories and drivers** in the UI (V1 seeds them per practice area).

## Analytics

5. **Practice-area packs** for personal injury and mass tort (category sets, stage models and value bands are already parameterized).
6. **Saved views and scheduled reports**: email a monthly calibration and economics summary to partners. The `saved_views` table exists.
7. **Attorney self-view**: each attorney's own calibration history and feedback after each resolution.
8. **Time-to-cash and portfolio forecasting** built on recorded predictions: expected fee timing and capital need.
9. **Precomputed analytics** for very large portfolios (more than about 50,000 matters).

## Network

10. **Asteric Network** (currently a preview): opt-in contribution of derived, aggregate signals (never records), minimum of 5 contributing firms and k-anonymity thresholds per figure, a separate written agreement, and an independent privacy review before launch. The `network` schema is reserved for it.

## Enterprise readiness

11. **SSO (SAML/OIDC)** and SCIM provisioning.
12. **Matter-level access controls** (ethical walls).
13. **Third-party security audit** (SOC 2 Type I, then Type II) and a penetration test. Do not claim either until completed.
14. **Customer-managed data retention** policies and per-organization backup export.
15. **Billing** (Stripe) with seat- or matter-based plans.
16. **Multi-currency** and non-US jurisdictions.

## Operations

17. Error tracking (Sentry) and alerting wired into `src/instrumentation.ts`.
18. Background job queue for very large imports (V1 commits synchronously, which is fine to 20,000 rows).
19. Admin tooling for support: impersonation is intentionally **not** planned; instead, a customer-approved, time-limited, audited support access grant.
