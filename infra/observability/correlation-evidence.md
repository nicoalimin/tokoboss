# Correlation evidence (UTA-12)

Sample request + sample background execution correlated end to end via one
`x-correlation-id`. Captured locally against `next start` (built web app,
`APP_ENV=local`).

Request (caller-supplied correlation id):

```bash
CORR="corr_evid2_1789371170"
curl -s -X POST http://localhost:3111/api/jobs/sample \
  -H 'content-type: application/json' \
  -H "x-correlation-id: $CORR" \
  -d '{"task":"reconcile-sample"}'
```

Response:

```json
{
  "jobId": "job_mu0xe7xwo2ultyzi",
  "correlationId": "corr_evid2_1789371170",
  "requestId": "req_mu0xe7xl17ro90nv",
  "status": "completed"
}
```

Server stdout — all four lines share `corr_evid2_1789371170` across two
services (`web` → `sample-job` → `web`):

```json
{"timestamp":"2026-09-14T07:32:50.994Z","level":"info","message":"sample job requested","service":"web","requestId":"req_mu0xe7xl17ro90nv","correlationId":"corr_evid2_1789371170","route":"/api/jobs/sample"}
{"timestamp":"2026-09-14T07:32:50.996Z","level":"info","message":"sample job started","service":"sample-job","jobId":"job_mu0xe7xwo2ultyzi","correlationId":"corr_evid2_1789371170","requestId":"req_mu0xe7xl17ro90nv","task":"reconcile-sample"}
{"timestamp":"2026-09-14T07:32:50.998Z","level":"info","message":"sample job finished","service":"sample-job","jobId":"job_mu0xe7xwo2ultyzi","correlationId":"corr_evid2_1789371170","requestId":"req_mu0xe7xl17ro90nv","status":"completed"}
{"timestamp":"2026-09-14T07:32:50.998Z","level":"info","message":"sample job accepted","service":"web","requestId":"req_mu0xe7xl17ro90nv","correlationId":"corr_evid2_1789371170","jobId":"job_mu0xe7xwo2ultyzi"}
```

Health endpoint sample (redacted — no tenant data, no secrets):

```json
{
  "status": "ok",
  "service": "web",
  "env": "local",
  "timestamp": "2026-09-14T07:32:31.282Z",
  "deploymentId": null,
  "requestId": "req_mu0xdsq12mw1mkjv",
  "correlationId": "corr_evid_1789371151"
}
```

Redaction test output (`pnpm --filter @tokoboss/observability test`):

```text
 ✓ src/__tests__/correlation.test.ts (3 tests)
 ✓ src/__tests__/redact.test.ts (7 tests)
 ✓ src/__tests__/logger.test.ts (2 tests)
 ✓ src/__tests__/sample-job.test.ts (1 test)

 Test Files  4 passed (4)
      Tests  13 passed (13)
```

Negative controls (`node infra/observability/ci-failure-proof.mjs`):

```text
ok: boundary gate blocked the forbidden domain import
ok: typecheck gate blocked the deliberate type error
ok: unit-test gate blocked the deliberately failing test
ci-failure-proof OK: boundary/type/test gates all block broken fixtures
```
