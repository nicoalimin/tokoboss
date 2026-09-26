# UTA-101 Acceptance Criteria Checklist

## Ticket Summary

UTA-101: Implement TransferStore header methods (draft/read only) on DrizzleCatalogStore

## Acceptance Criteria Checklist

1. ✅ **Branch Setup**
   - Create fresh branch `devbox/uta-101-6` from current `main`
   - Do NOT reuse abandoned dirty history from #38-#41
   - Work in worktree `UTA-101-6`

2. ✅ **Code Implementation**
   - Edit `packages/database/src/repositories/drizzle-catalog-repository.ts`
   - Change to: `export class DrizzleCatalogStore implements CatalogStore, TransferStore`
   - Import `TransferStore` + transfer types from `@tokoboss/application`
   - Implement **only these three** methods (match `InMemoryCatalogStore`):
     - `createTransferDraft`: status `draft`, version 1, throw `catalogConflict` if duplicate referenceNum
     - `findTransferById`: null across workspaces
     - `listTransfers`: workspace-scoped, oldest first
   - Map rows ↔ `TransferRecord` using `packages/database/src/schema/transfers.ts`
   - Stub remaining TransferStore methods with: `throw new Error('UTA-102')`

3. ✅ **Test Implementation**
   - Add tests under `packages/database/src/__tests__/` (e.g., `transfers-drizzle-header.test.ts`)
   - Seed tenant + two warehouses via existing catalog test helpers
   - Cover:
     - Draft creation success
     - Duplicate referenceNum → catalogConflict
     - Cross-workspace isolation (findTransferById)
     - listTransfers scoped + oldest-first
   - Real assertions (no `expect(true)`)

4. ✅ **Formatting & Typecheck**
   - Run repository formatter on all files
   - `pnpm typecheck` passes
   - `pnpm --filter @tokoboss/database typecheck` passes

5. ✅ **Tests Pass**
   - `pnpm --filter @tokoboss/database test` passes
   - `pnpm run test` passes

6. ✅ **Allowlist Validation**
   - `git diff --name-only origin/main...HEAD` lists ONLY:
     - `packages/database/src/repositories/drizzle-catalog-repository.ts`
     - At least one new/changed file under `packages/database/src/__tests__/`

7. ✅ **Forbidden Paths Not Touched**
   - NO changes to:
     - `packages/application/**`
     - `infra/drizzle/**`, `infra/neon/**`
     - `packages/database/src/schema/**`
     - `web/`, `mobile/`, `yaak/`, `tests/example-use-case/`
     - `pnpm-lock.yaml`, `**/package.json`, root `*.md` files

8. ✅ **PR Ready**
   - PR open with allowlist-only diff
   - CI green (false positives from forbidden paths fixed)
