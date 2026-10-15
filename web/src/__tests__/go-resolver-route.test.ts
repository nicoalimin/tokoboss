import { beforeEach, describe, expect, it } from 'vitest';
import {
  __resetAuthForTests,
  getMemberStore,
  seedFixtureCredential,
} from '../lib/auth';
import { POST as signIn } from '../app/api/auth/sign-in/route';
import { GET as go } from '../app/go/[[...path]]/route';

/**
 * US29 / RFC 02 row 67 slice b — `/go/[[...path]]` resolver branches
 * (row 59): no session → sign-in with `next`, landing workspace →
 * `/w/<id>/<path>`, several workspaces without last-used → picker.
 */

const EMAIL = 'go@resolver.test';
const PASSWORD = 'go-resolver-77!';

function goRequest(path: string, token?: string): Request {
  return new Request(`http://localhost${path}`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

async function resolve(segments: string[], search = '', token?: string) {
  const url = `/go/${segments.join('/')}${search}`;
  const res = await go(goRequest(url, token), {
    params: Promise.resolve({ path: segments }),
  });
  expect(res.status).toBe(307);
  expect(res.headers.get('cache-control')).toBe('no-store');
  const location = new URL(res.headers.get('location') ?? '');
  return `${location.pathname}${location.search}`;
}

async function accountToken(): Promise<string> {
  const res = await signIn(
    new Request('http://localhost/api/auth/sign-in', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: EMAIL,
        password: PASSWORD,
        platform: 'mobile',
      }),
    })
  );
  expect(res.status).toBe(200);
  return ((await res.json()) as { token: string }).token;
}

describe('/go/[[...path]] resolver (US29 / RFC 02 row 67b)', () => {
  let ws: string;
  let userId: string;

  beforeEach(async () => {
    __resetAuthForTests();
    ({ workspaceId: ws, userId } = await seedFixtureCredential({
      email: EMAIL,
      password: PASSWORD,
    }));
  });

  it('sends a missing or invalid session to sign-in with next=/go/<path>', async () => {
    expect(await resolve(['stok-tipis'], '?tab=1')).toBe(
      `/sign-in?next=${encodeURIComponent('/go/stok-tipis?tab=1')}`
    );
    expect(await resolve([], '', 'not-a-real-token')).toBe(
      `/sign-in?next=${encodeURIComponent('/go/dashboard')}`
    );
  });

  it('routes a single accessible workspace to /w/<id>/<path> (query kept)', async () => {
    const token = await accountToken();
    expect(await resolve(['produk', 'bundles'], '?q=tea', token)).toBe(
      `/w/${ws}/produk/bundles?q=tea`
    );
    expect(await resolve([], '', token)).toBe(`/w/${ws}/dashboard`);
    expect(await resolve(['..', 'team'], '', token)).toBe(`/w/${ws}/team`);
  });

  it('sends several workspaces without last-used to the picker, else last-used', async () => {
    const { workspaceId: other } = await seedFixtureCredential({
      email: 'other@resolver.test',
      password: 'other-resolver-88!',
    });
    const members = getMemberStore();
    await members.create({
      workspaceId: other,
      userId,
      role: 'staff',
      warehouseScope: null,
      status: 'active',
    });
    const token = await accountToken();
    expect(await resolve(['stok-tipis'], '', token)).toBe(
      `/pilih-workspace?next=${encodeURIComponent('/stok-tipis')}`
    );
    await members.touchLastActive(other, userId, new Date());
    expect(await resolve(['stok-tipis'], '', token)).toBe(
      `/w/${other}/stok-tipis`
    );
  });
});
