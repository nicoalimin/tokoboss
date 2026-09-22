/**
 * Transfer status value object (UTA-75, Story 04).
 *
 * Represents the lifecycle of a warehouse transfer: draft → sent →
 * (received|cancelled), enforcing valid transitions at the domain boundary.
 */
export type TransferStatus = 'draft' | 'sent' | 'received' | 'cancelled';

/**
 * Allowed transitions for the transfer state machine.
 * draft → sent, cancelled
 * sent → received, cancelled (partial receive ok)
 * received → (no further transitions)
 * cancelled → (no further transitions)
 */
export const TRANSFER_STATUSES: readonly TransferStatus[] = [
  'draft',
  'sent',
  'received',
  'cancelled',
] as const;

/**
 * Returns all valid transitions from a given status.
 * Used by business rules to validate status changes.
 */
export function getValidTransitions(
  currentStatus: TransferStatus
): readonly TransferStatus[] {
  switch (currentStatus) {
    case 'draft':
      return ['sent', 'cancelled'];
    case 'sent':
      return ['received', 'cancelled'];
    case 'received':
      return [];
    case 'cancelled':
      return [];
  }
}

/**
 * Validates whether a status transition is allowed.
 * @throws Error if the transition is not allowed
 */
export function isTransitionAllowed(
  currentStatus: TransferStatus,
  newStatus: TransferStatus
): boolean {
  const allowed = getValidTransitions(currentStatus);
  return allowed.includes(newStatus);
}
