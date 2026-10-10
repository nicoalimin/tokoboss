# Stok tipis / draft-PO UI — runbook (UTA-147, Story 11)

## What shipped

- **Stok tipis** at `/stok-tipis`: loads the caller's workspace via
  `getMyMembership()`, then the low-stock list from the replenish API.
  Each row shows SKU, available vs min, sales rate / cover days (or
  "Belum ada data penjualan" when there is no sales data), suggested
  qty, and a "Kenapa?" list that renders the API explainability bullets
  as-is (in-transit, max-stock, bundle and budget reasons come from
  there; the UI invents nothing).
- **Honesty chips**: "Supplier kosong" and "HPP kosong" on rows; the draft
  PO preview blocks "Buat draft PO" until supplier gaps are fixed and
  never fills in prices.
- **Actions**: Tunda (snooze 7 days), Abaikan (dismiss), Atur ambang
  (min stock required, lead time / max stock optional), budget cap
  ("Terapkan budget", whole rupiah, sent as `?budgetCents=`), and
  multi-select into "Pratinjau draft PO" with editable qty per line.
- **Draft only**: creating saves a DRAFT purchase order and shows
  "Belum dikirim ke supplier". Send / receive / goods-in stay in Story 10
  (UTA-49).
- **Errors**: 401 `INVALID_SESSION` redirects to `/sign-in?expired=1`;
  other errors show client-safe Bahasa Indonesia copy without ids or SKUs.
- **Code**: components in `src/components/replenish/`, client in
  `src/lib/replenish-client.ts` (`credentials: "same-origin"`), draft
  helpers in `src/lib/replenish-draft.ts`. API contract and endpoints:
  `infra/observability/runbooks/replenish-api.md`.

## Run locally

```bash
pnpm install
pnpm --filter @tokoboss/web dev   # http://localhost:3000/stok-tipis
```

Memory mode (no `DATABASE_URL`) and Postgres mode behave the same in the
UI; only the store changes.

## Manual pass (memory mode)

1. Sign in as a seeded Manager (see `web/README.md`).
2. Create a product at `/produk` with low stock, then open `/stok-tipis`.
3. Open "Kenapa?" on a row; check the bullets match the API reasons.
4. Atur ambang: set min stock above available, save; the list reloads.
5. Enter a budget (e.g. `1.500.000`) and apply; the list trims to fit.
6. Select rows, open "Pratinjau draft PO", edit a qty, create; the
   success note says the draft was not sent.
7. Tunda / Abaikan a row; it disappears from the list.

## Checks

- `pnpm --filter @tokoboss/web typecheck` and `lint` must pass.
- Tests: `replenish-client*.test.ts`, `replenish-draft.test.ts`,
  `replenish-settings-form.test.ts`, `budget-filter.test.ts`, and the
  `low-stock-recommendations-*.test.ts` route tests in `web/src/__tests__/`.
