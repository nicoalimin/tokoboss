import { timingSafeEqual } from 'node:crypto';

/** Server-only guard for bootstrap and workspace-management endpoints. */
export function hasValidBootstrapPassword(request: Request): boolean {
  const configured = process.env['AUTH_BOOTSTRAP_PASSWORD'];
  const supplied = request.headers.get('x-bootstrap-password');
  if (!configured || !supplied) return false;
  const expected = Buffer.from(configured);
  const actual = Buffer.from(supplied);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
