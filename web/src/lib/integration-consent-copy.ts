/**
 * Capability labels and consent-step copy, Bahasa Indonesia first (US20 /
 * RFC 04 task 100b): the five per-store capabilities, provider sign-in hints
 * and the requested scopes (data read / data updated). Stock is never pushed
 * before SKU mapping and sync are enabled explicitly.
 */
import type {
  IntegrationConnectionView,
  MarketplaceProviderWire,
} from '@tokoboss/contracts';
import type { IntegrationLang } from './integration-copy';

export type IntegrationCapabilityKey =
  keyof IntegrationConnectionView['capabilities'];

export interface IntegrationConsentCopy {
  capability: Record<IntegrationCapabilityKey, string>;
  capabilityNote: string;
  providerSignIn: Record<MarketplaceProviderWire, string>;
  consentIntro: (provider: string) => string;
  readHeading: string;
  readScopes: readonly string[];
  updateHeading: string;
  updateScopes: readonly string[];
  ownStoresNote: string;
  continueTo: (provider: string) => string;
}

const id: IntegrationConsentCopy = {
  capability: {
    order_import: 'impor order',
    inventory_sync: 'sinkron stok',
    labels: 'label',
    webhooks: 'webhook',
    pickup: 'pickup',
  },
  capabilityNote:
    'Kemampuan per toko ditampilkan terpisah: impor order · sinkron stok · label · webhook · pickup. Stok tidak pernah didorong sebelum pemetaan SKU dan sinkron diaktifkan secara eksplisit.',
  providerSignIn: {
    shopee: 'Masuk dengan akun penjual Shopee',
    tiktok_shop: 'Masuk dengan akun penjual TikTok Shop',
    blibli: 'Masuk dengan akun Seller Blibli',
  },
  consentIntro: (provider) =>
    `TokoBoss akan meminta izin berikut dari ${provider}. Nama izin persis mengikuti halaman otorisasi penyedia.`,
  readHeading: 'Data yang dibaca',
  readScopes: [
    'Info toko (nama, ID toko)',
    'Produk & varian (untuk pemetaan Store SKU → SKU TokoBoss, Story 03)',
    'Pesanan (untuk impor order)',
  ],
  updateHeading: 'Data yang diperbarui',
  updateScopes: [
    'Jumlah stok di lokasi yang dikelola penjual — hanya setelah pemetaan & sinkron diaktifkan (Story 04)',
  ],
  ownStoresNote:
    'Hanya toko milik akun yang Anda masuki yang dapat dipilih. Toko yang sudah terhubung ke workspace ini tidak dapat dihubungkan dua kali.',
  continueTo: (provider) => `Lanjut ke ${provider}`,
};

const en: IntegrationConsentCopy = {
  capability: {
    order_import: 'order import',
    inventory_sync: 'inventory sync',
    labels: 'labels',
    webhooks: 'webhooks',
    pickup: 'pickup',
  },
  capabilityNote:
    'Capabilities are shown per store: order import · inventory sync · labels · webhooks · pickup. Stock is never pushed before SKU mapping and sync are explicitly enabled.',
  providerSignIn: {
    shopee: 'Sign in with a Shopee seller account',
    tiktok_shop: 'Sign in with a TikTok Shop seller account',
    blibli: 'Sign in with a Blibli Seller account',
  },
  consentIntro: (provider) =>
    `TokoBoss will request the following permissions from ${provider}. Permission names match the provider's authorization page exactly.`,
  readHeading: 'Data read',
  readScopes: [
    'Store info (name, store ID)',
    'Products & variants (to map Store SKU → TokoBoss SKU, Story 03)',
    'Orders (for order import)',
  ],
  updateHeading: 'Data updated',
  updateScopes: [
    'Stock quantity at seller-managed locations — only after mapping & sync are enabled (Story 04)',
  ],
  ownStoresNote:
    'Only stores owned by the account you sign in with can be selected. A store already connected to this workspace cannot be connected twice.',
  continueTo: (provider) => `Continue to ${provider}`,
};

const COPIES: Record<IntegrationLang, IntegrationConsentCopy> = { id, en };

export function getIntegrationConsentCopy(
  lang: IntegrationLang = 'id'
): IntegrationConsentCopy {
  return COPIES[lang] ?? COPIES.id;
}
