import {
  MarketplaceConnectorError,
  type MarketplaceConnector,
  type MarketplaceCredentials,
  type MarketplaceProvider,
  type MarketplaceShop,
} from '@tokoboss/domain';
import {
  connectFailed,
  integrationValidation,
  providerUnavailable,
} from './integration-errors';

/**
 * Credential-binding helpers (Blibli, US20 / RFC 04 task 22a): parse the
 * key form and validate the keys with one provider read. Secrets stay in
 * `MarketplaceCredentials` and are never echoed back or logged.
 */

export interface CredentialBindingForm {
  merchantCode: string;
  apiSellerKey: string;
  signatureKey: string;
}

export interface ParsedCredentialBinding {
  providerStoreId: string;
  shop: MarketplaceShop;
  credentials: MarketplaceCredentials;
}

/** Trims all three fields; any blank field → 400 INTEGRATION_VALIDATION. */
export function parseCredentialBinding(
  form: CredentialBindingForm
): ParsedCredentialBinding {
  const providerStoreId = (form.merchantCode ?? '').trim();
  const apiSellerKey = (form.apiSellerKey ?? '').trim();
  const signatureKey = (form.signatureKey ?? '').trim();
  if (!providerStoreId || !apiSellerKey || !signatureKey) {
    throw integrationValidation('Kode merchant dan kunci API wajib diisi.');
  }
  return {
    providerStoreId,
    shop: {
      providerStoreId,
      providerAccountId: null,
      shopCipher: null,
      storeName: null,
      region: null,
    },
    credentials: {
      secrets: { apiSellerKey, signatureKey },
      grantedScopes: [],
      accessTokenExpiresAt: null,
      authExpiresAt: null,
    },
  };
}

/**
 * One validation read. Unsupported account → 422 CONNECT_FAILED;
 * rate limit or maintenance → 503; any other connector error (bad keys)
 * → 400 with a neutral message. Non-connector errors are rethrown.
 */
export async function validateBindingCredentials(
  connector: MarketplaceConnector,
  provider: MarketplaceProvider,
  parsed: ParsedCredentialBinding
): Promise<void> {
  try {
    await connector.validateCredentials({
      provider,
      shop: parsed.shop,
      credentials: parsed.credentials,
    });
  } catch (err) {
    if (!(err instanceof MarketplaceConnectorError)) throw err;
    if (err.kind === 'unsupported_account') {
      throw connectFailed('unsupported_account');
    }
    if (err.kind === 'rate_limited' || err.kind === 'unavailable') {
      throw providerUnavailable();
    }
    throw integrationValidation('Kunci API Blibli tidak valid.');
  }
}
