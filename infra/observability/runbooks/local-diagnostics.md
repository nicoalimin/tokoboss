# Local diagnostics runbook (no vendor)

Source of truth for local triage: stdout JSON lines. No collector, no account.

## 1. Reproduce with correlation

```bash
# Start web locally, then hit health with an explicit request id:
pnpm --filter @tokoboss/web dev &
curl -s -H 'x-tokoboss-request-id: req_local_debug_1' http://localhost:3000/api/health
curl -s -H 'x-tokoboss-request-id: req_local_debug_1' http://localhost:3000/api/ready

# Emit a correlated request→job sample and grep one id:
pnpm --filter @tokoboss/observability example:correlate | grep req_
```

## 2. Read the JSON lines

Each line has `timestamp level service event message requestId workspaceId
jobId workflowRunId integrationCorrelationId deploymentId errorCode`.
Filter with `jq`:

```bash
pnpm --filter @tokoboss/observability example:correlate \
  | jq -c 'select(.event=="job.failed") | {requestId, jobId, errorCode}'
```

## 3. Common cases

| Symptom                              | Check                                                                                                                                                                |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/api/ready` → 503 locally           | Expected when `APP_ENV`/prod validation fails; run `validateEnv()` output in `instrumentation.ts` logs. Local/preview starts degraded-but-up; production fail-fasts. |
| `[REDACTED]` where you expected data | The redactor is working: secrets/PII/marketplace blobs are never logged. Log ids (`requestId`, `workspaceId`, `jobId`) instead.                                      |
| Boundary failure in CI               | Read `tests/boundary/check-boundaries.js` output; domain must not import `next/react/expo/drizzle/marketplace SDKs`. See `tests/boundary/README.md`.                 |
| Migration failure in CI              | `pnpm --filter @tokoboss/database db:check` (journal vs SQL) and `db:check:kit` (drizzle drift). Never renumber `main` migrations — see `AGENTS.md`.                 |
| Preview DB missing                   | UTA-11 wiring: `preview-db` workflow + `infra/neon/*.mjs`. This scaffold does not touch Neon credentials.                                                            |

## 4. Escalation

If local logs show `ready: false` with `env: degraded` in an environment
that should be healthy, follow `production.md` (Vercel logs + env scoping).
