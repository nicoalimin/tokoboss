/**
 * UTA-12 negative controls: prove the baseline gates actually block.
 *
 * For each gate (boundary / typecheck / unit test) this script:
 *  1. injects a deliberately broken fixture into the working tree,
 *  2. runs the real gate command,
 *  3. asserts the gate FAILS (non-zero exit),
 *  4. removes the fixture.
 *
 * If any gate passes on a broken fixture, this script exits non-zero and CI
 * goes red — i.e. CI fails the workflow on deliberately broken checks.
 * Always restores a clean tree via finally blocks.
 *
 * Usage: node infra/observability/ci-failure-proof.mjs
 */
import { execSync } from 'node:child_process';
import { rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '../..');

function run(cmd, opts = {}) {
  try {
    execSync(cmd, { cwd: ROOT, stdio: 'pipe', encoding: 'utf8', ...opts });
    return 0;
  } catch (err) {
    return err.status ?? 1;
  }
}

function trackedWrite(relPath, content, created) {
  const abs = path.join(ROOT, relPath);
  writeFileSync(abs, content);
  created.push(abs);
}

function cleanup(created) {
  for (const abs of created) {
    try {
      rmSync(abs, { force: true });
    } catch {
      // best effort
    }
  }
}

let failures = 0;
const created = [];
try {
  // 1. Boundary gate must reject a framework import in the domain layer.
  trackedWrite(
    'packages/domain/src/__ci-proof-violation.ts',
    `// CI failure-proof fixture (deleted after the check).\nimport type { NextPage } from 'next';\nexport const ProofViolation: NextPage | null = null;\n`,
    created
  );
  const boundaryCode = run('pnpm test:boundaries');
  if (boundaryCode === 0) {
    console.error(
      'FAIL: boundary gate PASSED on a forbidden `next` import in domain'
    );
    failures += 1;
  } else {
    console.log('ok: boundary gate blocked the forbidden domain import');
  }

  // 2. Typecheck gate must reject a type error.
  trackedWrite(
    'packages/observability/src/__ci-proof-violation.ts',
    `// CI failure-proof fixture (deleted after the check).\nexport const proofViolation: number = 'deliberately-wrong-type';\n`,
    created
  );
  const typeCode = run('pnpm --filter @tokoboss/observability typecheck');
  if (typeCode === 0) {
    console.error('FAIL: typecheck gate PASSED on a deliberate type error');
    failures += 1;
  } else {
    console.log('ok: typecheck gate blocked the deliberate type error');
  }

  // 3. Unit-test gate must reject a failing assertion.
  trackedWrite(
    'packages/observability/src/__tests__/ci-proof-failing.test.ts',
    `// CI failure-proof fixture (deleted after the check).\nimport { expect, it } from 'vitest';\nit('deliberately fails', () => {\n  expect('ci-proof').toBe('green');\n});\n`,
    created
  );
  const testCode = run('pnpm --filter @tokoboss/observability test');
  if (testCode === 0) {
    console.error('FAIL: unit-test gate PASSED on a deliberately failing test');
    failures += 1;
  } else {
    console.log('ok: unit-test gate blocked the deliberately failing test');
  }
} finally {
  cleanup(created);
}

if (failures > 0) {
  console.error(`ci-failure-proof FAILED: ${failures} gate(s) did not block`);
  process.exit(1);
}
console.log(
  'ci-failure-proof OK: boundary/type/test gates all block broken fixtures'
);
