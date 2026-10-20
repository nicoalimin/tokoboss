import { describe, expect, it } from 'vitest';
import { ShopeeSigner, hexDigestEquals } from '../shopee-signer';

/**
 * Shopee signer vectors (UTA-39 / US20, RFC 04 task 53). Expected digests
 * were computed independently (Python hmac/sha256) for partner 2001234 with
 * key `test-partner-key` at 1760000000 s; the half second must floor away.
 */
const signer = new ShopeeSigner({
  partnerId: 2001234,
  partnerKey: 'test-partner-key',
});
const now = new Date(1_760_000_000_500);
const PUSH_URL = 'https://tokoboss.example/api/webhooks/shopee';
const PUSH_BODY = '{"code":2,"shop_id":555,"timestamp":1760000000}';
const PUSH_SIGN =
  'b1a50868e4e715d8e81779d83906aa89194f9156720d9cac31c00f97cc0ae976';

describe('ShopeeSigner', () => {
  it('signs public, shop and merchant base strings to the known vectors', () => {
    expect(
      signer.baseString('/api/v2/shop/auth_partner', now, { kind: 'public' })
    ).toBe('2001234/api/v2/shop/auth_partner1760000000');
    expect(
      signer.signedParams('/api/v2/shop/auth_partner', now, { kind: 'public' })
    ).toEqual({
      partner_id: '2001234',
      timestamp: '1760000000',
      sign: '1b7676722dda2a56237dbe5dca5c61b77c29c8b7d854ebf468702a01af86bb10',
    });
    expect(
      signer.signedParams('/api/v2/shop/get_shop_info', now, {
        kind: 'shop',
        accessToken: 'tok-shop-abc',
        shopId: 555,
      })
    ).toEqual({
      partner_id: '2001234',
      timestamp: '1760000000',
      sign: '1e31fb5b22e8e1f648dcd3c2788ab02febb05763e7002a1b95f1c190a995b37e',
      access_token: 'tok-shop-abc',
      shop_id: '555',
    });
    expect(
      signer.signedParams('/api/v2/public/get_shops_by_partner', now, {
        kind: 'merchant',
        accessToken: 'tok-main-xyz',
        merchantId: 777,
      })
    ).toEqual({
      partner_id: '2001234',
      timestamp: '1760000000',
      sign: '23343caa697b104f7fcbde5051a69ce660c5c766b52b9549fb30362336e4cb64',
      access_token: 'tok-main-xyz',
      merchant_id: '777',
    });
  });

  it('verifies push Authorization and rejects tampering', () => {
    expect(signer.verifyPush(PUSH_URL, PUSH_BODY, PUSH_SIGN)).toBe(true);
    expect(
      signer.verifyPush(PUSH_URL, PUSH_BODY, ` ${PUSH_SIGN.toUpperCase()} `)
    ).toBe(true);
    expect(signer.verifyPush(PUSH_URL, `${PUSH_BODY} `, PUSH_SIGN)).toBe(false);
    expect(signer.verifyPush(`${PUSH_URL}/`, PUSH_BODY, PUSH_SIGN)).toBe(false);
    expect(signer.verifyPush(PUSH_URL, PUSH_BODY, undefined)).toBe(false);
    expect(signer.verifyPush(PUSH_URL, PUSH_BODY, 'not-hex')).toBe(false);
    expect(hexDigestEquals(PUSH_SIGN, PUSH_SIGN.slice(0, 63))).toBe(false);
  });

  it('rejects invalid partner config at construction', () => {
    for (const config of [
      { partnerId: 0, partnerKey: 'k' },
      { partnerId: -1, partnerKey: 'k' },
      { partnerId: 1.5, partnerKey: 'k' },
      { partnerId: 2001234, partnerKey: '' },
    ]) {
      expect(() => new ShopeeSigner(config)).toThrow(
        'SHOPEE_SIGNER_CONFIG_INVALID'
      );
    }
  });
});
