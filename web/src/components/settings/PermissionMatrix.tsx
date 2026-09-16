import { getSettingsCopy, type SettingsLang } from '@/lib/settings-copy';
import {
  CAPABILITY_KEYS,
  MATRIX_ROLES,
  accessLabel,
  capabilityLabel,
  matrixAccess,
} from '@/lib/role-matrix';

/**
 * Permission matrix table (UTA-74, Story 23).
 *
 * Covers dashboard/reports, products/SKU/stock, orders/fulfillment,
 * purchasing/HPP, integrations, team/RBAC, and billing. Text labels in
 * every cell (never color-only); the table is informational — the server
 * enforces every row.
 */
export function PermissionMatrix({ lang = 'en' }: { lang?: SettingsLang }) {
  const copy = getSettingsCopy(lang);
  return (
    <section aria-labelledby="matrix-heading" data-testid="permission-matrix">
      <h2
        id="matrix-heading"
        className="text-lg font-semibold text-neutral-900"
      >
        {copy.matrixTitle}
      </h2>
      <p className="mt-1 text-sm text-neutral-600">{copy.matrixSubtitle}</p>
      <div className="mt-4 overflow-x-auto rounded-xl border border-neutral-200">
        <table className="w-full min-w-[560px] border-collapse bg-white text-sm">
          <caption className="sr-only">{copy.matrixTitle}</caption>
          <thead>
            <tr className="bg-neutral-50">
              <th
                scope="col"
                className="px-4 py-3 text-left font-semibold text-neutral-700"
              >
                {copy.settingsTitle}
              </th>
              {MATRIX_ROLES.map((role) => (
                <th
                  key={role}
                  scope="col"
                  data-testid={`matrix-head-${role}`}
                  className="px-4 py-3 text-left font-semibold text-neutral-700"
                >
                  {role === 'admin'
                    ? copy.roleAdmin
                    : role === 'manager'
                      ? copy.roleManager
                      : copy.roleStaff}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {CAPABILITY_KEYS.map((cap) => (
              <tr key={cap} data-testid={`matrix-row-${cap}`}>
                <th
                  scope="row"
                  className="px-4 py-3 text-left font-medium text-neutral-900"
                >
                  {capabilityLabel(copy, cap)}
                </th>
                {MATRIX_ROLES.map((role) => (
                  <td
                    key={role}
                    data-testid={`matrix-cell-${cap}-${role}`}
                    className="px-4 py-3 text-neutral-700"
                  >
                    {accessLabel(copy, matrixAccess(cap, role))}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-neutral-500">{copy.matrixNote}</p>
    </section>
  );
}
