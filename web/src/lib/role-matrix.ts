/**
 * Role cards + permission matrix model (UTA-74, Story 23).
 *
 * Pure, UI-safe model over the UTA-17 RBAC freeze (Admin / Manager / Staff
 * only; Admin never warehouse-scoped). The matrix is informational — the
 * server (`requireWorkspaceAdmin`, tenancy use-cases) remains the security
 * boundary. No secrets, no PII, no workspace ids in this module.
 */

import type { SettingsCopy } from './settings-copy';

export type MatrixRole = 'admin' | 'manager' | 'staff';

/** Cell semantics rendered with text labels (never color-only). */
export type MatrixAccess = 'full' | 'scoped' | 'view' | 'none';

export type CapabilityKey =
  | 'dashboard'
  | 'products'
  | 'orders'
  | 'purchasing'
  | 'integrations'
  | 'team'
  | 'billing';

export const CAPABILITY_KEYS: CapabilityKey[] = [
  'dashboard',
  'products',
  'orders',
  'purchasing',
  'integrations',
  'team',
  'billing',
];

export const MATRIX_ROLES: MatrixRole[] = ['admin', 'manager', 'staff'];

/**
 * Permission matrix. Read row-wise: each capability maps every role to an
 * access level. Invariants (asserted in tests):
 * - Admin is `full` everywhere.
 * - Team/RBAC and billing are Admin-only (`none` for manager/staff).
 * - Manager/Staff never exceed `scoped` outside dashboard/products/orders.
 */
export const PERMISSION_MATRIX: Record<
  CapabilityKey,
  Record<MatrixRole, MatrixAccess>
> = {
  dashboard: { admin: 'full', manager: 'scoped', staff: 'view' },
  products: { admin: 'full', manager: 'scoped', staff: 'scoped' },
  orders: { admin: 'full', manager: 'scoped', staff: 'scoped' },
  purchasing: { admin: 'full', manager: 'scoped', staff: 'view' },
  integrations: { admin: 'full', manager: 'view', staff: 'none' },
  team: { admin: 'full', manager: 'none', staff: 'none' },
  billing: { admin: 'full', manager: 'none', staff: 'none' },
};

export function matrixAccess(
  capability: CapabilityKey,
  role: MatrixRole
): MatrixAccess {
  return PERMISSION_MATRIX[capability][role];
}

/** True when the role may open team-management controls (Admin only). */
export function canManageTeam(
  role: MatrixRole | string | null | undefined
): boolean {
  return role === 'admin';
}

/** True when the role may open billing (Admin only). */
export function canViewBilling(
  role: MatrixRole | string | null | undefined
): boolean {
  return role === 'admin';
}

/** Capability label from settings copy (never echoes ids). */
export function capabilityLabel(
  copy: SettingsCopy,
  key: CapabilityKey
): string {
  switch (key) {
    case 'dashboard':
      return copy.capDashboard;
    case 'products':
      return copy.capProducts;
    case 'orders':
      return copy.capOrders;
    case 'purchasing':
      return copy.capPurchasing;
    case 'integrations':
      return copy.capIntegrations;
    case 'team':
      return copy.capTeam;
    case 'billing':
      return copy.capBilling;
  }
}

/** Access-level label from settings copy (text, never color-only). */
export function accessLabel(copy: SettingsCopy, access: MatrixAccess): string {
  switch (access) {
    case 'full':
      return copy.accessFull;
    case 'scoped':
      return copy.accessScoped;
    case 'view':
      return copy.accessView;
    case 'none':
      return copy.accessNone;
  }
}

/** Pastel card tones per role (readable, always paired with a text label). */
export interface RoleCardTones {
  card: string;
  text: string;
}

export function roleCardTones(role: MatrixRole): RoleCardTones {
  if (role === 'admin')
    return { card: 'bg-primary-100', text: 'text-primary-800' };
  if (role === 'manager') return { card: 'bg-info-100', text: 'text-info-800' };
  return { card: 'bg-neutral-100', text: 'text-neutral-700' };
}
