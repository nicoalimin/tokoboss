# Alerts (placeholder — UTA-12)

No paid vendor required. Alert rules will be defined here as portable
thresholds over the same stdout JSON the dashboards use.

Planned rules (to be wired when a notification channel exists):

- `readiness not-ready` for > 5 minutes → page the on-call runbook
  [`../runbooks/health-readiness.md`](../runbooks/health-readiness.md).
- Elevated `errorCode=DB_UNREACHABLE` rate → preview-DB runbook
  [`../runbooks/preview-db.md`](../runbooks/preview-db.md).
- CI `failure-proof` red on `main` → treat as P1 (quality gates blind).

No rule may match on secret, PII, or raw-payload fields — those never reach
logs by construction (see `packages/observability/src/redact.ts`).
