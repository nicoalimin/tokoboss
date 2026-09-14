# Dashboards (placeholder — UTA-12)

No paid vendor required. Business-impact dashboards will be defined here as
portable queries over the stdout JSON logs (e.g. Vercel log drains, `jq`, or
any OpenTelemetry-compatible collector adopted later).

Planned panels (to be built when the first product modules land):

- Request rate / error rate by `service`, `route`, `errorCode`.
- P95 latency by route (requires duration fields — add when timing middleware lands).
- Background job completions vs failures by `jobId`/`task`, joined on `correlationId`.
- Preview vs production split by `deployment.environment` / `deployment.id`.

Each panel definition must state its log-field dependencies so a field rename
fails a documented test, not a silent dashboard.
