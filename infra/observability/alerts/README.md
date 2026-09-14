# Alerts (placeholder — UTA-12)

No alerting product is purchased or configured by this scaffold.

- `alerts.stub.yaml` documents the signals that deserve paging vs tickets
  (readiness, job-failure rate, error share, integration stall) with
  vendor-neutral `queryHint`s over the stdout JSON log vocabulary.
- A later issue wires these to the team's on-call channel. Runbooks live in
  `../runbooks/`.
