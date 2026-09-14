# Correlation evidence (UTA-12)

Generated locally with `pnpm --filter @tokoboss/observability example:correlate`
(`packages/observability/examples/correlate.ts`). One `requestId` spans the
sample request and the sample background execution; secrets are redacted
inline. Automated coverage: `packages/observability/src/__tests__/logger.test.ts`
("correlates a request and a background job end to end").

## Reproduce

```bash
pnpm --filter @tokoboss/observability example:correlate
```

## Sample output (2026-09-14, local)

All five lines share **`requestId: req_e3f8af5b1b70`** — request start/done plus
job start/sync/done:

```jsonl
{"timestamp":"2026-09-14T06:39:30.143Z","level":"info","service":"uta-12-evidence","requestId":"req_e3f8af5b1b70","workspaceId":"ws_evidence","deploymentId":"local","event":"request.start","message":"POST /api/v1/sync (sample)","headers":{"x-tokoboss-request-id":"req_e3f8af5b1b70","x-tokoboss-workspace-id":"ws_evidence"}}
{"timestamp":"2026-09-14T06:39:30.145Z","level":"info","service":"uta-12-evidence","requestId":"req_e3f8af5b1b70","workspaceId":"ws_evidence","deploymentId":"local","jobId":"job_evidence_sync_1","event":"job.start","message":"job job_evidence_sync_1 started"}
{"timestamp":"2026-09-14T06:39:30.145Z","level":"info","service":"uta-12-evidence","requestId":"req_e3f8af5b1b70","workspaceId":"ws_evidence","deploymentId":"local","jobId":"job_evidence_sync_1","event":"integration.sync","message":"marketplace sync (sample, payload redacted)","integrationCorrelationId":"int_evidence_1","marketplace_payload":"[REDACTED]","DATABASE_URL":"[REDACTED]"}
{"timestamp":"2026-09-14T06:39:30.145Z","level":"info","service":"uta-12-evidence","requestId":"req_e3f8af5b1b70","workspaceId":"ws_evidence","deploymentId":"local","jobId":"job_evidence_sync_1","event":"job.done","message":"job job_evidence_sync_1 completed","durationMs":0}
{"timestamp":"2026-09-14T06:39:30.145Z","level":"info","service":"uta-12-evidence","requestId":"req_e3f8af5b1b70","workspaceId":"ws_evidence","deploymentId":"local","event":"request.done","message":"POST /api/v1/sync completed (sample)"}
```

Note line 3: the raw marketplace payload and `DATABASE_URL` were passed by
the sample on purpose and both arrived as `[REDACTED]` — the redaction
contract holds on the correlated path too.

## Health probes (live `next start`, 2026-09-14)

```bash
curl -s http://localhost:3101/api/health
# {"status":"ok","service":"tokoboss-web","environment":"production","uptimeSeconds":5,"requestId":"req_e3255b84d0ad"}

curl -s http://localhost:3101/api/ready
# {"ready":false,"service":"tokoboss-web","environment":"production","checks":[{"name":"env","status":"degraded"},{"name":"deployment","status":"ok"}],"requestId":"req_21bf6781aa8e"}
```

(`environment: production` because `next start` sets `NODE_ENV=production`;
`ready: false` is the correct fail-closed response with no production
`DATABASE_URL` configured. Neither payload contains tenant data or secrets —
asserted by `health.test.ts`.)
