/**
 * Stock-opname error codes (US12 / RFC 03 task 6b).
 * Mapped to HTTP at the web boundary. Messages are client-safe.
 */

export type StockCountErrorCode =
  | 'STOCK_COUNT_NOT_FOUND'
  | 'STOCK_COUNT_OVERLAP'
  | 'STOCK_COUNT_VERSION_CONFLICT'
  | 'STOCK_COUNT_FREEZE'
  | 'STOCK_COUNT_ACTIVE'
  | 'STOCK_COUNT_VALIDATION';

type Details = { currentVersion?: number; existingSessionId?: string };

function scErr(
  message: string,
  code: StockCountErrorCode,
  details?: Details
): Error & { code: StockCountErrorCode; details?: Details } {
  const err = new Error(message) as Error & {
    code: StockCountErrorCode;
    details?: Details;
  };
  err.code = code;
  if (details !== undefined) err.details = details;
  return err;
}

/** Unknown / out-of-scope session → 404 (no enumeration). */
export const stockCountNotFound = () =>
  scErr('Stock count session not found.', 'STOCK_COUNT_NOT_FOUND');

/** Overlapping open line for warehouse+SKU → 409. */
export const stockCountOverlap = (existingSessionId: string) =>
  scErr('SKU already in an open stock count session.', 'STOCK_COUNT_OVERLAP', {
    existingSessionId,
  });

/** Stale session version → 409. */
export const stockCountVersionConflict = (currentVersion: number) =>
  scErr(
    'This session changed. Reload and try again.',
    'STOCK_COUNT_VERSION_CONFLICT',
    { currentVersion }
  );

/** Outbound transfer blocked by freeze → 409. */
export const stockCountFreeze = () =>
  scErr('Gudang sedang stock opname', 'STOCK_COUNT_FREEZE');

/** Warehouse deactivate blocked by open session → 409. */
export const stockCountActive = (warehouseName: string, sessionCode: string) =>
  scErr(
    `Gudang ${warehouseName} tidak dapat dinonaktifkan: ada sesi stock opname aktif (${sessionCode})`,
    'STOCK_COUNT_ACTIVE'
  );

/** Field / state validation → 400. */
export const stockCountValidation = (message: string) =>
  scErr(message, 'STOCK_COUNT_VALIDATION');
