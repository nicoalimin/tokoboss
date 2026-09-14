# Dashboards (placeholder — UTA-12)

No dashboard product is purchased or configured by this scaffold.

- `business-impact-dashboard.stub.json` defines the _shape_ of the future
  business-impact dashboard as vendor-neutral panel definitions. Each panel
  groups stdout JSON log lines by the stable correlation vocabulary
  (`event`, `errorCode`, `workspaceId`, `deploymentId`, …).
- To materialize it later (Grafana/Loki, CloudWatch Insights, or Vercel
  Log Drains), point each panel's `query` hint at the chosen backend.
  Only the sink changes — `packages/observability` log vocabulary and tests
  stay the same.
