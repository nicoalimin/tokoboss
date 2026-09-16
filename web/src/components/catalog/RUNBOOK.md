# Produk & Stok UI + SKU drawer — runbook (UTA-76)

## What shipped

- **Produk & Stok** at `/produk`: workspace loader, cross-identifier search
  (`GET .../catalog/search` across name / SKU TokoBoss / barcode / Store SKU
  hint / listing name), information-dense product rows (primary SKU TokoBoss
  in mono, all variant price hints, total stock, status), create form
  (≥1 variant), confirm-gated archive (no hard delete), duplicate-SKU
  conflict copy with the existing-product route reference.
- **SKU drawer** (`SkuDrawer`, right-side overlay — the list stays mounted):
  SKU TokoBoss visually primary, variant picker, editable details (name,
  price, barcode, HPP + cost-source label, listing name), product-level
  unit + pictures (opaque upload IDs, never bytes/URLs), Admin-only SKU-code
  edit with the locked note after stock/mappings (server 422
  `CATALOG_SKU_LOCKED`), read-only Store mappings (no live channel calls),
  per-warehouse quantities, adjustment form requiring warehouse +
  non-zero delta + reason (saves straight to the ledger), ledger list.
- **RBAC chrome**: Manager/Admin see create + archive + drawer edits;
  Staff sees the read-only note and keeps drawer adjustments
  (server-scoped); 401 `INVALID_SESSION` redirects to
  `/sign-in?expired=1`; 403 renders honest no-access copy. The server stays
  the boundary.
- **Entry points**: bottom-left `•••` / `Lainnya` menu (`AppNav`, global)
  links to Produk & Stok; the home page links there too.
- **Client**: `src/lib/catalog-client.ts` (`credentials: "same-origin"`);
  copy in `src/lib/catalog-copy.ts` (EN default + ID).

## Run locally

```bash
pnpm install
pnpm --filter @tokoboss/web dev   # http://localhost:3000/produk
```

## Storage modes (memory vs `DATABASE_URL`)

| Mode                                | How                                                                                                          | Catalog source         |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------- |
| Memory (default, no `DATABASE_URL`) | Process-local stores; responses include `"storage": "memory"`. Fixture: `seedFixtureCredential()` + sign in. | `InMemoryCatalogStore` |
| Postgres (`DATABASE_URL` set)       | Drizzle stores via `createDb()`; same route shapes, `"storage": "postgres"`.                                 | `DrizzleCatalogStore`  |

The Produk UI behaves identically across modes; only the store changes.
Tests run in memory mode:

```bash
pnpm --filter @tokoboss/web test --run src/__tests__/produk-ui.test.ts
```

## Manual pass (memory mode)

```bash
pnpm --filter @tokoboss/web dev
# 1. Sign in at http://localhost:3000/sign-in as a seeded user
#    (seed via `seedFixtureCredential` as in web/README.md; copy its workspace ID).
# 2. Open http://localhost:3000/produk via the bottom-left ••• / Lainnya
#    menu, paste the workspace ID, Load products.
# 3. Create a product (name + SKU TokoBoss + price) — re-creating the same
#    SKU shows the duplicate copy with the existing-product route.
# 4. Search "kaos", the SKU code, a barcode, or a Store SKU hint — the same
#    row comes back; opening it shows the drawer while the list stays open.
# 5. In the drawer: edit price/HPP/cost-source, save; as Admin rename the
#    SKU code before any movement, then adjust stock (warehouse + delta +
#    reason) and watch the ledger row appear with the new balance.
# 6. Archive the product (confirm) — the row flips to Archived, history
#    stays readable, and there is no delete button anywhere.
```

## Checks

- `pnpm --filter @tokoboss/web typecheck` — must pass.
- `pnpm --filter @tokoboss/web lint` — must pass.
- New tests: `web/src/__tests__/produk-ui.test.ts` (10 tests: list/search
  cookies, create defaults, duplicate path, adjust + ledger, drawer reads,
  version save, re-auth/forbidden/version/lock mapping, no-secret errors,
  IDR format, copy sync).
