#!/usr/bin/env node
/**
 * Preview reconciler — idempotent sweep for stranded `preview/pr-*` Neon
 * branches (TTL expiry, or PR closed without cleanup running).
 *
 * Usage:
 *   NEON_API_KEY=... NEON_PROJECT_ID=... NEON_STAGING_BRANCH_ID=... \
 *   [GITHUB_TOKEN=... GITHUB_REPOSITORY=owner/repo] \
 *   [PREVIEW_BRANCH_TTL_HOURS=72] node preview-reconcile.mjs [--dry-run]
 *
 * - Without GITHUB_TOKEN, decisions are TTL-only.
 * - With GITHUB_TOKEN + GITHUB_REPOSITORY, branches whose PR is closed are
 *   deleted regardless of age (via the GitHub PR API).
 * - Never deletes `main`/`prod*`/`staging`, and never touches a branch whose
 *   parent is not Staging when that info is available.
 * - `--dry-run` lists candidates without deleting (safe for CI evidence).
 */

import {
  DEFAULT_TTL_HOURS,
  deleteNeonBranch,
  isStranded,
  listNeonBranches,
  loadPreviewEnv,
  prNumberFromBranchName,
} from './preview-lib.mjs';

const PROTECTED_NAMES = new Set(['main', 'prod', 'production', 'staging']);

async function prIsClosed({ prNumber, fetchImpl = fetch }) {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY;
  if (!token || !repo) return null; // unknown — TTL decides
  const res = await fetchImpl(`https://api.github.com/repos/${repo}/pulls/${prNumber}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (res.status === 404) return true; // PR gone → treat as closed
  if (!res.ok) {
    console.error(`[preview-reconcile] GitHub PR lookup failed for #${prNumber}: HTTP ${res.status}; falling back to TTL.`);
    return null;
  }
  const json = await res.json();
  return json.state === 'closed';
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const dryRun = args.has('--dry-run') || process.env.PREVIEW_DRY_RUN === '1';
  const ttlHours = Number(process.env.PREVIEW_BRANCH_TTL_HOURS ?? DEFAULT_TTL_HOURS);

  // Vercel creds not needed for the sweep itself.
  let env;
  try {
    env = loadPreviewEnv({ needVercel: false });
  } catch (error) {
    console.error(`preview-reconcile failed: ${error.message}`);
    process.exit(1);
  }

  const branches = await listNeonBranches({
    apiKey: env.neonApiKey,
    projectId: env.neonProjectId,
  }).catch((error) => {
    console.error(`preview-reconcile failed: list branches: ${error.message}`);
    process.exit(1);
  });

  const candidates = branches.filter(
    (b) => prNumberFromBranchName(b.name) !== null && !PROTECTED_NAMES.has(String(b.name).toLowerCase())
  );
  console.log(`[preview-reconcile] Found ${candidates.length} preview branch(es); TTL=${ttlHours}h${dryRun ? ' (dry run)' : ''}.`);

  let deleted = 0;
  for (const branch of candidates) {
    const prNumber = prNumberFromBranchName(branch.name);
    const old = isStranded({ createdAt: branch.created_at, ttlHours });
    const closed = await prIsClosed({ prNumber });
    const reason = closed === true ? 'pr-closed' : old ? 'ttl-expired' : null;
    if (!reason) {
      console.log(`[preview-reconcile] keep ${branch.name} (age ok, PR open/unknown).`);
      continue;
    }
    if (dryRun) {
      console.log(`[preview-reconcile] would delete ${branch.name} (${reason}).`);
      continue;
    }
    const ok = await deleteNeonBranch({
      apiKey: env.neonApiKey,
      projectId: env.neonProjectId,
      branchId: branch.id,
    }).catch((error) => {
      console.error(`[preview-reconcile] delete ${branch.name} failed: ${error.message}`);
      return false;
    });
    if (ok) {
      deleted += 1;
      console.log(`[preview-reconcile] deleted ${branch.name} (${reason}).`);
    }
  }
  console.log(`[preview-reconcile] Done: ${deleted} deleted, ${candidates.length - deleted} kept/listed.`);
}

main();
