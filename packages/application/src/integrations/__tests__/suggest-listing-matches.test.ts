import { describe, expect, it } from 'vitest';
import {
  suggestListingMatches,
  type MatchableVariant,
} from '../suggest-listing-matches';

/** Listing → variant matcher (UTA-39 / US20, RFC 04 task 45). */
const variants: MatchableVariant[] = [
  { id: 'v-kaos-m', skuCode: 'KAOS-M', barcode: '8991000000011' },
  { id: 'v-kaos-l', skuCode: 'KAOS-L', barcode: null },
  { id: 'v-topi-a', skuCode: 'TOPI', barcode: '8991000000099' },
  { id: 'v-topi-b', skuCode: 'topi ', barcode: null },
];

function row(
  platformSkuId: string,
  storeSkuText: string | null,
  barcodeHint: string | null = null
) {
  return { platformSkuId, storeSkuText, barcodeHint };
}

describe('suggest listing matches', () => {
  it('suggests the one exact Store SKU or barcode match', () => {
    const result = suggestListingMatches({
      listings: [row('p1', ' kaos-m '), row('p2', null, '8991000000011')],
      variants,
      mappedPlatformSkuIds: new Set<string>(),
    });

    expect(result).toEqual([
      {
        platformSkuId: 'p1',
        mappingState: 'suggested',
        suggestedVariantIds: ['v-kaos-m'],
      },
      {
        platformSkuId: 'p2',
        mappingState: 'suggested',
        suggestedVariantIds: ['v-kaos-m'],
      },
    ]);
  });

  it('marks several candidates as ambiguous', () => {
    const result = suggestListingMatches({
      listings: [row('p1', 'TOPI'), row('p2', 'KAOS-L', '8991000000099')],
      variants,
      mappedPlatformSkuIds: new Set<string>(),
    });

    expect(result).toEqual([
      {
        platformSkuId: 'p1',
        mappingState: 'ambiguous',
        suggestedVariantIds: ['v-topi-a', 'v-topi-b'],
      },
      {
        platformSkuId: 'p2',
        mappingState: 'ambiguous',
        suggestedVariantIds: ['v-kaos-l', 'v-topi-a'],
      },
    ]);
  });

  it('leaves no match, blank or duplicated SKU text unmapped, and keeps mapped rows', () => {
    const result = suggestListingMatches({
      listings: [
        row('p1', 'SEPATU'),
        row('p2', '  '),
        row('p3', 'KAOS-L'),
        row('p4', 'kaos-l'),
        row('p5', 'KAOS-M'),
      ],
      variants,
      mappedPlatformSkuIds: new Set(['p5']),
    });

    expect(result.map((r) => [r.platformSkuId, r.mappingState])).toEqual([
      ['p1', 'unmapped'],
      ['p2', 'unmapped'],
      ['p3', 'unmapped'],
      ['p4', 'unmapped'],
      ['p5', 'mapped'],
    ]);
    expect(result.every((r) => r.suggestedVariantIds.length === 0)).toBe(true);
  });
});
