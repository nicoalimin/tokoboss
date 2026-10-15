import { describe, expect, it } from 'vitest';
import {
  enterHref,
  inviteLandingHref,
  postSignInHref,
} from '../lib/next-guard';

/**
 * US29 / RFC 02 row 67 — pure `next` guards (rows 64 + 39). No DOM.
 */
describe('postSignInHref (row 64)', () => {
  it('follows a safe next, else falls back to the landing', () => {
    expect(postSignInHref('/w/ws1/produk', null)).toBe('/w/ws1/produk');
    expect(postSignInHref('/akun/profil', { kind: 'picker' })).toBe(
      '/akun/profil'
    );
    expect(postSignInHref('/accept-invite?token=t', null)).toBe(
      '/accept-invite?token=t'
    );
    expect(postSignInHref('/go/produk', null)).toBe('/go/produk');
    expect(
      postSignInHref('//evil.com', { kind: 'workspace', workspaceId: 'ws 1' })
    ).toBe('/w/ws%201/dashboard');
    expect(
      postSignInHref('https://evil.com', {
        kind: 'workspace',
        workspaceId: 'ws1',
      })
    ).toBe('/w/ws1/dashboard');
    expect(postSignInHref('/sign-in', { kind: 'picker' })).toBe(
      '/pilih-workspace'
    );
    expect(postSignInHref(null, null)).toBe('/pilih-workspace');
  });
});

describe('enterHref (row 39)', () => {
  it('sends unsafe or auth-only next values to the workspace dashboard', () => {
    for (const next of [
      null,
      '',
      'produk',
      '//evil.com',
      '/akun/profil',
      '/accept-invite?token=t',
      '/sign-in',
      '/pilih-workspace',
      '/go/produk',
    ]) {
      expect(enterHref('ws1', next)).toBe('/w/ws1/dashboard');
    }
  });

  it('remaps /w/:other paths and prefixes other in-app paths', () => {
    expect(enterHref('ws1', '/w/other/produk/impor')).toBe(
      '/w/ws1/produk/impor'
    );
    expect(enterHref('ws1', '/w/other')).toBe('/w/ws1/dashboard');
    expect(enterHref('ws1', '/w/other/')).toBe('/w/ws1/dashboard');
    expect(enterHref('ws1', '/produk')).toBe('/w/ws1/produk');
    expect(enterHref('a/b', '/transfer')).toBe('/w/a%2Fb/transfer');
  });
});

describe('inviteLandingHref (row 66)', () => {
  it('lands on the picker with the workspace highlighted and encoded', () => {
    expect(inviteLandingHref('ws1')).toBe('/pilih-workspace?highlight=ws1');
    expect(inviteLandingHref('a/b c&d')).toBe(
      '/pilih-workspace?highlight=a%2Fb%20c%26d'
    );
  });
});
