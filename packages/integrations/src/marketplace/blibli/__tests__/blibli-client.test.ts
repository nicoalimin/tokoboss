import { describe, expect, it } from 'vitest';
import {
  blibliDate,
  blibliRequest,
  blibliSignature,
  type BlibliPartnerConfig,
  type BlibliRequestInput,
  type BlibliSellerKeys,
} from '../blibli-client';

/**
 * Blibli client headers and signature vectors (UTA-39 / US20, RFC 04 task
 * 62). Expected digests were computed independently (Python hmac/sha256/
 * md5) for signature key `test-signature-key` at 1760000000 s; the half
 * second must floor away in the WIB date.
 */
const now = new Date(1_760_000_000_500);
const KEY = 'test-signature-key';
const PICKUP_PATH = '/mta/api/businesspartner/v1/product/getPickupPoint';
const LIST_PATH = '/mta/api/businesspartner/v2/product/getProductList';
const LIST_BODY = '{"page":0,"size":50}';
const partner: BlibliPartnerConfig = {
  env: 'uat',
  clientId: 'tb-client',
  clientKey: 'tb-secret',
  channelId: 'tokoboss',
};
const seller: BlibliSellerKeys = {
  merchantCode: 'TOS-60001',
  apiSellerKey: 'seller-key-abc',
  signatureKey: KEY,
};

describe('blibli client', () => {
  it('formats the WIB date and signs to the known vectors', () => {
    expect(blibliDate(now)).toBe('Thu Oct 09 15:53:20 WIB 2025');
    expect(
      blibliSignature(KEY, { method: 'GET', path: PICKUP_PATH, now })
    ).toBe('aGosEaGsP285N/uAPTlKD+RibUyaGtV8Idp6JXlvQyQ=');
    expect(
      blibliSignature(KEY, {
        method: 'POST',
        path: LIST_PATH,
        body: LIST_BODY,
        now,
      })
    ).toBe('gjth/zKj4Z+JaKgIC0g8BmYYTGjp/UKI1iBsiSW8yBU=');
    expect(
      blibliSignature(KEY, {
        method: 'POST',
        path: '/proxy-other/x',
        body: '{"note":"a\nb"}',
        now,
      })
    ).toBe('3n9PqK9vkytxF8YczI8NNnYg2E6lKOgq9bkk9VEDySI=');
  });

  it('builds the signed URL, query and headers', () => {
    const { url, init } = blibliRequest(partner, seller, {
      method: 'POST',
      path: LIST_PATH,
      query: { requestId: 'override-id', page: '2' },
      body: LIST_BODY,
      now,
      requestId: 'req-1',
    });
    expect(`${url.origin}${url.pathname}`).toBe(
      `https://api-uata.gdn-app.com/v2/proxy${LIST_PATH}`
    );
    expect(Object.fromEntries(url.searchParams)).toEqual({
      storeId: '10001',
      businessPartnerCode: 'TOS-60001',
      merchantCode: 'TOS-60001',
      storeCode: 'TOS-60001',
      channelId: 'tokoboss',
      requestId: 'override-id',
      page: '2',
    });
    const headers = init.headers as Headers;
    expect(init.method).toBe('POST');
    expect(init.body).toBe(LIST_BODY);
    expect(headers.get('authorization')).toBe(
      'Basic dGItY2xpZW50OnRiLXNlY3JldA=='
    );
    expect(headers.get('api-seller-key')).toBe('seller-key-abc');
    expect(headers.get('content-type')).toBe('application/json');
    expect(headers.get('signature')).toBe(
      'gjth/zKj4Z+JaKgIC0g8BmYYTGjp/UKI1iBsiSW8yBU='
    );
    expect(headers.get('signature-time')).toBe('1760000000500');
  });

  it('skips signature headers without a key and rejects bad config', () => {
    const input: BlibliRequestInput = {
      method: 'GET',
      path: PICKUP_PATH,
      now,
      requestId: 'r',
    };
    const unsigned = blibliRequest(
      { ...partner, env: 'production' },
      { ...seller, signatureKey: '' },
      input
    );
    const headers = unsigned.init.headers as Headers;
    expect(unsigned.url.origin).toBe('https://api.blibli.com');
    expect(headers.get('signature')).toBeNull();
    expect(headers.get('signature-time')).toBeNull();
    expect(unsigned.init.body).toBeUndefined();
    for (const [p, s] of [
      [{ ...partner, clientId: '' }, seller],
      [{ ...partner, clientKey: '' }, seller],
      [partner, { ...seller, apiSellerKey: '' }],
    ] as const) {
      expect(() => blibliRequest(p, s, input)).toThrow(
        'BLIBLI_CLIENT_CONFIG_INVALID'
      );
    }
  });
});
