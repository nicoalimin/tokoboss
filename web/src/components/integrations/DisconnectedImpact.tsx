import type { IntegrationLang } from '@/lib/integration-copy';
import {
  getIntegrationDisconnectedCopy,
  type IntegrationDisconnectSource,
} from '@/lib/integration-disconnected-copy';

/**
 * Disconnected impact (US20 / RFC 04 task 117b, CoS split of row 117),
 * mockup v2 screen 5: Dampak / Status table (sinkron stok and impor order
 * Dijeda; pemetaan Store SKU and riwayat order & ledger Tetap tersimpan)
 * and the cause + reconnect note. The mapping row shows " (n)" only when
 * the count is known; a null source shows only the reconnect note.
 * DisconnectedPanel (117c) adds heading, source line and actions. No fetch.
 */

export interface DisconnectedImpactProps {
  source: IntegrationDisconnectSource | null;
  mappingCount?: number;
  lang?: IntegrationLang;
}

const PILL =
  'inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold';
const PAUSED = `${PILL} bg-warning-50 text-warning-700`;
const KEPT = `${PILL} bg-success-50 text-success-700`;

export function DisconnectedImpact({
  source,
  mappingCount,
  lang = 'id',
}: Readonly<DisconnectedImpactProps>) {
  const copy = getIntegrationDisconnectedCopy(lang);
  const count = typeof mappingCount === 'number' ? ` (${mappingCount})` : '';
  const rows: [string, boolean][] = [
    [copy.syncRow, false],
    [copy.ordersRow, false],
    [`${copy.mappingsRow}${count}`, true],
    [copy.historyRow, true],
  ];
  const note = source
    ? `${copy.otherCauses[source]} ${copy.reconnectNote}`
    : copy.reconnectNote;
  return (
    <div data-testid="disconnected-impact" className="flex flex-col gap-3">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-neutral-200 text-left text-xs text-neutral-600">
            <th scope="col" className="py-2 font-semibold">
              {copy.impactLabel}
            </th>
            <th scope="col" className="py-2 font-semibold">
              {copy.statusLabel}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, kept]) => (
            <tr
              key={label}
              data-kept={kept}
              className="border-b border-neutral-100"
            >
              <td className="py-2 text-neutral-900">{label}</td>
              <td className="py-2">
                <span className={kept ? KEPT : PAUSED}>
                  {kept ? copy.kept : copy.paused}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p
        data-testid="disconnected-impact-note"
        className="rounded-xl bg-neutral-100 px-3 py-2 text-xs text-neutral-700"
      >
        {note}
      </p>
    </div>
  );
}
