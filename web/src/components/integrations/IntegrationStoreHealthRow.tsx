import type { StoreHealthRowView } from '@/lib/integration-management-views';
import {
  formatLastActivity,
  StoreCapabilityCell,
  StoreHealthCell,
  StoreIdentityCell,
  type StoreCapabilityKey,
} from './IntegrationStoreHealthCells';

/**
 * One `#storeTable` row (UTA-38 / US18, RFC 07 row 31b): the row 31a cells,
 * mapped SKU count and Kelola + Admin Otorisasi ulang (warn / bad health) or
 * Putuskan. Capability checkboxes lock for non-Admin and needs_reauth /
 * disconnected. Presentational: the parent owns the actions.
 */

export interface StoreHealthRowActions {
  onToggle?: (id: string, key: StoreCapabilityKey, enabled: boolean) => void;
  onManage?: (id: string) => void;
  onReauthorize?: (id: string) => void;
  onDisconnect?: (id: string) => void;
}

export interface IntegrationStoreHealthRowProps extends StoreHealthRowActions {
  row: StoreHealthRowView;
  isAdmin: boolean;
}

const BTN = 'rounded-lg px-2.5 py-1 text-xs font-semibold';

export function IntegrationStoreHealthRow({
  row,
  isAdmin,
  onToggle,
  onManage,
  onReauthorize,
  onDisconnect,
}: Readonly<IntegrationStoreHealthRowProps>) {
  const { id } = row.connection;
  const { status, tone } = row.health;
  const locked =
    !isAdmin || status === 'needs_reauth' || status === 'disconnected';
  const reauth = tone === 'bad' || tone === 'warn';
  const cell = { row, locked, onToggle };
  return (
    <tr data-testid="store-health-row" data-status={status}>
      <StoreIdentityCell row={row} />
      <StoreHealthCell health={row.health} />
      <StoreCapabilityCell {...cell} capability="orderImportEnabled" />
      <StoreCapabilityCell {...cell} capability="inventorySyncEnabled" />
      <td>
        <b>{row.metrics.mappedSkuCount}</b>
      </td>
      <td>
        <small>{formatLastActivity(row)}</small>
      </td>
      <td className="flex gap-1.5">
        <button
          type="button"
          className={`${BTN} bg-neutral-100`}
          onClick={() => onManage?.(id)}
        >
          Kelola
        </button>
        {isAdmin ? (
          <button
            type="button"
            data-testid="store-health-admin-action"
            className={`${BTN} ${reauth ? 'bg-primary-500 text-white' : 'bg-neutral-100'}`}
            onClick={() => (reauth ? onReauthorize : onDisconnect)?.(id)}
          >
            {reauth ? 'Otorisasi ulang' : 'Putuskan'}
          </button>
        ) : null}
      </td>
    </tr>
  );
}
