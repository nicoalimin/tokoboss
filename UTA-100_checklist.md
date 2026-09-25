# UTA-100 Acceptance Criteria Checklist

## From Issue Description

1. [ ] `packages/database/src/schema/transfers.ts` matches catalog conventions
2. [ ] `packages/database/src/schema/index.ts` exports and includes transfers schema
3. [ ] `infra/drizzle/0013_transfer_management.sql` matches schema with uuid PKs
4. [ ] `infra/drizzle/meta/_journal.json` has idx 12 / tag 0013_transfer_management
5. [ ] `infra/drizzle/meta/0013_snapshot.json` exists and is correct

## From Continue Instructions

1. [ ] Add missing `infra/drizzle/meta/0013_snapshot.json`
2. [ ] Revert out-of-scope noise (mobile/package.json pnpm-lock.yaml)
3. [ ] `test -f infra/drizzle/meta/0013_snapshot.json` passes
4. [ ] `git diff --name-only origin/main...HEAD` shows exactly the 5 required files
5. [ ] `pnpm typecheck` passes
6. [ ] `pnpm --filter @tokoboss/database test` passes
