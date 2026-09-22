# Product import review UI — runbook (UTA-78)

## What shipped

- **Import review** at `/produk/impor` (entered from `/produk` via the
  `Review product imports` link; back-links to Produk + home): workspace
  loader, upload form, batch list, reviewable row table, edit/reject rows,
  confirm-before-create wired to the UTA-77 APIs.
- **Upload**: paste CSV text or pick a `.csv` file (read locally with
  `File.text()`, sent as `content`); or toggle to pre-parsed rows JSON
  (xlsx/photo/PDF converters submit `rows` — the server never parses
  binary formats). Idempotent retries surface the duplicate notice and
  open the existing batch.
- **Review rows**: product, SKU TokoBoss (primary, mono), Store SKU shown
  everywhere as a _mapping candidate only_ (hint text under every cell),
  price (IDR), status, errors, `duplicateOf.existingPath` (opaque route +
  source), applied marker. Row edit (name/SKU/price/note, re-validated) +
  reject. Batch reject/reopen with confirm gates.
- **Confirm**: `POST …/imports/:batchId/confirm` creates catalog
  products + SKU TokoBoss rows via the UTA-75 rules. Summary shows
  applied / duplicates (`skuCode → existingPath`, existing catalog kept,
  never overwritten) / skipped. Confirm is `window.confirm`-gated.
- **RBAC chrome**: Manager/Admin see upload + edit + confirm; Staff sees
  the read-only note; 401 `INVALID_SESSION` redirects to
  `/sign-in?expired=1`; 403 renders honest no-access copy. The server
  stays the boundary. No live marketplace calls anywhere.
- **Client**: `src/lib/imports-client.ts` (`credentials: "same-origin"`);
  copy in `src/lib/imports-copy.ts` (EN default + ID).

## Run locally

```bash
pnpm install
pnpm --filter @tokoboss/web dev   # http://localhost:3000/produk/impor
```

## Storage modes (memory vs `DATABASE_URL`)

Same wiring as `@/lib/imports` (UTA-77): memory by default (responses
include `"storage": "memory"`), Postgres via `createDb()` when
`DATABASE_URL` is set. The review UI behaves identically across modes.

Tests run in memory mode:

```bash
pnpm --filter @tokoboss/web test --run src/__tests__/import-review-ui.test.ts
```

## Manual pass (memory mode)

```bash
pnpm --filter @tokoboss/web dev
# 1. Sign in at http://localhost:3000/sign-in as a seeded user
#    (seed via `seedFixtureCredential` as in web/README.md; copy its workspace ID).
# 2. Open http://localhost:3000/produk, follow "Review product imports".
# 3. Paste the workspace ID, Load imports (empty state first).
# 4. Upload this CSV (filename produk.csv):
#    product_name,sku_tokoboss,variant_name,price,store_sku,channel,shop_id,platform_sku_id
#    Kaos Polos,KAOS-MERAH-M,Merah / M,99000,SELLER-KAOS-M,shopee,shop_42,SHOPEE-9001
#    Kaos Polos,KAOS-PUTIH-L,Putih / L,99000,,,
# 5. Open the batch: row 1 shows the Store SKU as a mapping candidate,
#    never as the identity. Edit row 2 (fix name/price), reject nothing.
# 6. Confirm ready rows (confirm gate) — summary shows applied: 2.
#    Re-upload the same CSV and confirm again — duplicates list
#    `KAOS-… → /api/workspaces/…/catalog/products/…`, nothing overwritten.
# 7. As Staff: batches/rows stay readable, upload + edit + confirm hide
#    behind the read-only note.
```

## Checks

- `pnpm --filter @tokoboss/web typecheck` — must pass.
- `pnpm --filter @tokoboss/web lint` — must pass.
- New tests: `web/src/__tests__/import-review-ui.test.ts` (9 tests:
  upload cookies + identity freeze, list/detail, edit/reject/reopen,
  confirm duplicates with existingPath, rows-JSON bounds, re-auth/
  forbidden/validation mapping, no-secret errors, IDR format, copy sync).
