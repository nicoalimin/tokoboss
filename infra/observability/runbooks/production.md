# Production runbook locations (no vendor purchase)

UTA-12 deliberately buys/configures nothing. When production needs triage,
these are the locations — not new infrastructure.

## Logs

- **Primary:** Vercel deployment logs (stdout JSON lines from `Logger`).
  Filter by `requestId` to follow one request into its jobs, or by
  `errorCode` / `event: job.failed` for failures.
- **CI correlation:** every line may carry `workflowRunId`
  (`owner/repo#run/attempt`) and `deploymentId` (Vercel deployment id /
  commit sha) via `@tokoboss/config` deployment metadata.

## Health

- `GET /api/health` — liveness (safe fields only: status/service/
  environment/version/uptimeSeconds). Use for uptime checks.
- `GET /api/ready` — readiness (`ready` boolean + per-check statuses).
  `ready: false` with `env: degraded` means environment validation failed;
  in production the server fail-fasts at startup (see
  `web/instrumentation.ts`).

## Database (read-only here)

- Preview branching + `DATABASE_URL` wiring: `infra/neon/` scripts and the
  `preview-db` workflow (UTA-11, Done — do not change production credentials
  from this scaffold).
- Migration state: `infra/drizzle/` + `pnpm --filter @tokoboss/database
db:check`; rebase rule in `AGENTS.md`.

## Alerts (stubs, not wired)

Thresholds live in `../alerts/alerts.stub.yaml`; wire them to whatever
on-call channel the team adopts later. Dashboard shape in
`../dashboards/business-impact-dashboard.stub.json`.
