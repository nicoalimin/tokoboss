/**
 * Unit tests for preview-lib.mjs (UTA-11). Run with:
 *   node --test preview-lib.test.mjs
 * or via workspace: pnpm --filter @tokoboss/neon-preview test
 *
 * No network access: API helpers are exercised with a stubbed fetch.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  assertNoProductionUrl,
  assertPreviewEnv,
  assertStagingParent,
  correlationRecord,
  createNeonBranch,
  deleteNeonBranch,
  deleteVercelBranchEnv,
  findBranchByName,
  getBranchConnectionUri,
  isStranded,
  listNeonBranches,
  previewBranchName,
  prNumberFromBranchName,
  redactUrl,
  resolveStagingBranch,
  upsertVercelBranchEnv,
  vercelEnvCreatePayload,
  waitForBranchReady,
} from './preview-lib.mjs';

describe('naming', () => {
  it('builds stable branch names per PR', () => {
    assert.equal(previewBranchName(123), 'preview/pr-123');
    assert.equal(previewBranchName('7'), 'preview/pr-7');
  });
  it('rejects invalid PR numbers', () => {
    for (const bad of [0, -1, 1.5, 'abc', null, undefined, '']) {
      assert.throws(() => previewBranchName(bad), /Invalid PR number/);
    }
  });
  it('round-trips PR numbers', () => {
    assert.equal(prNumberFromBranchName('preview/pr-42'), 42);
    assert.equal(prNumberFromBranchName('main'), null);
    assert.equal(prNumberFromBranchName('preview/pr-abc'), null);
    assert.equal(prNumberFromBranchName(null), null);
  });
});

describe('staging-parent guard', () => {
  it('accepts a dedicated staging parent', () => {
    assert.doesNotThrow(() =>
      assertStagingParent({
        parentBranchId: 'br-staging-1',
        parentName: 'staging',
        productionBranchId: 'br-prod-1',
      })
    );
  });
  it('refuses a missing parent', () => {
    assert.throws(() => assertStagingParent({}), /Missing staging parent/);
  });
  it('refuses parent == production branch id', () => {
    assert.throws(
      () =>
        assertStagingParent({
          parentBranchId: 'br-prod-1',
          parentName: 'staging',
          productionBranchId: 'br-prod-1',
        }),
      /never Production/
    );
  });
  it('refuses production-looking parent names', () => {
    for (const name of ['main', 'prod', 'production', 'MAIN']) {
      assert.throws(
        () => assertStagingParent({ parentBranchId: 'br-x', parentName: name }),
        /looks like Production/
      );
    }
  });
  it('resolveStagingBranch verifies the parent against the live list', () => {
    const branches = [
      { id: 'br-prod', name: 'main' },
      { id: 'br-staging', name: 'staging' },
      { id: 'br-old', name: 'preview/pr-1' },
    ];
    const staging = resolveStagingBranch(branches, 'br-staging', 'br-prod');
    assert.equal(staging.name, 'staging');
    // Unknown id (misconfiguration) fails even without a prod id to compare.
    assert.throws(
      () => resolveStagingBranch(branches, 'br-nope', null),
      /not found in the Neon project/
    );
    // Id pointing at the production branch fails even when the caller did
    // not configure NEON_PRODUCTION_BRANCH_ID (name check catches it).
    assert.throws(
      () => resolveStagingBranch(branches, 'br-prod', null),
      /looks like Production/
    );
  });
});

describe('preview env + url guards', () => {
  it('requires APP_ENV=preview', () => {
    assert.throws(() => assertPreviewEnv('production'), /never touch Production/);
    assert.throws(() => assertPreviewEnv('staging'), /expected APP_ENV=preview/);
    assert.doesNotThrow(() => assertPreviewEnv('preview'));
  });
  it('refuses production-looking urls', () => {
    assert.throws(
      () => assertNoProductionUrl('postgresql://u:p@ep-prod-123.aws.neon.tech/db'),
      /looks like a Production/
    );
    assert.doesNotThrow(() =>
      assertNoProductionUrl('postgresql://u:p@ep-cool-123.aws.neon.tech/db')
    );
  });
});

describe('redaction + correlation', () => {
  it('redacts connection strings to hostnames', () => {
    assert.equal(
      redactUrl('postgresql://user:secret@ep-cool-123.aws.neon.tech/neondb?sslmode=require'),
      'ep-cool-123.aws.neon.tech'
    );
    assert.equal(redactUrl('not a url'), '(unparseable-url)');
  });
  it('correlation records never carry secrets', () => {
    const record = correlationRecord({
      action: 'ready',
      prNumber: 9,
      gitBranch: 'feat/x',
      neonBranchId: 'br-1',
      neonBranchName: 'preview/pr-9',
      databaseHost: 'ep-x.aws.neon.tech',
      vercelDeploymentId: 'dpl_1',
    });
    const text = JSON.stringify(record);
    assert.match(text, /preview\/pr-9/);
    assert.doesNotMatch(text, /secret|password|Bearer/);
    assert.equal(record.databaseHost, 'ep-x.aws.neon.tech');
  });
  it('two PRs get distinct branch names/hosts (isolation proof shape)', () => {
    const a = previewBranchName(101);
    const b = previewBranchName(102);
    assert.notEqual(a, b);
    assert.equal(prNumberFromBranchName(a), 101);
    assert.equal(prNumberFromBranchName(b), 102);
  });
});

describe('ttl', () => {
  it('flags branches older than the TTL', () => {
    const now = Date.parse('2026-09-14T00:00:00Z');
    const old = new Date(now - 73 * 3_600_000).toISOString();
    const fresh = new Date(now - 1 * 3_600_000).toISOString();
    assert.equal(isStranded({ createdAt: old, nowMs: now, ttlHours: 72 }), true);
    assert.equal(isStranded({ createdAt: fresh, nowMs: now, ttlHours: 72 }), false);
    assert.equal(isStranded({ createdAt: 'garbage', nowMs: now }), false);
  });
});

describe('vercel payload', () => {
  it('scopes DATABASE_URL to preview target + git branch', () => {
    const payload = vercelEnvCreatePayload({ value: 'SECRET', gitBranch: 'feat/x' });
    assert.deepEqual(payload.target, ['preview']);
    assert.equal(payload.gitBranch, 'feat/x');
    assert.equal(payload.key, 'DATABASE_URL');
  });
  it('requires a git branch', () => {
    assert.throws(() => vercelEnvCreatePayload({ value: 'x', gitBranch: '' }), /git branch/);
  });
});

// --- stubbed-fetch API tests ------------------------------------------------

function stubFetch(routes) {
  const calls = [];
  const impl = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method ?? 'GET', body: init.body });
    const key = `${init.method ?? 'GET'} ${String(url).split('?')[0]}`;
    const handler = routes[key];
    if (!handler) {
      return { ok: false, status: 404, statusText: 'Not Found', text: async () => 'no route', json: async () => ({}) };
    }
    return handler({ url: String(url), init, calls });
  };
  return { impl, calls };
}

const okJson = (json, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  statusText: 'OK',
  text: async () => JSON.stringify(json),
  json: async () => json,
});

describe('neon api helpers (stubbed)', () => {
  it('find-or-create flow: lists, creates, waits, resolves uri', async () => {
    const { impl, calls } = stubFetch({
      'GET https://console.neon.tech/api/v2/projects/p1/branches': () =>
        okJson({ branches: [{ id: 'br-staging', name: 'staging' }] }),
      'POST https://console.neon.tech/api/v2/projects/p1/branches': ({ calls: c }) => {
        const body = JSON.parse(c.at(-1).body);
        assert.equal(body.branch.name, 'preview/pr-5');
        assert.equal(body.branch.parent_id, 'br-staging');
        return okJson({ branch: { id: 'br-new', name: 'preview/pr-5', current_state: 'creating' } });
      },
      'GET https://console.neon.tech/api/v2/projects/p1/branches/br-new': () =>
        okJson({ branch: { id: 'br-new', name: 'preview/pr-5', current_state: 'ready' } }),
      'GET https://console.neon.tech/api/v2/projects/p1/connection_uri': () =>
        okJson({ uri: 'postgresql://u:p@ep-new.aws.neon.tech/neondb?sslmode=require' }),
    });

    const branches = await listNeonBranches({ apiKey: 'k', projectId: 'p1', fetchImpl: impl });
    assert.equal(findBranchByName(branches, 'preview/pr-5'), null);
    const created = await createNeonBranch({
      apiKey: 'k', projectId: 'p1', name: 'preview/pr-5', parentId: 'br-staging', fetchImpl: impl,
    });
    assert.equal(created.id, 'br-new');
    const ready = await waitForBranchReady({
      apiKey: 'k', projectId: 'p1', branchId: 'br-new', fetchImpl: impl, sleep: async () => {},
    });
    assert.equal(ready.current_state, 'ready');
    const uri = await getBranchConnectionUri({
      apiKey: 'k', projectId: 'p1', branchId: 'br-new', fetchImpl: impl,
    });
    assert.match(uri, /ep-new/);
    assert.ok(calls.length >= 4);
  });

  it('delete is idempotent on 404', async () => {
    const { impl } = stubFetch({});
    const deleted = await deleteNeonBranch({
      apiKey: 'k', projectId: 'p1', branchId: 'br-missing', fetchImpl: impl,
    });
    assert.equal(deleted, false);
  });

  it('wait times out with a retryable error', async () => {
    const { impl } = stubFetch({
      'GET https://console.neon.tech/api/v2/projects/p1/branches/br-x': () =>
        okJson({ branch: { id: 'br-x', current_state: 'creating' } }),
    });
    await assert.rejects(
      () =>
        waitForBranchReady({
          apiKey: 'k', projectId: 'p1', branchId: 'br-x', fetchImpl: impl,
          timeoutMs: 10, intervalMs: 1, sleep: async () => {},
        }),
      /Timed out.*retry/i
    );
  });
});

describe('vercel api helpers (stubbed)', () => {
  it('upsert removes stale branch env then creates', async () => {
    const { impl, calls } = stubFetch({
      'GET https://api.vercel.com/v9/projects/prj/env': () =>
        okJson({ envs: [{ id: 'env-old', key: 'DATABASE_URL', gitBranch: 'feat/x' }] }),
      'DELETE https://api.vercel.com/v9/projects/prj/env/env-old': () => okJson({}),
      'POST https://api.vercel.com/v10/projects/prj/env': () => okJson({ created: { id: 'env-new' } }),
    });
    const id = await upsertVercelBranchEnv({
      token: 't', projectId: 'prj', teamId: null, gitBranch: 'feat/x', value: 'SECRET', fetchImpl: impl,
    });
    assert.equal(id, 'env-new');
    assert.ok(calls.some((c) => c.method === 'DELETE'));
  });

  it('delete removes only matching branch envs', async () => {
    const { impl, calls } = stubFetch({
      'GET https://api.vercel.com/v9/projects/prj/env': () =>
        okJson({
          envs: [
            { id: 'env-a', key: 'DATABASE_URL', gitBranch: 'feat/x' },
            { id: 'env-b', key: 'DATABASE_URL', gitBranch: 'other' },
            { id: 'env-c', key: 'OTHER', gitBranch: 'feat/x' },
          ],
        }),
      'DELETE https://api.vercel.com/v9/projects/prj/env/env-a': () => okJson({}),
    });
    const deleted = await deleteVercelBranchEnv({
      token: 't', projectId: 'prj', teamId: null, gitBranch: 'feat/x', fetchImpl: impl,
    });
    assert.equal(deleted, 1);
    assert.ok(!calls.some((c) => c.url.includes('env-b')));
  });
});
