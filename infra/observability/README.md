# Observability — baseline scaffold (UTA-12)

No paid monitoring vendor required. Structured JSON logs on stdout, a shared
correlation vocabulary, secret/PII redaction with tests, health/readiness
endpoints, and placeholder locations for dashboards/alerts/runbooks.

## How to run CI locally

From a clean checkout, the same gates CI runs (see
`.github/workflows/ci.yml`):

```bash
pnpm install --frozen-lockfile
pnpm lint                       # all workspace lint scripts
pnpm typecheck                   # all workspace typechecks
pnpm test:boundaries             # Clean Architecture boundary enforcement
pnpm test:example                # example use-case smoke
pnpm test                        # all workspace unit tests (PGlite, no creds)
pnpm --filter @tokoboss/database db:check:kit   # Drizzle schema vs SQL drift
pnpm --filter @tokoboss/database db:check       # journal sync + clean tree
pnpm --filter @tokoboss/web build               # web production build
pnpm --filter @tokoboss/mobile lint
pnpm --filter @tokoboss/mobile typecheck
node infra/observability/ci-failure-proof.mjs    # negative controls (below)
```

### Negative controls (CI blocks broken checks)

`infra/observability/ci-failure-proof.mjs` injects a deliberately broken
fixture per gate, runs the **real** gate command, and asserts it fails:

| Gate      | Fixture                                      | Command                                                              |
| --------- | -------------------------------------------- | -------------------------------------------------------------------- |
| Boundary  | `import 'next'` inside `packages/domain/src` | `pnpm test:boundaries` must exit non-zero                            |
| Typecheck | `const x: number = '...'` in observability   | `pnpm --filter @tokoboss/observability typecheck` must exit non-zero |
| Unit test | `expect('ci-proof').toBe('green')`           | `pnpm --filter @tokoboss/observability test` must exit non-zero      |

Fixtures are removed in a `finally` block. If any gate passes broken input,
the script (and the CI `failure-proof` job) goes red.

## How to read correlation IDs

Headers (set by `web/src/middleware.ts` on `/api/*`, echoed by every
endpoint):

| Header                          | Meaning                                                                           |
| ------------------------------- | --------------------------------------------------------------------------------- |
| `x-request-id` (`req_...`)      | one inbound request; generated if absent                                          |
| `x-correlation-id` (`corr_...`) | end-to-end trace: request → job → integration; caller-supplied value is preserved |
| `x-workflow-run-id`             | GitHub Actions run id, when present                                               |

Log context vocabulary (`packages/observability/src/correlation.ts`):
`requestId`, `correlationId`, `workspaceId` (opaque `ws_...`, never PII),
`jobId`, `workflowRunId`, `integrationCorrelationId`, `deploymentId`,
`errorCode` (stable codes e.g. `ENV_INVALID`, `DB_UNREACHABLE`).

Local diagnostics:

```bash
# Terminal 1 — boot the built app
pnpm --filter @tokoboss/web build
cd web && APP_ENV=local npx next start -p 3000

# Terminal 2 — one correlated request + background execution
CORR="corr_manual_$(date +%s)"
curl -s http://localhost:3000/api/health -H "x-correlation-id: $CORR"
curl -s -X POST http://localhost:3000/api/jobs/sample \
  -H 'content-type: application/json' -H "x-correlation-id: $CORR" \
  -d '{"task":"reconcile-sample"}'
# Terminal 1 log lines sharing $CORR join the trace end to end.
```

Worked example with pasted output: [`correlation-evidence.md`](./correlation-evidence.md).

## Redaction

`packages/observability/src/redact.ts` — every logger call passes through
`redact()`. Redacted: secrets/tokens (`DATABASE_URL`, API keys, Bearer),
customer PII (email, phone, NIK, names), raw marketplace payloads
(`raw_payload`, `marketplace_payload`, webhook bodies), private Blob paths
(host shape kept, path replaced with `[REDACTED_BLOB_PATH]`). Postgres URLs
reduce to host-only. Tests: `packages/observability/src/__tests__/redact.test.ts`
(13 tests total in the package).

## Health / readiness

- `GET /api/health` — liveness. Cheap, unauthenticated. Returns status,
  service, env name only, timestamp, deployment id, request/correlation ids.
- `GET /api/ready` — readiness. Validates env via `@tokoboss/config` and
  reports `ready`/`not-ready` with per-check pass/fail only.
- `POST /api/jobs/sample` — sample background execution reusing the request
  correlation id (evidence for the trace above).

None of these expose tenant data, connection strings, or secrets — asserted
by the CI `health` job (secret-pattern scan over responses + server log) and
by `assertNoSecrets` unit coverage.

## Where runbooks live

- [`runbooks/`](./runbooks/) — local diagnostics + production runbooks
  (CI failures, preview DB, health/readiness triage).
- [`dashboards/`](./dashboards/) — business-impact dashboard definitions
  (placeholder queries over stdout JSON; no vendor purchase).
- [`alerts/`](./alerts/) — alert rule placeholders with the same constraint.
