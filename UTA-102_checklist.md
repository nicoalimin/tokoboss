# UTA-102 Implementation Checklist

## Acceptance Criteria

1. **Scope**: Implement Drizzle TransferStore items + WithItems functionality ONLY
   - `addTransferItems` method
   - `findTransferWithItems` method
   - `listTransfersWithItems` method

2. **Implementation Requirements**:
   - Match `InMemoryCatalogStore` behavior
   - No variant existence/archived checks in application logic
   - Seed real variants in PGlite tests (FK `variant_id → catalog_variants`)
   - Reject qty≤0 via `catalogValidation`
   - Unknown transfer/wrong workspace → `catalogNotFound`
   - Status≠draft → `catalogConflict`
   - Zero sent/received/damaged, `cancellationReason: null`, version 1

3. **ALLOWLIST Compliance**:
   - Only modify files in:
     - `packages/database/src/repositories/`
     - `packages/database/src/__tests/`

4. **MUST-WRITE Files**:
   - `packages/database/src/repositories/drizzle-catalog-repository.ts`
   - `packages/database/src/__tests__/transfers-drizzle-items.test.ts`

5. **Testing Requirements**:
   - Create comprehensive test file with real assertions (no `expect(true)`)
   - Test all three methods with various scenarios
   - Use PGlite + CHAIN 0001→0013
   - Seed tenant, warehouses, and catalog items

6. **Code Quality**:
   - `pnpm typecheck` passes
   - `pnpm --filter @tokoboss/database test` passes
   - `pnpm run test` passes

## Implementation Plan

### Step 1: Update drizzle-catalog-repository.ts

- [ ] Import `catalogTransferItems` from schema
- [ ] Add `toTransferItem` mapper function
- [ ] Implement `addTransferItems` method
- [ ] Implement `findTransferWithItems` method
- [ ] Implement `listTransfersWithItems` method
- [ ] Run formatter, typecheck

### Step 2: Create transfers-drizzle-items.test.ts

- [ ] Set up PGlite + drizzle
- [ ] Configure CHAIN 0001→0013
- [ ] Seed test data (tenants, warehouses, catalog items)
- [ ] Test `addTransferItems` with valid data
- [ ] Test `addTransferItems` with qty≤0 (should reject)
- [ ] Test unknown transferId (should return null)
- [ ] Test wrong workspace (should return null)
- [ ] Test status≠draft (should reject)
- [ ] Test `findTransferWithItems` returns transfer + items
- [ ] Test `findTransferWithItems` cross-workspace (should return null)
- [ ] Test `listTransfersWithItems` workspace-scoped
- [ ] Run formatter, tests

### Step 3: Validation

- [ ] Verify only MUST-WRITE files in `git diff --name-only origin/main`
- [ ] Run all tests and fix failures
- [ ] Final formatting pass
