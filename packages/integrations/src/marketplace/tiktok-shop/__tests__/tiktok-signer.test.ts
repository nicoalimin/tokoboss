import { describe, expect, it } from 'vitest';
import { TikTokSigner } from '../tiktok-signer';

/**
 * TikTok Shop signer vectors (UTA-39 / US20, RFC 04 task 58). Expected
 * digests were computed independently (Python hmac/sha256) for app key
 * `test-app-key` and secret `test-app-secret` at 1760000000 s; the half
 * second must floor away.
 */
const signer = new TikTokSigner({
  appKey: 'test-app-key',
  appSecret: 'test-app-secret',
});
const now = new Date(1_760_000_000_500);
const SEARCH_PATH = '/order/202309/orders/search';
const SEARCH_BODY = '{"create_time_ge":1759000000}';
const HOOK_BODY = '{"type":1,"shop_id":"7494001","timestamp":1760000000}';
const HOOK_SIGN =
  'a89d7f6556ee95b88949778bdbc232855bf0f81b01fbbc72abb5c97fd0740619';

describe('TikTokSigner', () => {
  it('signs GET and POST calls to the known vectors', () => {
    expect(
      signer.baseString('/authorization/202309/shops', {
        timestamp: '1760000000',
        app_key: 'test-app-key',
        access_token: 'tok-seller-abc',
        sign: 'stale',
      })
    ).toBe('/authorization/202309/shopsapp_keytest-app-keytimestamp1760000000');
    expect(
      signer.signedQuery('/authorization/202309/shops', now, {
        access_token: 'tok-seller-abc',
      })
    ).toEqual({
      access_token: 'tok-seller-abc',
      app_key: 'test-app-key',
      timestamp: '1760000000',
      sign: 'c8b40d9fb4a03a86345b3f1bbf16fee8f85edb85665f899d39fbb6ee1ca919b4',
    });
    expect(
      signer.signedQuery(
        SEARCH_PATH,
        now,
        { shop_cipher: 'ROW_cipher1', page_size: '50' },
        SEARCH_BODY
      )
    ).toEqual({
      shop_cipher: 'ROW_cipher1',
      page_size: '50',
      app_key: 'test-app-key',
      timestamp: '1760000000',
      sign: '6121f279cb58515949a5785fbbddf787f8f22d68efdfb56c0d76f2348ccf0fbb',
    });
  });

  it('verifies webhook Authorization and rejects tampering', () => {
    expect(signer.verifyWebhook(HOOK_BODY, HOOK_SIGN)).toBe(true);
    expect(
      signer.verifyWebhook(HOOK_BODY, ` ${HOOK_SIGN.toUpperCase()} `)
    ).toBe(true);
    expect(signer.verifyWebhook(`${HOOK_BODY} `, HOOK_SIGN)).toBe(false);
    expect(signer.verifyWebhook(HOOK_BODY, HOOK_SIGN.slice(0, 63))).toBe(false);
    expect(signer.verifyWebhook(HOOK_BODY, undefined)).toBe(false);
    expect(signer.verifyWebhook(HOOK_BODY, '')).toBe(false);
    expect(signer.verifyWebhook(HOOK_BODY, 'not-hex')).toBe(false);
  });

  it('rejects missing app key or secret at construction', () => {
    for (const config of [
      { appKey: '', appSecret: 's' },
      { appKey: 'k', appSecret: '' },
    ]) {
      expect(() => new TikTokSigner(config)).toThrow(
        'TIKTOK_SIGNER_CONFIG_INVALID'
      );
    }
  });
});
