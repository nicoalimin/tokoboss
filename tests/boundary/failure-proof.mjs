/**
 * Failure-mode proof (UTA-12 acceptance criterion: "CI blocks a deliberately
 * failing boundary/type/test check").
 *
 * This script itself PASSES only when the boundary checker correctly:
 *  1. FAILS (exit 1) on `fixtures/bad` (contains a forbidden `next` import).
 *  2. PASSES (exit 0) on `fixtures/good` (clean) and on the real domain layer.
 *
 * If someone weakens the checker, this proof fails and CI goes red — proving
 * the gate still bites. Type/test failure modes need no extra harness: they
 * fail CI inherently (`tsc --noEmit`, `vitest run`), which this CI workflow
 * also demonstrates via the `gate-proof` job's deliberately-broken `tsc`
 * fixture (see .github/workflows/ci.yml).
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CHECKER = path.join(__dirname, 'check-boundaries.js');

function runChecker(targetPath) {
  try {
    execFileSync(process.execPath, [CHECKER, '--path', targetPath], {
      stdio: 'pipe',
    });
    return 0;
  } catch (err) {
    return typeof err.status === 'number' ? err.status : 1;
  }
}

function main() {
  let ok = true;

  const bad = path.join(__dirname, 'fixtures/bad');
  const badExit = runChecker(bad);
  if (badExit !== 1) {
    console.error(
      `❌ gate-proof: checker exited ${badExit} on fixtures/bad, expected 1 (violation NOT detected!)`
    );
    ok = false;
  } else {
    console.log('✅ gate-proof: checker correctly FAILS on fixtures/bad');
  }

  const good = path.join(__dirname, 'fixtures/good');
  const goodExit = runChecker(good);
  if (goodExit !== 0) {
    console.error(
      `❌ gate-proof: checker exited ${goodExit} on fixtures/good, expected 0 (false positive!)`
    );
    ok = false;
  } else {
    console.log('✅ gate-proof: checker correctly PASSES on fixtures/good');
  }

  const domain = path.join(__dirname, '../../packages/domain/src');
  const domainExit = runChecker(domain);
  if (domainExit !== 0) {
    console.error(
      `❌ gate-proof: checker exited ${domainExit} on the real domain layer, expected 0`
    );
    ok = false;
  } else {
    console.log(
      '✅ gate-proof: checker correctly PASSES on packages/domain/src'
    );
  }

  if (!ok) {
    console.error(
      '\n❌ gate-proof FAILED: boundary gate failure mode is broken'
    );
    process.exit(1);
  }
  console.log(
    '\n✅ gate-proof passed: boundary gate fails closed on violations'
  );
}

main();
