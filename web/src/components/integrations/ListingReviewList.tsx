'use client';

import type { IntegrationLang } from '@/lib/integration-copy';
import { getIntegrationListingReviewCopy } from '@/lib/integration-listing-review-copy';
import { useListingReview } from '@/lib/use-listing-review';
import { ListingFilterChips } from './ListingFilterChips';
import { ListingReviewCards } from './ListingReviewCards';
import { OrderPreviewList } from './OrderPreviewList';

/**
 * Import review list (US20 / RFC 04 task 120g, CoS split of row 120): the
 * client container for one store. Data and state come from the 120f hook;
 * renders the 120a heading + intro, the 120e mapping_state chips, the 120c
 * listing cards with "Muat lagi" and the 120d recent order preview. Loading
 * is role="status"; a failed read is role="alert" with retry. Review only:
 * no mapping actions (Story 03).
 */

const BUTTON =
  'min-h-[44px] rounded-lg border px-4 py-2 text-sm font-semibold disabled:opacity-50';

export interface ListingReviewListProps {
  workspaceId: string;
  connectionId: string;
  lang?: IntegrationLang;
}

export function ListingReviewList({
  workspaceId,
  connectionId,
  lang = 'id',
}: Readonly<ListingReviewListProps>) {
  const copy = getIntegrationListingReviewCopy(lang);
  const review = useListingReview(workspaceId, connectionId);
  const { filter, listings, orders, loading, loadingMore, failed } = review;

  let body;
  if (failed) {
    body = (
      <div
        role="alert"
        data-testid="listing-review-error"
        className="rounded-lg border border-error-200 bg-error-50 p-4 text-sm text-error-800"
      >
        <p>{copy.failed}</p>
        <button
          type="button"
          onClick={review.retry}
          className={`mt-3 border-error-300 bg-white hover:bg-error-100 ${BUTTON}`}
        >
          {copy.retry}
        </button>
      </div>
    );
  } else if (loading) {
    body = (
      <p role="status" className="py-3 text-sm text-neutral-600">
        {copy.loading}
      </p>
    );
  } else if (listings.length === 0) {
    body = (
      <p
        data-testid="listing-review-empty"
        className="py-3 text-sm text-neutral-600"
      >
        {filter === null ? copy.emptyListings : copy.emptyFiltered}
      </p>
    );
  } else {
    body = (
      <>
        <ListingReviewCards listings={listings} lang={lang} />
        {review.nextCursor === null ? null : (
          <button
            type="button"
            data-testid="listing-review-more"
            onClick={review.loadMore}
            disabled={loadingMore}
            className={`self-start border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50 ${BUTTON}`}
          >
            {loadingMore ? copy.loading : copy.loadMore}
          </button>
        )}
      </>
    );
  }

  return (
    <section data-testid="listing-review-list" className="flex flex-col gap-3">
      <h2 className="text-base font-semibold text-neutral-900">
        {copy.listingsHeading}
      </h2>
      <p className="text-sm text-neutral-600">{copy.listingsIntro}</p>
      <ListingFilterChips
        value={filter}
        onChange={review.setFilter}
        disabled={loading || loadingMore}
        lang={lang}
      />
      {body}
      {failed || (loading && orders.length === 0) ? null : (
        <OrderPreviewList orders={orders} lang={lang} />
      )}
    </section>
  );
}
