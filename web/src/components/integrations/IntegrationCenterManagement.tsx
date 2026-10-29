'use client';

import { useState } from 'react';
import type { IntegrationActivityItemDto } from '@tokoboss/contracts';
import type {
  IntegrationKpiSummary,
  StoreHealthRowView,
} from '@/lib/integration-management-views';
import { IntegrationActivityTable } from './IntegrationActivityTable';
import { IntegrationKpiBar } from './IntegrationKpiBar';
import { IntegrationStoreDrawer } from './IntegrationStoreDrawer';
import type { StoreHealthRowActions } from './IntegrationStoreHealthRow';
import { IntegrationStoreHealthTable } from './IntegrationStoreHealthTable';

/**
 * Integration Center store management (UTA-38 / US18, RFC 07 row 37a),
 * mockup Screen 1: the Manager/Staff read-only badge, the row 30 KPI bar,
 * the row 31c store table, the row 32 activity log and the row 33b drawer
 * (opened by Kelola). Store actions are only wired for Admin; the server
 * stays the boundary. The parent (row 37b panel) supplies the read data.
 */

export interface IntegrationCenterManagementData {
  /** Row 23b `toIntegrationKpiSummary(rows)`, computed by the caller. */
  summary: IntegrationKpiSummary;
  rows: readonly StoreHealthRowView[];
  activity: readonly IntegrationActivityItemDto[];
  /** Admin-only store actions (toggle / re-auth / disconnect / manage). */
  actions?: StoreHealthRowActions;
  /** Drawer Admin CTA: opens the re-auth / disconnect confirmation. */
  onManageConnection?: (id: string) => void;
  /** Replaces the KPI bar lazy-refresh note, e.g. a save toast. */
  toast?: string;
  actorNames?: Readonly<Record<string, string>>;
}

export interface IntegrationCenterManagementProps extends IntegrationCenterManagementData {
  isAdmin: boolean;
}

export function IntegrationCenterManagement({
  summary,
  rows,
  activity,
  isAdmin,
  actions,
  onManageConnection,
  toast,
  actorNames,
}: Readonly<IntegrationCenterManagementProps>) {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = rows.find((r) => r.connection.id === openId) ?? null;
  const adminActions = isAdmin ? actions : undefined;
  return (
    <section
      data-testid="integration-center-management"
      className="flex flex-col gap-4"
    >
      {isAdmin ? null : (
        <span
          data-testid="integration-center-read-only"
          className="inline-flex w-fit items-center rounded-full bg-neutral-100 px-3 py-1 text-xs font-semibold text-neutral-700"
        >
          🔒 Manager/Staff: hanya baca
        </span>
      )}
      <IntegrationKpiBar summary={summary} toast={toast} />
      <IntegrationStoreHealthTable
        rows={rows}
        isAdmin={isAdmin}
        {...adminActions}
        onManage={(id) => {
          setOpenId(id);
          adminActions?.onManage?.(id);
        }}
      />
      <IntegrationActivityTable items={activity} actorNames={actorNames} />
      <IntegrationStoreDrawer
        row={open}
        isAdmin={isAdmin}
        onClose={() => setOpenId(null)}
        onManageConnection={isAdmin ? onManageConnection : undefined}
      />
    </section>
  );
}
