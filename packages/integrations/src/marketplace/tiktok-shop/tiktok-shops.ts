import type { MarketplaceShop } from '@tokoboss/domain';
import { tiktokCall, tiktokText, type TikTokHttpDeps } from './tiktok-http';

/**
 * TikTok Shop authorized shops (UTA-39 / US20, RFC 04 task 55b): lists the
 * shops a seller token can act on and keeps each shop's `cipher`, which
 * later shop-scoped calls must send. Never logs the access token.
 */
export const TIKTOK_SHOPS_PATH = '/authorization/202309/shops';

/** Shops without an id are skipped; missing name/region/cipher become null. */
export async function tiktokAuthorizedShops(
  deps: TikTokHttpDeps,
  accessToken: string,
  accountId: string | null
): Promise<MarketplaceShop[]> {
  const data = await tiktokCall(deps, TIKTOK_SHOPS_PATH, { accessToken });
  const list: unknown[] = Array.isArray(data.shops) ? data.shops : [];
  return list.flatMap((raw): MarketplaceShop[] => {
    const shop = (raw ?? {}) as Record<string, unknown>;
    const id = tiktokText(shop.id);
    if (!id) return [];
    return [
      {
        providerStoreId: id,
        providerAccountId: accountId,
        shopCipher: tiktokText(shop.cipher),
        storeName: tiktokText(shop.name),
        region: tiktokText(shop.region),
      },
    ];
  });
}
