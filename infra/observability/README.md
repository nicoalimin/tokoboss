# Observability (UTA-12) — no paid vendor required

Baseline quality gates + observability scaffolding: structured JSON logs with a
shared correlation vocabulary, safe health/readiness probes, and local-first
diagnostics. Vercel logs (or plain stdout) are the only collector needed.

## Run CI locally (mirrors `.github/workflows/ci.yml`)

```bash
pnpm install --frozen-lockfile   # clean-checkout install
pnpm lint                        # all workspace lint stubs + web/mobile lint
pnpm test:boundaries              # Clean Architecture boundaries + failure-mode proof
pnpm typecheck                    # every package + web + mobile
pnpm test                         # vitest suites, neon preview tests, example use-case
pnpm --filter @tokoboss/database db:check      # journal sync, no uncommitted SQL
pnpm --filter @tokoboss/database db:check:kit  # drizzle-kit drift check (KNOWN-FAILING on main, non-blocking — see infra/drizzle/README.md)
pnpm --filter @tokoboss/web build              # Next.js production build
pnpm --filter @tokoboss/mobile typecheck       # Expo scaffold typecheck
```

The `gate-proof` CI job additionally proves the gates bite: it runs the
boundary checker, `tsc`, and the test runner against deliberately broken
fixtures and passes only when each one fails. Local equivalent:

```bash
pnpm --filter @tokoboss/boundary-tests test   # includes failure-proof.mjs
```

## Correlation IDs — how to read them

One vocabulary everywhere (`packages/observability/src/correlation.ts`):

| Field                      | Meaning                                                        | Source                                         |
| -------------------------- | -------------------------------------------------------------- | ---------------------------------------------- |
| `requestId` (`req_…`)      | Root id for one inbound request/execution; preserved into jobs | generated, header `x-tokoboss-request-id`      |
| `workspaceId` (`ws_…`)     | Workspace-safe scope (never PII)                               | header `x-tokoboss-workspace-id`               |
| `jobId`                    | Background job derived from a request (`deriveJobContext`)     | header `x-tokoboss-job-id`                     |
| `workflowRunId`            | GitHub run (`owner/repo#run/attempt`)                          | `workflowRunIdFromEnv()`                       |
| `integrationCorrelationId` | Our token for a marketplace/integration call                   | header `x-tokoboss-integration-correlation-id` |
| `deploymentId`             | Vercel deployment id / commit sha / `local`                    | `@tokoboss/config`                             |
| `errorCode`                | Safe machine-readable code (`job_failed`, …)                   | caller                                         |

Every log line is JSON with these fields plus `service`, `level`,
`timestamp`, `event`, `message` — redacted before serialization
(`packages/observability/src/redact.ts`). To trace a flow, grep one
`requestId` across web + worker output:

```bash
pnpm --filter @tokoboss/observability example:correlate | grep req_520e1d110815
```

End-to-end evidence (sample request → sample job, same `requestId`):
see [`correlation-evidence.md`](./correlation-evidence.md).

Health probes echo the inbound `x-tokoboss-request-id` back as a response
header, so edge → app correlation works without a vendor:

```bash
curl -s -D - http://localhost:3000/api/health | grep -i request-id
```

## Dashboards & alerts (placeholders — no vendor purchase)

- [`dashboards/business-impact-dashboard.stub.json`](./dashboards/business-impact-dashboard.stub.json) —
  business-impact dashboard definition stub (ingest JSON logs, group by
  `event`/`errorCode`/`workspaceId`).
- [`alerts/alerts.stub.yaml`](./alerts/alerts.stub.yaml) —
  alert thresholds stub (readiness, error-rate, job-failure).
- [`runbooks/local-diagnostics.md`](./runbooks/local-diagnostics.md) —
  local triage with stdout logs only.
- [`runbooks/production.md`](./runbooks/production.md) —
  production runbook locations (Vercel logs + Neon branch wiring from UTA-11).

When a vendor is eventually adopted, only the sink changes
(`Logger(sink)`); the vocabulary and tests stay the same.

## Redaction contract

Never logged verbatim: secrets/tokens, `DATABASE_URL`-style connection
strings, bearer tokens, raw marketplace payloads, customer PII (email,
phone, NIK), private Blob paths / signed URLs. Violations become
`[REDACTED]`. Covered by
`packages/observability/src/__tests__/redact.test.ts` (30 tests total in the
package) plus `health.test.ts` (health payloads leak no tenant/secret keys).
