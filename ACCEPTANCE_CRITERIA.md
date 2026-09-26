# UTA-102 Acceptance Criteria

## Implementation Checklist

1. **Import catalogTransferItems** in `drizzle-catalog-repository.ts`
   - [ ] Add import for `catalogTransferItems` alongside existing `catalogTransfers`

2. **Add toTransferItem mapper** in `drizzle-catalog-repository.ts`
   - [ ] Add `toTransferItem` function that maps database rows to `TransferItemRecord`
   - [ ] Include all required fields: id, transferId, workspaceId, variantId, requestedQty, sentQty, receivedQty, damagedQty, cancellationReason, version, createdAt, updatedAt

3. **Implement addTransferItems method** in `drizzle-catalog-repository.ts`
   - [ ] Find transfer by ID using existing `findTransferById`
   - [ ] Throw `catalogNotFound('Transfer')` if transfer not found
   - [ ] Throw `catalogConflict` if transfer status is not 'draft'
   - [ ] Validate requestedQty > 0 for each item, throw `catalogValidation` if not
   - [ ] Insert items into `catalogTransferItems` with proper defaults (sentQty=0, receivedQty=0, damagedQty=0, cancellationReason=null, version=1)
   - [ ] Return mapped items using `toTransferItem`

4. **Implement findTransferWithItems method** in `drizzle-catalog-repository.ts`
   - [ ] Find transfer by ID using existing `findTransferById`
   - [ ] Return null if transfer not found
   - [ ] Query items from `catalogTransferItems` filtered by workspaceId and transferId
   - [ ] Order items by `createdAt` ascending
   - [ ] Return object with transfer and mapped items

5. **Implement listTransfersWithItems method** in `drizzle-catalog-repository.ts`
   - [ ] List transfers using existing `listTransfers`
   - [ ] For each transfer, query items from `catalogTransferItems` filtered by workspaceId and transferId
   - [ ] Order items by `createdAt` ascending
   - [ ] Return array of objects with transfer and mapped items

6. **Create transfers-drizzle-items.test.ts** in `packages/database/src/__tests__/`
   - [ ] Create new test file
   - [ ] Set up PGlite database with migration chain 0001→0013
   - [ ] Seed tenant and two warehouses
   - [ ] Seed product and variant to satisfy FK constraints
   - [ ] Test 1: add items to draft transfer - verify requestedQty and defaults
   - [ ] Test 2: add items with qty≤0 - verify catalogValidation error
   - [ ] Test 3: unknown transfer or wrong workspace - verify catalogNotFound error
   - [ ] Test 4: non-draft transfer - verify catalogConflict error
   - [ ] Test 5: findTransferWithItems returns correct data and handles cross-workspace
   - [ ] Test 6: listTransfersWithItems is workspace-scoped

## Verification Checklist

1. **Code Quality**
   - [ ] All formatting checks pass (Prettier, ESLint)
   - [ ] All type checking passes (pnpm typecheck)
   - [ ] All unit tests pass (pnpm --filter @tokoboss/database test)

2. **Scope Compliance**
   - [ ] Only MUST-WRITE files are changed
   - [ ] No .md files created
   - [ ] No changes to infra/drizzle, packages/database/src/schema, or packages/application
   - [ ] No changes to UTA-101 header methods

3. **Diff Verification**
   - [ ] `git diff --name-only origin/main` shows only:
     - `packages/database/src/repositories/drizzle-catalog-repository.ts`
     - `packages/database/src/__tests__/transfers-drizzle-items.test.ts`

4. **Functionality**
   - [ ] All test cases pass with real assertions (no expect(true))
   - [ ] Items are properly validated and stored
   - [ ] Transfer status checks work correctly
   - [ ] Workspace scoping is enforced
   - [ ] FK constraints are satisfied in tests
