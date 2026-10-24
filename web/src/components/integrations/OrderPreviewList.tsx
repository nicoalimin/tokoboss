import type { IntegrationOrderPreviewView } from '@tokoboss/contracts';
import type { IntegrationLang } from '@/lib/integration-copy';
import { getIntegrationListingReviewCopy } from '@/lib/integration-listing-review-copy';
import {
  formatPreviewTime,
  formatPreviewTotal,
} from '@/lib/integration-listing-review-views';

/**
 * Recent order preview (US20 / RFC 04 task 120d, CoS split of row 120):
 * heading, PII-free note and one card per imported order with the provider
 * order ID, provider status, order time in WIB, line count and rupiah total.
 * No buyer name, address or phone exists on these rows or is shown.
 * Presentational: no fetch, no state; the 120f container loads the orders
 * (max 50 from the last 7 days) and handles loading / error.
 */

/** Middle dot separator, as in StoreRow. */
const SEP = ' \u00b7 ';

export type OrderPreviewRow = Pick<
  IntegrationOrderPreviewView,
  | 'externalOrderId'
  | 'providerStatus'
  | 'orderedAt'
  | 'lineCount'
  | 'totalCents'
>;

export interface OrderPreviewListProps {
  orders: readonly OrderPreviewRow[];
  lang?: IntegrationLang;
}

export function OrderPreviewList({
  orders,
  lang = 'id',
}: Readonly<OrderPreviewListProps>) {
  const copy = getIntegrationListingReviewCopy(lang);
  return (
    <section data-testid="order-preview-list" className="flex flex-col gap-1">
      <h3 className="text-sm font-semibold text-neutral-900">
        {copy.ordersHeading}
      </h3>
      <p className="text-xs text-neutral-600">{copy.ordersNote}</p>
      {orders.length === 0 ? (
        <p
          data-testid="order-preview-empty"
          className="py-3 text-sm text-neutral-600"
        >
          {copy.emptyOrders}
        </p>
      ) : (
        <ul className="flex flex-col">
          {orders.map((order) => {
            const meta = [
              order.providerStatus?.trim() || null,
              formatPreviewTime(order.orderedAt),
              copy.lines(order.lineCount),
            ]
              .filter(Boolean)
              .join(SEP);
            const total = formatPreviewTotal(order.totalCents);
            return (
              <li
                key={order.externalOrderId}
                data-testid="order-preview-card"
                className="flex flex-wrap items-center gap-3 border-t border-neutral-200 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-neutral-900">
                    {order.externalOrderId}
                  </p>
                  <p className="text-xs text-neutral-600">{meta}</p>
                </div>
                {total === null ? null : (
                  <span
                    data-testid="order-preview-total"
                    className="shrink-0 whitespace-nowrap text-sm font-semibold text-neutral-900"
                  >
                    {total}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
