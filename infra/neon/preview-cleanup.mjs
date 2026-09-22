#!/usr/bin/env node
/**
 * Preview cleanup — delete a PR's Neon preview branch and its branch-scoped
 * Vercel DATABASE_URL. Runs on PR close (see `.github/workflows/preview-db.yml`)
 * and can be run by operators for a single PR.
 *
 * Usage:
 *   PR_NUMBER=123 GIT_BRANCH=feat/foo \
 *   NEON_API_KEY=... NEON_PROJECT_ID=... NEON_STAGING_BRANCH_ID=... \
 *   VERCEL_TOKEN=... VERCEL_PROJECT_ID=... \
 *   node preview-cleanup.mjs [--dry-run] [--skip-vercel]
 *
 * Idempotent: a missing branch or missing Vercel env counts as success
 * (already cleaned). Blob prefixes: no private store exists yet (UTA-15 is
 * out of scope) — the hook point is marked below so UTA-15 can extend it.
 */

import {
  correlationRecord,
  deleteNeonBranch,
  deleteVercelBranchEnv,
  findBranchByName,
  listNeonBranches,
  loadPreviewEnv,
  previewBranchName,
} from './preview-lib.mjs';

function log(record) {
  console.log(`[preview-cleanup] ${JSON.stringify(record)}`);
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const dryRun = args.has('--dry-run') || process.env.PREVIEW_DRY_RUN === '1';
  const skipVercel = args.has('--skip-vercel');

  const prNumber = process.env.PR_NUMBER;
  const gitBranch = process.env.GIT_BRANCH;
  if (!prNumber) {
    console.error('preview-cleanup failed: PR_NUMBER is required.');
    process.exit(2);
  }

  let name;
  try {
    name = previewBranchName(prNumber);
  } catch (error) {
    console.error(`preview-cleanup failed: ${error.message}`);
    process.exit(1);
  }

  let env;
  try {
    env = loadPreviewEnv({ needVercel: !skipVercel });
  } catch (error) {
    if (!dryRun) {
      console.error(`preview-cleanup failed: ${error.message}`);
      process.exit(1);
    }
    env = null;
  }

  if (dryRun) {
    log(
      correlationRecord({
        action: 'dry-run-plan',
        prNumber,
        gitBranch: gitBranch ?? null,
        neonBranchId: '(dry-run)',
        neonBranchName: name,
        databaseHost: '(dry-run)',
        vercelDeploymentId: null,
      })
    );
    console.log(
      `[preview-cleanup] Dry run: would delete Neon branch ${JSON.stringify(name)} ` +
        `and the branch-scoped Vercel DATABASE_URL for git branch ${JSON.stringify(gitBranch)}.`
    );
    return;
  }

  try {
    const branches = await listNeonBranches({
      apiKey: env.neonApiKey,
      projectId: env.neonProjectId,
    });
    const branch = findBranchByName(branches, name);
    if (!branch) {
      log(
        correlationRecord({
          action: 'branch-already-gone',
          prNumber,
          gitBranch: gitBranch ?? null,
          neonBranchId: null,
          neonBranchName: name,
          databaseHost: null,
          vercelDeploymentId: null,
        })
      );
    } else {
      // Safety: never delete the staging parent, the production branch, or
      // anything production-like.
      const lowered = String(branch.name ?? '').toLowerCase();
      if (
        lowered === 'main' ||
        lowered === 'prod' ||
        lowered === 'production' ||
        lowered === 'staging' ||
        branch.id === env.stagingBranchId ||
        (env.productionBranchId != null && branch.id === env.productionBranchId)
      ) {
        throw new Error(
          `Refusing to delete protected branch ${JSON.stringify(branch.name)}.`
        );
      }
      const deleted = await deleteNeonBranch({
        apiKey: env.neonApiKey,
        projectId: env.neonProjectId,
        branchId: branch.id,
      });
      log(
        correlationRecord({
          action: deleted ? 'branch-deleted' : 'branch-already-gone',
          prNumber,
          gitBranch: gitBranch ?? null,
          neonBranchId: branch.id,
          neonBranchName: name,
          databaseHost: null,
          vercelDeploymentId: null,
        })
      );
    }
  } catch (error) {
    console.error(`preview-cleanup failed: neon step: ${error.message}`);
    console.error('preview-cleanup: retry is safe — re-run for the same PR.');
    process.exit(1);
  }

  if (!skipVercel && gitBranch) {
    try {
      const deleted = await deleteVercelBranchEnv({
        token: env.vercelToken,
        projectId: env.vercelProjectId,
        teamId: env.vercelTeamId,
        gitBranch,
      });
      console.log(
        `[preview-cleanup] Removed ${deleted} branch-scoped DATABASE_URL var(s).`
      );
    } catch (error) {
      console.error(`preview-cleanup failed: vercel step: ${error.message}`);
      process.exit(1);
    }
  }

  // Hook point for UTA-15 (Vercel Blob private store): delete any preview
  // Blob prefixes here once the store exists. No-op today by design.
  console.log(
    '[preview-cleanup] Blob cleanup: no-op (private store lands in UTA-15).'
  );
  console.log(`[preview-cleanup] Done for PR #${prNumber}.`);
}

main();
