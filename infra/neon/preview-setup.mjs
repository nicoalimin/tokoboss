#!/usr/bin/env node
/**
 * Preview setup — create (or reuse) an isolated Neon child branch of Staging
 * for a PR, migrate + synthetic-seed it, and wire its DATABASE_URL into the
 * PR's Vercel preview via a branch-scoped env var.
 *
 * Usage (GitHub Actions `preview-db.yml` calls this; operators can run it too):
 *
 *   PR_NUMBER=123 GIT_BRANCH=feat/foo \
 *   NEON_API_KEY=... NEON_PROJECT_ID=... NEON_STAGING_BRANCH_ID=... \
 *   VERCEL_TOKEN=... VERCEL_PROJECT_ID=... \
 *   APP_ENV=preview node preview-setup.mjs [--dry-run] [--skip-migrate] [--skip-vercel]
 *
 * Idempotent: re-running for the same PR reuses `preview/pr-<n>` when it
 * already exists. Any failure exits non-zero with an actionable message and
 * no half-applied silent success (nothing is reported as ready until every
 * step passes). Never logs connection strings — only redacted hostnames.
 */

import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertNoProductionUrl,
  assertPreviewEnv,
  assertStagingParent,
  correlationRecord,
  createNeonBranch,
  deleteNeonBranch,
  findBranchByName,
  getBranchConnectionUri,
  listNeonBranches,
  loadPreviewEnv,
  previewBranchName,
  redactUrl,
  resolveStagingBranch,
  upsertVercelBranchEnv,
  waitForBranchReady,
} from './preview-lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');

function usageError(message) {
  console.error(`preview-setup: ${message}`);
  process.exit(2);
}

function log(record) {
  console.log(`[preview-setup] ${JSON.stringify(record)}`);
}

function runMigrateAndSeed({ databaseUrl, skipMigrate }) {
  if (skipMigrate) {
    console.log('[preview-setup] --skip-migrate: skipping Drizzle migrate + seed.');
    return;
  }
  const env = {
    ...process.env,
    APP_ENV: 'preview',
    DATABASE_URL: databaseUrl,
  };
  console.log('[preview-setup] Running reviewed Drizzle migrations against the preview branch ...');
  execFileSync(
    'pnpm',
    ['--filter', '@tokoboss/database', 'db:migrate'],
    { cwd: REPO_ROOT, env, stdio: 'inherit' }
  );
  console.log('[preview-setup] Loading synthetic seed (never production data) ...');
  execFileSync(
    'pnpm',
    ['--filter', '@tokoboss/database', 'db:seed'],
    { cwd: REPO_ROOT, env, stdio: 'inherit' }
  );
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const dryRun =
    args.has('--dry-run') || process.env.PREVIEW_DRY_RUN === '1';
  const skipMigrate = args.has('--skip-migrate');
  const skipVercel = args.has('--skip-vercel');

  const prNumber = process.env.PR_NUMBER;
  const gitBranch = process.env.GIT_BRANCH;
  const appEnv = process.env.APP_ENV ?? 'preview';
  if (!prNumber) usageError('PR_NUMBER is required.');
  if (!gitBranch && !skipVercel) {
    usageError('GIT_BRANCH is required (scopes the Vercel DATABASE_URL to this PR branch).');
  }

  let name;
  try {
    assertPreviewEnv(appEnv);
    name = previewBranchName(prNumber);
  } catch (error) {
    console.error(`preview-setup failed: ${error.message}`);
    process.exit(1);
  }

  let env;
  try {
    env = loadPreviewEnv({ needVercel: !skipVercel });
  } catch (error) {
    if (!dryRun) {
      console.error(`preview-setup failed: ${error.message}`);
      process.exit(1);
    }
    // Dry-run plans stay useful without secrets; live steps require them.
    env = {
      neonApiKey: '(unset)',
      neonProjectId: process.env.NEON_PROJECT_ID ?? '(unset)',
      stagingBranchId: process.env.NEON_STAGING_BRANCH_ID ?? '(unset)',
      productionBranchId: process.env.NEON_PRODUCTION_BRANCH_ID ?? null,
      databaseName: process.env.NEON_DATABASE_NAME ?? 'neondb',
      roleName: process.env.NEON_ROLE_NAME ?? 'neondb_owner',
      ttlHours: Number(process.env.PREVIEW_BRANCH_TTL_HOURS ?? 72),
      vercelToken: '(unset)',
      vercelProjectId: process.env.VERCEL_PROJECT_ID ?? '(unset)',
      vercelTeamId: process.env.VERCEL_TEAM_ID ?? null,
    };
  }
  // Fast-fail on the configured parent before any network call; the parent
  // is re-verified against the live branch list in step 1 below.
  try {
    assertStagingParent({
      parentBranchId: env.stagingBranchId === '(unset)' ? null : env.stagingBranchId,
      parentName: process.env.NEON_STAGING_BRANCH_NAME ?? 'staging',
      productionBranchId: env.productionBranchId,
    });
  } catch (error) {
    console.error(`preview-setup failed: ${error.message}`);
    process.exit(1);
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
        vercelDeploymentId: process.env.VERCEL_DEPLOYMENT_ID ?? null,
      })
    );
    console.log(
      `[preview-setup] Dry run: would ensure Neon branch ${JSON.stringify(name)} ` +
        `as a child of staging (${env.stagingBranchId}), migrate + synthetic-seed it, ` +
        `and scope DATABASE_URL to Vercel git branch ${JSON.stringify(gitBranch)}.`
    );
    return;
  }

  // 1. Find-or-create the preview branch (idempotent; no half-success).
  let branch = null;
  let created = false;
  try {
    const branches = await listNeonBranches({
      apiKey: env.neonApiKey,
      projectId: env.neonProjectId,
    });
    // Verify the staging parent against the live list: the configured id
    // must exist and must not be (or look like) Production. This catches a
    // misconfigured NEON_STAGING_BRANCH_ID even when NEON_PRODUCTION_BRANCH_ID
    // is unset.
    resolveStagingBranch(branches, env.stagingBranchId, env.productionBranchId);
    branch = findBranchByName(branches, name);
    if (branch) {
      log(
        correlationRecord({
          action: 'branch-reused',
          prNumber,
          gitBranch,
          neonBranchId: branch.id,
          neonBranchName: name,
          databaseHost: null,
          vercelDeploymentId: process.env.VERCEL_DEPLOYMENT_ID ?? null,
        })
      );
    } else {
      branch = await createNeonBranch({
        apiKey: env.neonApiKey,
        projectId: env.neonProjectId,
        name,
        parentId: env.stagingBranchId,
      });
      created = true;
      log(
        correlationRecord({
          action: 'branch-created',
          prNumber,
          gitBranch,
          neonBranchId: branch.id,
          neonBranchName: name,
          databaseHost: null,
          vercelDeploymentId: process.env.VERCEL_DEPLOYMENT_ID ?? null,
        })
      );
    }
    branch = await waitForBranchReady({
      apiKey: env.neonApiKey,
      projectId: env.neonProjectId,
      branchId: branch.id,
    });
  } catch (error) {
    console.error(`preview-setup failed: branch step: ${error.message}`);
    console.error('preview-setup: retry is safe — re-run the workflow for the same PR.');
    process.exit(1);
  }

  // 2. Resolve the branch connection string (secret — never logged).
  let databaseUrl;
  try {
    databaseUrl = await getBranchConnectionUri({
      apiKey: env.neonApiKey,
      projectId: env.neonProjectId,
      branchId: branch.id,
      databaseName: env.databaseName,
      roleName: env.roleName,
      pooled: true,
    });
    assertNoProductionUrl(databaseUrl);
  } catch (error) {
    console.error(`preview-setup failed: connection-string step: ${error.message}`);
    if (created) {
      console.error(
        '[preview-setup] Cleaning up the just-created branch so a retry starts clean ...'
      );
      await deleteNeonBranch({
        apiKey: env.neonApiKey,
        projectId: env.neonProjectId,
        branchId: branch.id,
      }).catch(() => {});
    }
    process.exit(1);
  }
  const databaseHost = redactUrl(databaseUrl);

  // 3. Migrate + synthetic seed. On failure the branch is left in place for
  // inspection but the run FAILS loudly (no silent half-success).
  try {
    runMigrateAndSeed({ databaseUrl, skipMigrate });
  } catch {
    console.error(
      'preview-setup failed: migrate/seed step failed (see output above). ' +
        'The branch is left in place for inspection; fix forward and re-run — ' +
        'Drizzle migrate is idempotent so a retry is safe.'
    );
    process.exit(1);
  }

  // 4. Wire DATABASE_URL into the PR preview only (branch-scoped Vercel env).
  let vercelEnvId = null;
  if (!skipVercel) {
    try {
      vercelEnvId = await upsertVercelBranchEnv({
        token: env.vercelToken,
        projectId: env.vercelProjectId,
        teamId: env.vercelTeamId,
        gitBranch,
        value: databaseUrl,
      });
    } catch (error) {
      console.error(`preview-setup failed: vercel wiring step: ${error.message}`);
      console.error(
        'preview-setup: the Neon branch is migrated and seeded, but the preview ' +
          'is NOT wired. Re-run to retry wiring (branch will be reused).'
      );
      process.exit(1);
    }
  }

  const record = correlationRecord({
    action: 'ready',
    prNumber,
    gitBranch,
    neonBranchId: branch.id,
    neonBranchName: name,
    databaseHost,
    vercelDeploymentId: process.env.VERCEL_DEPLOYMENT_ID ?? null,
  });
  log(record);
  console.log(
    `[preview-setup] Ready: PR #${prNumber} → Neon branch ${JSON.stringify(name)} ` +
      `(host ${databaseHost}). Preview deployments on git branch ${JSON.stringify(gitBranch)} ` +
      `receive only this branch's DATABASE_URL; production credentials are unreachable from Preview.`
  );

  // GitHub Actions outputs (consumed by the workflow summary / later steps).
  const outFile = process.env.GITHUB_OUTPUT;
  if (outFile) {
    const fs = await import('node:fs');
    fs.appendFileSync(
      outFile,
      `neon_branch_id=${branch.id}\nneon_branch_name=${name}\ndatabase_host=${databaseHost}\nvercel_env_id=${vercelEnvId ?? ''}\n`
    );
  }
}

main();
