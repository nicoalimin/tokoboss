'use client';

import { useEffect, useRef, useState } from 'react';
import type {
  IntegrationListingMappingState,
  IntegrationListingRowView,
  IntegrationOrderPreviewView,
} from '@tokoboss/contracts';
import {
  getOrderPreviews,
  getStagedListings,
} from './integrations-listings-client';

/**
 * Import review data for one connection (US20 / RFC 04 task 120f, CoS split
 * of row 120): mapping_state filter (null = Semua), staged listings (101b,
 * cursor paged; a filter change reloads page one) and recent order previews.
 * Any failed read sets `failed`; `retry` reloads all. Stale responses are
 * dropped. Used by the 120g ListingReviewList container; no copy, no markup.
 */

export type ListingReviewFilter = IntegrationListingMappingState | null;

export interface ListingReviewData {
  listings: IntegrationListingRowView[];
  nextCursor: string | null;
  orders: IntegrationOrderPreviewView[];
  loading: boolean;
  loadingMore: boolean;
  failed: boolean;
}

export interface ListingReviewState extends ListingReviewData {
  filter: ListingReviewFilter;
  setFilter: (filter: ListingReviewFilter) => void;
  loadMore: () => void;
  retry: () => void;
}

const START: ListingReviewData = {
  listings: [],
  nextCursor: null,
  orders: [],
  loading: true,
  loadingMore: false,
  failed: false,
};

export function useListingReview(
  workspaceId: string,
  connectionId: string
): ListingReviewState {
  const [filter, setFilterValue] = useState<ListingReviewFilter>(null);
  const [attempt, setAttempt] = useState(0);
  const [data, setData] = useState<ListingReviewData>(START);
  const generation = useRef(0);
  const mappingState = filter ?? undefined;

  useEffect(() => {
    const gen = ++generation.current;
    Promise.all([
      getStagedListings(workspaceId, connectionId, { mappingState }),
      getOrderPreviews(workspaceId, connectionId),
    ])
      .then(([page, orders]) => {
        if (gen !== generation.current) return;
        setData({ ...START, ...page, orders, loading: false });
      })
      .catch(() => {
        if (gen !== generation.current) return;
        setData({ ...START, loading: false, failed: true });
      });
  }, [workspaceId, connectionId, mappingState, attempt]);

  const setFilter = (next: ListingReviewFilter) => {
    if (next === filter) return;
    setData((d) => ({ ...START, orders: d.orders }));
    setFilterValue(next);
  };

  const retry = () => {
    setData(START);
    setAttempt((n) => n + 1);
  };

  const loadMore = () => {
    const cursor = data.nextCursor;
    if (!cursor || data.loadingMore) return;
    const gen = generation.current;
    setData((d) => ({ ...d, loadingMore: true }));
    getStagedListings(workspaceId, connectionId, { mappingState, cursor })
      .then((page) => {
        if (gen !== generation.current) return;
        setData((d) => ({
          ...d,
          listings: [...d.listings, ...page.listings],
          nextCursor: page.nextCursor,
          loadingMore: false,
        }));
      })
      .catch(() => {
        if (gen !== generation.current) return;
        setData((d) => ({ ...d, loadingMore: false, failed: true }));
      });
  };

  return { ...data, filter, setFilter, loadMore, retry };
}
