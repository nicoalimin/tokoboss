# Runbook: health / readiness

Endpoints: `GET /api/health` (liveness), `GET /api/ready` (readiness),
`POST /api/jobs/sample` (correlation demo). All secret-free by design.

Triage:

1. `curl -s localhost:3000/api/health` → expect `{"status":"ok",...}`.
   Non-200: process down — check `next start` output / Vercel deployment logs.
2. `curl -s localhost:3000/api/ready` → `not-ready` with
   `checks.env == "fail"` means env validation failed. Compare against
   `infra/vercel/README.md` required vars for the current `APP_ENV`.
   In `production`/`staging` the server refuses to start on invalid env
   (see `web/instrumentation.ts`); in `preview`/`local` it starts degraded.
3. Correlate: pass `-H "x-correlation-id: corr_debug_1"` and grep server
   stdout for that id — request, job, and integration lines join on it.
4. Leak suspicion: responses must never contain connection strings, tokens,
   emails, or tenant rows. If one does, treat as a security incident first,
   then add a `redact.ts` pattern + regression test.
