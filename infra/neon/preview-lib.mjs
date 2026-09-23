/**
 * Shared logic for Neon preview-branch lifecycle (UTA-11).
 *
 * Pure helpers (naming, guards, redaction, correlation) have no I/O and are
 * covered by `preview-lib.test.mjs` (`node --test`). API helpers take an
 * injectable `fetchImpl` so tests never touch the network.
 *
 * Conventions:
 * - Every preview branch is a child of **Staging**, never Production.
 * - Branch name: `preview/pr-<number>` (stable → setup is idempotent).
 * - Secrets (connection strings, API keys) must NEVER appear in logs;
 *   use `redactUrl()` / `correlationRecord()` for any output.
 */

export const NEON_API_BASE = 'https://console.neon.tech/api/v2';
export const VERCEL_API_BASE = 'https://api.vercel.com';

export const PREVIEW_BRANCH_PREFIX = 'preview/pr-';
export const DEFAULT_TTL_HOURS = 72;
export const DEFAULT_DATABASE_NAME = 'neondb';
export const DEFAULT_ROLE_NAME = 'neondb_owner';

/** `preview/pr-<n>` for a PR number. Throws on invalid input. */
export function previewBranchName(prNumber) {
  const n = Number(prNumber);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(
      `Invalid PR number ${JSON.stringify(prNumber)}: expected a positive integer.`
    );
  }
  return `${PREVIEW_BRANCH_PREFIX}${n}`;
}

/** Extract the PR number from a `preview/pr-<n>` branch name, or null. */
export function prNumberFromBranchName(name) {
  const m = /^preview\/pr-(\d+)$/.exec(String(name ?? ''));
  return m ? Number(m[1]) : null;
}

/**
 * Guard: the parent of every preview branch must be the Staging branch.
 * Refuses when the staging parent is missing, when it equals the known
 * production branch id, or when the parent name looks like production.
 */
export function assertStagingParent({
  parentBranchId,
  parentName,
  productionBranchId,
}) {
  if (!parentBranchId) {
    throw new Error(
      'Missing staging parent: set NEON_STAGING_BRANCH_ID to the Staging branch id. ' +
        'Preview branches must be children of Staging, never Production.'
    );
  }
  if (productionBranchId && parentBranchId === productionBranchId) {
    throw new Error(
      'Refusing: NEON_STAGING_BRANCH_ID equals NEON_PRODUCTION_BRANCH_ID. ' +
        'Preview branches must branch from Staging, never Production.'
    );
  }
  const lowered = String(parentName ?? '').toLowerCase();
  if (lowered === 'main' || lowered === 'prod' || lowered === 'production') {
    throw new Error(
      `Refusing: staging parent name ${JSON.stringify(parentName)} looks like Production. ` +
        'Point NEON_STAGING_BRANCH_ID at the dedicated staging branch.'
    );
  }
}

/** Guard: preview setup/seed steps must run with APP_ENV=preview (never production). */
export function assertPreviewEnv(appEnv) {
  if (appEnv === 'production') {
    throw new Error(
      'Refusing to run preview setup with APP_ENV=production. ' +
        'Preview branches use synthetic data only and must never touch Production.'
    );
  }
  if (appEnv !== 'preview') {
    throw new Error(
      `Refusing: expected APP_ENV=preview for preview setup, got ${JSON.stringify(appEnv ?? '(unset)')}.`
    );
  }
}

/** Guard: refuse any production-looking connection string in preview flows. */
export function assertNoProductionUrl(url, label = 'DATABASE_URL') {
  const lowered = String(url ?? '').toLowerCase();
  if (!lowered) return;
  if (lowered.includes('prod')) {
    throw new Error(
      `Refusing: ${label} looks like a Production database. ` +
        'Preview flows must only use per-PR branch URLs.'
    );
  }
}

/** Host-only redaction for logs: `postgresql://user:***@endpoint/db?...` → `<endpoint>`. */
export function redactUrl(url) {
  try {
    const parsed = new URL(String(url));
    return parsed.hostname || '(unparseable-url)';
  } catch {
    return '(unparseable-url)';
  }
}

/**
 * Safe correlation record for logs/artifacts: deployment/PR ↔ Neon branch.
 * Never includes connection strings or API keys.
 */
export function correlationRecord({
  prNumber,
  gitBranch,
  neonBranchId,
  neonBranchName,
  databaseHost,
  vercelDeploymentId,
  action,
}) {
  return {
    action,
    prNumber: Number(prNumber),
    gitBranch: gitBranch ?? null,
    neonBranchId: neonBranchId ?? null,
    neonBranchName: neonBranchName ?? null,
    databaseHost: databaseHost ?? null,
    vercelDeploymentId: vercelDeploymentId ?? null,
    at: new Date().toISOString(),
  };
}

/** True when a preview branch is older than the TTL (eligible for reconcile-delete). */
export function isStranded({
  createdAt,
  nowMs = Date.now(),
  ttlHours = DEFAULT_TTL_HOURS,
}) {
  const created = new Date(createdAt).getTime();
  if (Number.isNaN(created)) return false;
  return nowMs - created > ttlHours * 3_600_000;
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable ${name}.`);
  return value;
}

/** Env wiring for setup/cleanup. `needVercel=false` skips Vercel credential checks. */
export function loadPreviewEnv({ needVercel = true } = {}) {
  const env = {
    neonApiKey: requireEnv('NEON_API_KEY'),
    neonProjectId: requireEnv('NEON_PROJECT_ID'),
    stagingBranchId: requireEnv('NEON_STAGING_BRANCH_ID'),
    productionBranchId: process.env.NEON_PRODUCTION_BRANCH_ID ?? null,
    databaseName: process.env.NEON_DATABASE_NAME ?? DEFAULT_DATABASE_NAME,
    roleName: process.env.NEON_ROLE_NAME ?? DEFAULT_ROLE_NAME,
    ttlHours: Number(process.env.PREVIEW_BRANCH_TTL_HOURS ?? DEFAULT_TTL_HOURS),
  };
  if (needVercel) {
    env.vercelToken = requireEnv('VERCEL_TOKEN');
    env.vercelProjectId = requireEnv('VERCEL_PROJECT_ID');
    env.vercelTeamId = process.env.VERCEL_TEAM_ID ?? null;
  }
  return env;
}

// ---------------------------------------------------------------------------
// Neon API helpers (fetchImpl injectable for tests)
// ---------------------------------------------------------------------------

function neonHeaders(apiKey) {
  return {
    Authorization: `Bearer ${apiKey}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
}

async function throwOnError(res, context) {
  if (res.ok) return res;
  const body = await res.text().catch(() => '');
  throw new Error(
    `${context} failed: HTTP ${res.status} ${res.statusText}${body ? ` — ${body.slice(0, 500)}` : ''}`
  );
}

export async function listNeonBranches({
  apiKey,
  projectId,
  fetchImpl = fetch,
}) {
  const res = await fetchImpl(
    `${NEON_API_BASE}/projects/${encodeURIComponent(projectId)}/branches`,
    { headers: neonHeaders(apiKey) }
  );
  await throwOnError(res, 'List Neon branches');
  const json = await res.json();
  return json.branches ?? [];
}

export function findBranchByName(branches, name) {
  return (branches ?? []).find((b) => b.name === name) ?? null;
}

/**
 * Resolve the configured staging parent against the live branch list.
 * Fails when the id is absent from the project (misconfiguration) or when
 * the branch it points at is not a safe preview parent.
 * Returns the staging branch object.
 */
export function resolveStagingBranch(
  branches,
  stagingBranchId,
  productionBranchId
) {
  const staging =
    (branches ?? []).find((b) => b.id === stagingBranchId) ?? null;
  if (!staging) {
    throw new Error(
      `NEON_STAGING_BRANCH_ID ${JSON.stringify(stagingBranchId)} was not found ` +
        'in the Neon project. Refusing to create a preview branch from an unknown parent.'
    );
  }
  assertStagingParent({
    parentBranchId: staging.id,
    parentName: staging.name,
    productionBranchId,
  });
  return staging;
}

export async function createNeonBranch({
  apiKey,
  projectId,
  name,
  parentId,
  fetchImpl = fetch,
}) {
  const res = await fetchImpl(
    `${NEON_API_BASE}/projects/${encodeURIComponent(projectId)}/branches`,
    {
      method: 'POST',
      headers: neonHeaders(apiKey),
      body: JSON.stringify({
        branch: { name, parent_id: parentId },
        endpoints: [{ type: 'read_write' }],
      }),
    }
  );
  await throwOnError(res, `Create Neon branch ${JSON.stringify(name)}`);
  const json = await res.json();
  return json.branch;
}

/** Poll until the branch reports ready (or timeout). Returns the branch. */
export async function waitForBranchReady({
  apiKey,
  projectId,
  branchId,
  fetchImpl = fetch,
  timeoutMs = 120_000,
  intervalMs = 3_000,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
}) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const res = await fetchImpl(
      `${NEON_API_BASE}/projects/${encodeURIComponent(projectId)}/branches/${encodeURIComponent(branchId)}`,
      { headers: neonHeaders(apiKey) }
    );
    await throwOnError(res, 'Poll Neon branch');
    const json = await res.json();
    const branch = json.branch ?? json;
    const state = branch.current_state ?? branch.state;
    if (state === 'ready') return branch;
    if (Date.now() > deadline) {
      throw new Error(
        `Timed out waiting for Neon branch ${branchId} to become ready (last state: ${state ?? 'unknown'}). ` +
          'Retry the workflow; setup is idempotent.'
      );
    }
    await sleep(intervalMs);
  }
}

export async function deleteNeonBranch({
  apiKey,
  projectId,
  branchId,
  fetchImpl = fetch,
}) {
  const res = await fetchImpl(
    `${NEON_API_BASE}/projects/${encodeURIComponent(projectId)}/branches/${encodeURIComponent(branchId)}`,
    { method: 'DELETE', headers: neonHeaders(apiKey) }
  );
  if (res.status === 404) return false;
  await throwOnError(res, `Delete Neon branch ${branchId}`);
  return true;
}

/** Fetch a pooled (or direct) connection URI for a branch. Secret — never log. */
export async function getBranchConnectionUri({
  apiKey,
  projectId,
  branchId,
  databaseName = DEFAULT_DATABASE_NAME,
  roleName = DEFAULT_ROLE_NAME,
  pooled = true,
  fetchImpl = fetch,
}) {
  const params = new URLSearchParams({
    branch_id: branchId,
    database_name: databaseName,
    role_name: roleName,
    pooled: String(pooled),
  });
  const res = await fetchImpl(
    `${NEON_API_BASE}/projects/${encodeURIComponent(projectId)}/connection_uri?${params}`,
    { headers: neonHeaders(apiKey) }
  );
  await throwOnError(res, 'Fetch branch connection URI');
  const json = await res.json();
  const uri = json.uri ?? json.connection_uri;
  if (!uri) throw new Error('Neon API did not return a connection URI.');
  return uri;
}

// ---------------------------------------------------------------------------
// Vercel API helpers — per-PR-branch DATABASE_URL wiring
// ---------------------------------------------------------------------------
//
// Vercel "Preview" env vars are shared by all previews, so a single
// DATABASE_URL for target=preview would leak one PR's database to every
// other PR. We instead scope the variable to the PR's git branch
// (`gitBranch`), giving each preview deployment only its own branch URL.
// Production/Staging credentials are never written here.

export function vercelEnvCreatePayload({ value, gitBranch }) {
  if (!gitBranch) {
    throw new Error('Missing git branch for branch-scoped preview env.');
  }
  return {
    key: 'DATABASE_URL',
    value,
    type: 'encrypted',
    target: ['preview'],
    gitBranch,
  };
}

function vercelHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

function vercelQuery(teamId) {
  return teamId ? `?teamId=${encodeURIComponent(teamId)}` : '';
}

export async function listVercelEnvs({
  token,
  projectId,
  teamId,
  fetchImpl = fetch,
}) {
  const res = await fetchImpl(
    `${VERCEL_API_BASE}/v9/projects/${encodeURIComponent(projectId)}/env${vercelQuery(teamId)}`,
    { headers: vercelHeaders(token) }
  );
  await throwOnError(res, 'List Vercel env vars');
  const json = await res.json();
  return json.envs ?? [];
}

/**
 * Upsert a branch-scoped DATABASE_URL for a PR. Removes any stale value for
 * the same branch first, then creates the new one. Returns the created env id.
 */
export async function upsertVercelBranchEnv({
  token,
  projectId,
  teamId,
  gitBranch,
  value,
  fetchImpl = fetch,
}) {
  const existing = await listVercelEnvs({
    token,
    projectId,
    teamId,
    fetchImpl,
  });
  const stale = existing.filter(
    (e) =>
      e.key === 'DATABASE_URL' && (e.gitBranch ?? e.git_branch) === gitBranch
  );
  for (const env of stale) {
    const id = env.id ?? env.uid;
    if (!id) continue;
    const res = await fetchImpl(
      `${VERCEL_API_BASE}/v9/projects/${encodeURIComponent(projectId)}/env/${encodeURIComponent(id)}${vercelQuery(teamId)}`,
      { method: 'DELETE', headers: vercelHeaders(token) }
    );
    await throwOnError(res, 'Remove stale branch DATABASE_URL');
  }
  const res = await fetchImpl(
    `${VERCEL_API_BASE}/v10/projects/${encodeURIComponent(projectId)}/env${vercelQuery(teamId)}`,
    {
      method: 'POST',
      headers: vercelHeaders(token),
      body: JSON.stringify(vercelEnvCreatePayload({ value, gitBranch })),
    }
  );
  await throwOnError(res, 'Set branch DATABASE_URL');
  const json = await res.json();
  return (json.created ?? json).id ?? null;
}

/** Delete the branch-scoped DATABASE_URL for a PR head branch. Idempotent. */
export async function deleteVercelBranchEnv({
  token,
  projectId,
  teamId,
  gitBranch,
  fetchImpl = fetch,
}) {
  const existing = await listVercelEnvs({
    token,
    projectId,
    teamId,
    fetchImpl,
  });
  const targets = existing.filter(
    (e) =>
      e.key === 'DATABASE_URL' && (e.gitBranch ?? e.git_branch) === gitBranch
  );
  let deleted = 0;
  for (const env of targets) {
    const id = env.id ?? env.uid;
    if (!id) continue;
    const res = await fetchImpl(
      `${VERCEL_API_BASE}/v9/projects/${encodeURIComponent(projectId)}/env/${encodeURIComponent(id)}${vercelQuery(teamId)}`,
      { method: 'DELETE', headers: vercelHeaders(token) }
    );
    if (res.status === 404) continue;
    await throwOnError(res, 'Delete branch DATABASE_URL');
    deleted += 1;
  }
  return deleted;
}
