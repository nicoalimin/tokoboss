import { describe, expect, it } from 'vitest';
import { legacyRedirectTarget } from '@/lib/legacy-redirect';

/**
 * US29 / RFC 02 row 67 slice a — pure unit tests for middleware's
 * `legacyRedirectTarget` (row 60): ID-bearing → `/w/<id>/…`, ID-less →
 * `/go/…`, and `/akun` account redirects. Access/404 stays in `/w/` layout.
 */

describe('legacyRedirectTarget (US29 / RFC 02 row 67a)', () => {
  it('routes ID-bearing legacy links to /w/<id>/… and drops workspace query keys', () => {
    expect(
      legacyRedirectTarget(
        '/stok-tipis',
        new URLSearchParams('workspaceId=ws_a&tab=1')
      )
    ).toBe('/w/ws_a/stok-tipis?tab=1');
    expect(
      legacyRedirectTarget('/produk', new URLSearchParams('workspace=ws b'))
    ).toBe('/w/ws%20b/produk');
    expect(
      legacyRedirectTarget('/sign-in', new URLSearchParams('workspaceId=ws_x'))
    ).toBe('/w/ws_x/dashboard');
    expect(
      legacyRedirectTarget('/', new URLSearchParams('workspaceId=ws_home'))
    ).toBe('/w/ws_home/dashboard');
  });

  it('routes ID-less legacy UI paths to /go/<path> (home → /go/dashboard)', () => {
    expect(legacyRedirectTarget('/stok-tipis', new URLSearchParams())).toBe(
      '/go/stok-tipis'
    );
    expect(
      legacyRedirectTarget('/produk/bundles', new URLSearchParams('q=tea'))
    ).toBe('/go/produk/bundles?q=tea');
    expect(legacyRedirectTarget('/', new URLSearchParams())).toBe(
      '/go/dashboard'
    );
    // Empty workspaceId is not a workspace → ID-less /go path (query kept as-is).
    expect(
      legacyRedirectTarget('/team', new URLSearchParams('workspaceId='))
    ).toBe('/go/team?workspaceId=');
  });

  it('redirects /profil /profile /sessions to /akun/* (keeps non-workspace query)', () => {
    expect(legacyRedirectTarget('/profil', new URLSearchParams())).toBe(
      '/akun/profil'
    );
    expect(
      legacyRedirectTarget('/profile', new URLSearchParams('workspaceId=ws_z'))
    ).toBe('/akun/profil');
    expect(
      legacyRedirectTarget('/sessions', new URLSearchParams('tab=devices'))
    ).toBe('/akun/sesi?tab=devices');
    expect(
      legacyRedirectTarget(
        '/accept-invite',
        new URLSearchParams('workspaceId=x')
      )
    ).toBeNull();
  });
});
