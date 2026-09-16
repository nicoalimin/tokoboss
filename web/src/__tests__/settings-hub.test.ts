import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SETTINGS_ROWS,
  getSettingsCopy,
  rowCopy,
  settingsCopyKeys,
} from '../lib/settings-copy';
import {
  CAPABILITY_KEYS,
  MATRIX_ROLES,
  PERMISSION_MATRIX,
  accessLabel,
  canManageTeam,
  canViewBilling,
  capabilityLabel,
  matrixAccess,
  roleCardTones,
} from '../lib/role-matrix';
import { TeamClientError, getMyMembership } from '../lib/team-client';
import { __resetAuthForTests, seedFixtureCredential } from '../lib/auth';
import { __resetMembershipForTests } from '../lib/membership';
import { POST as signIn } from '../app/api/auth/sign-in/route';
import { GET as getMembership } from '../app/api/auth/membership/route';
import { POST as createInvite } from '../app/api/workspaces/[workspaceId]/invites/route';
import { POST as acceptInvite } from '../app/api/invites/accept/route';

/**
 * Settings hub + role-gated shell (UTA-74, Story 23): hub rows, role cards
 * + permission matrix model, self-membership client, and the self-membership
 * route through the memory wiring.
 */

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function stubFetch(
  impl: (url: string, init?: RequestInit) => Promise<Response>
) {
  return vi.fn(impl) as unknown as typeof fetch & {
    mock: { calls: Array<[string, RequestInit?]> };
  };
}

function apiRequest(
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
  method = 'POST'
): Request {
  return new Request(`http://localhost${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...headers,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

describe('settings hub rows (UTA-74)', () => {
  it('exposes seven rows with Profil + Tim & Akses live', () => {
    expect(SETTINGS_ROWS.map((r) => r.slug)).toEqual([
      'profil',
      'tim',
      'gudang',
      'integrasi',
      'bahasa',
      'notifikasi',
      'tagihan',
    ]);
    const live = SETTINGS_ROWS.filter((r) => r.live).map((r) => r.slug);
    expect(live).toEqual(['profil', 'tim']);
    expect(SETTINGS_ROWS.find((r) => r.slug === 'profil')?.href).toBe(
      '/profil'
    );
    expect(SETTINGS_ROWS.find((r) => r.slug === 'tim')?.href).toBe('/team');
  });

  it('routes stub rows under /pengaturan with honest coming states', () => {
    for (const slug of [
      'gudang',
      'integrasi',
      'bahasa',
      'notifikasi',
      'tagihan',
    ] as const) {
      const row = SETTINGS_ROWS.find((r) => r.slug === slug);
      expect(row?.live).toBe(false);
      expect(row?.href).toBe(`/pengaturan/${slug}`);
    }
    expect(SETTINGS_ROWS.find((r) => r.slug === 'tim')?.adminOnly).toBe(true);
    expect(SETTINGS_ROWS.find((r) => r.slug === 'tagihan')?.adminOnly).toBe(
      true
    );
    expect(SETTINGS_ROWS.find((r) => r.slug === 'profil')?.adminOnly).toBe(
      false
    );
  });

  it('row labels match the mockup entry names in both locales', () => {
    for (const lang of ['en', 'id'] as const) {
      const copy = getSettingsCopy(lang);
      expect(rowCopy(copy, 'profil').label).toBe('Profil');
      expect(rowCopy(copy, 'tim').label).toBe('Tim & Akses');
      expect(rowCopy(copy, 'gudang').label).toBe('Gudang');
      expect(rowCopy(copy, 'integrasi').label).toBe('Integrasi');
      expect(rowCopy(copy, 'bahasa').label).toBe('Bahasa');
      expect(rowCopy(copy, 'notifikasi').label).toBe('Notifikasi');
      expect(rowCopy(copy, 'tagihan').label).toContain('Tagihan');
      for (const row of SETTINGS_ROWS) {
        const { label, hint } = rowCopy(copy, row.slug);
        expect(label.length).toBeGreaterThan(0);
        expect(hint.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('permission matrix (UTA-74)', () => {
  it('covers the seven Story 23 capability areas × three roles', () => {
    expect(CAPABILITY_KEYS).toEqual([
      'dashboard',
      'products',
      'orders',
      'purchasing',
      'integrations',
      'team',
      'billing',
    ]);
    expect(MATRIX_ROLES).toEqual(['admin', 'manager', 'staff']);
    for (const cap of CAPABILITY_KEYS) {
      for (const role of MATRIX_ROLES) {
        expect(matrixAccess(cap, role)).toBe(PERMISSION_MATRIX[cap][role]);
      }
    }
  });

  it('grants Admin full everywhere; team/RBAC and billing stay Admin-only', () => {
    for (const cap of CAPABILITY_KEYS) {
      expect(matrixAccess(cap, 'admin')).toBe('full');
    }
    for (const cap of ['team', 'billing'] as const) {
      expect(matrixAccess(cap, 'manager')).toBe('none');
      expect(matrixAccess(cap, 'staff')).toBe('none');
    }
    expect(canManageTeam('admin')).toBe(true);
    expect(canManageTeam('manager')).toBe(false);
    expect(canManageTeam('staff')).toBe(false);
    expect(canManageTeam(null)).toBe(false);
    expect(canViewBilling('admin')).toBe(true);
    expect(canViewBilling('manager')).toBe(false);
  });

  it('renders text labels for every cell (never color-only)', () => {
    for (const lang of ['en', 'id'] as const) {
      const copy = getSettingsCopy(lang);
      for (const cap of CAPABILITY_KEYS) {
        expect(capabilityLabel(copy, cap).length).toBeGreaterThan(0);
        for (const role of MATRIX_ROLES) {
          expect(
            accessLabel(copy, matrixAccess(cap, role)).length
          ).toBeGreaterThan(0);
        }
      }
      expect(new Set(MATRIX_ROLES.map((r) => roleCardTones(r).card)).size).toBe(
        3
      );
    }
  });

  it('en/id settings copy stays in sync with no secret wording', () => {
    const en = getSettingsCopy('en');
    const id = getSettingsCopy('id');
    expect(Object.keys(id).sort()).toEqual(settingsCopyKeys().sort());
    for (const key of settingsCopyKeys()) {
      for (const text of [en[key], id[key]]) {
        expect(text).not.toMatch(/passwordHash|tokenHash|Bearer|tb_session/);
      }
    }
  });
});

describe('self-membership client (UTA-74 shell)', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('reads the caller membership over cookies with opaque ids only', async () => {
    const fetchFn = stubFetch(async (url: string, init?: RequestInit) => {
      expect(url).toBe('/api/auth/membership');
      expect(init?.credentials).toBe('same-origin');
      return jsonResponse(
        {
          membership: {
            workspaceId: 'ws_1',
            userId: 'u_staff',
            role: 'staff',
            warehouseScope: 'wh_jkt_1',
            status: 'active',
          },
        },
        200
      );
    });
    const m = await getMyMembership({ fetchFn });
    expect(m.role).toBe('staff');
    expect(m.warehouseScope).toBe('wh_jkt_1');
    expect(JSON.stringify(m)).not.toMatch(/tokenHash|passwordHash/);
  });

  it('maps 401 to re-auth and 403 to the generic access copy', async () => {
    const expired = await getMyMembership({
      fetchFn: stubFetch(async () =>
        jsonResponse(
          { error: 'Session is expired.', errorCode: 'INVALID_SESSION' },
          401
        )
      ),
    }).catch((e: unknown) => e);
    expect(expired).toBeInstanceOf(TeamClientError);
    expect((expired as TeamClientError).needsReauth).toBe(true);

    const forbidden = await getMyMembership({
      fetchFn: stubFetch(async () =>
        jsonResponse(
          {
            error: 'Cross-workspace access denied',
            errorCode: 'TENANCY_FORBIDDEN',
          },
          403
        )
      ),
    }).catch((e: unknown) => e);
    expect(forbidden).toBeInstanceOf(TeamClientError);
    expect((forbidden as TeamClientError).message).not.toContain('ws_');
  });
});

describe('self-membership route (memory wiring)', () => {
  const ADMIN_EMAIL = 'owner@fixture.test';
  const ADMIN_PASSWORD = 'sari-roti-88!';
  const STAFF_EMAIL = 'clerk@fixture.test';
  const STAFF_PASSWORD = 'clerk-noodles-99';

  let workspaceId: string;
  let adminToken: string;

  async function signInToken(email: string, password: string): Promise<string> {
    const res = await signIn(
      apiRequest('/api/auth/sign-in', {
        email,
        password,
        workspaceId,
        platform: 'mobile',
      })
    );
    expect(res.status).toBe(200);
    return ((await res.json()) as { token: string }).token;
  }

  beforeEach(async () => {
    __resetAuthForTests();
    __resetMembershipForTests();
    ({ workspaceId } = await seedFixtureCredential({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
    }));
    adminToken = await signInToken(ADMIN_EMAIL, ADMIN_PASSWORD);
  });

  it('returns the Admin self-view; anon is 401', async () => {
    const res = await getMembership(
      apiRequest('/api/auth/membership', undefined, bearer(adminToken), 'GET')
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      membership: Record<string, unknown>;
    };
    expect(body.membership).toMatchObject({
      workspaceId,
      role: 'admin',
      warehouseScope: null,
      status: 'active',
    });
    expect(JSON.stringify(body)).not.toMatch(/tokenHash|passwordHash/);

    const anon = await getMembership(
      apiRequest('/api/auth/membership', undefined, {}, 'GET')
    );
    expect(anon.status).toBe(401);
  });

  it('lets Staff read their own role/scope (shell gating without admin APIs)', async () => {
    const created = await createInvite(
      apiRequest(
        `/api/workspaces/${workspaceId}/invites`,
        { email: STAFF_EMAIL, role: 'staff', warehouseScope: 'wh_jkt_1' },
        bearer(adminToken)
      ),
      { params: Promise.resolve({ workspaceId }) }
    );
    expect(created.status).toBe(201);
    const { token } = (await created.json()) as { token: string };
    const accepted = await acceptInvite(
      apiRequest('/api/invites/accept', { token, newPassword: STAFF_PASSWORD })
    );
    expect(accepted.status).toBe(200);

    const staffToken = await signInToken(STAFF_EMAIL, STAFF_PASSWORD);
    const res = await getMembership(
      apiRequest('/api/auth/membership', undefined, bearer(staffToken), 'GET')
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      membership: Record<string, unknown>;
    };
    expect(body.membership).toMatchObject({
      workspaceId,
      role: 'staff',
      warehouseScope: 'wh_jkt_1',
      status: 'active',
    });
  });
});
