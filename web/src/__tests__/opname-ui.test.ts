import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type {
  StockCountDetailLineView,
  StockCountDetailView,
} from '@tokoboss/contracts';
import { CountPanel } from '../components/opname/CountPanel';
import { PostedResult } from '../components/opname/PostedResult';
import { ReviewPanel } from '../components/opname/ReviewPanel';

/**
 * Stock Opname UI (US12 / RFC 03 task 51): count, review and posted panels
 * render from a session detail; "Disetujui sendiri" badge when selfApproved;
 * Rp values only when the detail carries them (Manager/Admin), never for
 * Staff. Server-rendered markup, no DOM (peer to the other *-ui tests).
 */

// Components use the classic JSX runtime under vitest, so expose React.
(globalThis as unknown as { React: typeof React }).React = React;

const T = '2026-10-19T03:00:00.000Z';

function line(
  id: string,
  countedQty: number | null,
  variance: number | null,
  valueCents?: number
): StockCountDetailLineView {
  return {
    line: {
      id,
      workspaceId: 'ws_1',
      sessionId: 'sc_1',
      warehouseId: 'wh_1',
      variantId: `var_${id}`,
      snapshotQty: 10,
      countedQty,
      systemQtyAtCount: countedQty === null ? null : 10,
      countedAt: countedQty === null ? null : T,
      countedBy: countedQty === null ? null : 'usr_staff',
      entryCount: countedQty === null ? 0 : 1,
      varianceReasonCode: variance ? 'lost' : null,
      varianceNote: null,
      flagVerified: false,
      ledgerEntryId: variance ? `led_${id}` : null,
      isOpen: false,
      version: 1,
      createdAt: T,
      updatedAt: T,
    },
    liveQty: 10,
    variance,
    movement: 0,
    flags: [],
    ...(valueCents === undefined
      ? {}
      : { hppCents: 5000, varianceValueCents: valueCents }),
  };
}

function detail(
  status: 'counting' | 'submitted' | 'posted',
  manager: boolean,
  selfApproved = false
): StockCountDetailView {
  const v = manager ? -10000 : undefined;
  return {
    session: {
      id: 'sc_1',
      workspaceId: 'ws_1',
      warehouseId: 'wh_1',
      code: 'SO-0001',
      name: 'Opname Oktober',
      scopeType: 'all',
      status,
      freezeOutboundTransfers: false,
      snapshotAt: T,
      createdBy: 'usr_mgr',
      submittedBy: status === 'counting' ? null : 'usr_staff',
      submittedAt: status === 'counting' ? null : T,
      submitNote: null,
      returnedBy: null,
      returnedAt: null,
      returnNote: null,
      postedBy: status === 'posted' ? 'usr_mgr' : null,
      postedAt: status === 'posted' ? T : null,
      cancelledBy: null,
      cancelledAt: null,
      cancelReason: null,
      selfApproved,
      lastActivityAt: T,
      version: 1,
      createdAt: T,
      updatedAt: T,
    },
    lines: [
      line('l1', 8, -2, v),
      line('l2', 10, 0, manager ? 0 : undefined),
      line('l3', null, null),
    ],
    countedLines: 2,
    uncountedLines: 1,
    totalDelta: -2,
    ...(manager ? { totalValueCents: -10000 } : {}),
  };
}

describe('opname UI (US12 task 51)', () => {
  it('count panel renders blind note and progress, never the system qty', () => {
    const html = renderToStaticMarkup(
      React.createElement(CountPanel, {
        workspaceId: 'ws_1',
        sessionId: 'sc_1',
        detail: detail('counting', true),
      })
    );
    expect(html).toContain('data-testid="opname-count-panel"');
    expect(html).toContain('Mode buta');
    expect(html).toContain('2 dari 3 SKU dihitung');
    expect(html).not.toContain('Rp');
  });

  it('review panel shows Rp for Manager/Admin and quantities only for Staff', () => {
    const mgr = renderToStaticMarkup(
      React.createElement(ReviewPanel, { detail: detail('submitted', true) })
    );
    expect(mgr).toContain('data-testid="opname-review-total"');
    expect(mgr).toContain('data-testid="opname-review-value"');
    expect(mgr).toContain('Rp');
    const staff = renderToStaticMarkup(
      React.createElement(ReviewPanel, { detail: detail('submitted', false) })
    );
    expect(staff).toContain('data-testid="opname-review-panel"');
    expect(staff).toContain('data-testid="opname-review-excluded"');
    expect(staff).not.toContain('opname-review-total');
    expect(staff).not.toContain('Rp');
  });

  it('posted result shows the self-approved badge and hides Rp for Staff', () => {
    const self = renderToStaticMarkup(
      React.createElement(PostedResult, {
        detail: detail('posted', true, true),
      })
    );
    expect(self).toContain('data-testid="opname-posted-result"');
    expect(self).toContain('Disetujui sendiri');
    expect(self).toContain('led_l1');
    expect(self).toContain('Rp');
    const staff = renderToStaticMarkup(
      React.createElement(PostedResult, { detail: detail('posted', false) })
    );
    expect(staff).not.toContain('Disetujui sendiri');
    expect(staff).not.toContain('Rp');
  });
});
