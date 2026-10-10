# Replenish / low-stock / draft-PO API — runbook (UTA-146, Story 11)

API only. The UI is UTA-147. PO send / receive / goods-in is Story 10
(UTA-49) and is not part of this API.

## Endpoints

All paths sit under `/api/workspaces/:workspaceId/catalog/`. Every call needs
`Authorization: Bearer <token>` and is scoped to that workspace.

| Method + path                                   | Who            | Notes                                                                  |
| ----------------------------------------------- | -------------- | ---------------------------------------------------------------------- |
| `PATCH variants/:variantId/replenish-settings`  | Manager, Admin | `minStockQty`, `leadTimeDays`, `maxStockQty`; CAS on `expectedVersion` |
| `POST replenish-settings/bulk`                  | Manager, Admin | `items[]`, per-item CAS on `expectedVersion`                           |
| `GET low-stock-recommendations[?budgetCents=N]` | Any member     | Read-only list with "Kenapa?" explainability                           |
| `PUT variants/:variantId/recommendation-state`  | Manager, Admin | Dismiss / snooze / edit qty; `expectedVersion` null on first write     |
| `POST purchase-orders`                          | Manager, Admin | Creates a **draft** PO (201)                                           |
| `PATCH purchase-orders/:purchaseOrderId`        | Manager, Admin | Replaces supplier, notes, and all items on a draft (200)               |

Body shapes live in `packages/contracts/src/schemas/replenish.ts` and
`UpdateReplenishSettingsBodySchema` in
`packages/contracts/src/schemas/catalog.ts`.

## Honest data rules

- `salesRatePerDay` / `stockCoverDays` are `null` when there is not enough
  sales history; the explainability bullets say so in plain language.
- `missingSupplier` / `missingHpp` flag gaps. Draft PO `supplierName` and
  `unitCostCents` stay `null` when unknown — never invented. A blank
  supplier string is saved as `null`.
- Dismissed and snoozed (until `snoozedUntil`) variants are hidden from the
  list. Bundles are excluded. In-transit stock from transfers and
  `maxStockQty` cap the suggested quantity; `budgetCents` trims the list by
  HPP.

## Errors

| Status | `errorCode`          | When                                                |
| ------ | -------------------- | --------------------------------------------------- |
| 400    | `CATALOG_VALIDATION` | Body or `budgetCents` fails validation              |
| 401    | auth error code      | Missing or expired token                            |
| 403    | role error code      | Staff calls a Manager/Admin endpoint                |
| 404    | `CATALOG_NOT_FOUND`  | Unknown variant or purchase order (or other tenant) |
| 409    | conflict code        | Stale `expectedVersion`; re-read and retry          |

## Storage modes (memory vs `DATABASE_URL`)

| Mode                                | How                                                                       |
| ----------------------------------- | ------------------------------------------------------------------------- |
| Memory (default, no `DATABASE_URL`) | Process-local `InMemoryCatalogStore`; responses say `"storage": "memory"` |
| Postgres (`DATABASE_URL` set)       | `DrizzleCatalogStore` via `createDb()`; `"storage": "postgres"`           |

Route shapes are identical in both modes. Postgres needs migrations
`0014_variant_replenish_settings`, `0015_recommendation_states`,
`0016_draft_purchase_orders`, and `0017_variant_max_stock` in
`infra/drizzle/`.

## Run locally

```bash
pnpm install
pnpm --filter @tokoboss/web dev   # memory mode unless DATABASE_URL is set
```

## Checks

```bash
pnpm run format:check
pnpm --filter ./web run typecheck
pnpm run lint
pnpm --filter @tokoboss/application test
cd web && npx vitest run src/__tests__/low-stock-recommendations-list.test.ts \
  src/__tests__/recommendation-state-route.test.ts \
  src/__tests__/purchase-orders-route.test.ts \
  src/__tests__/purchase-order-draft-patch-route.test.ts
```
