import {
  MarketplaceConnectorError,
  type MarketplaceConnectorContext,
} from '@tokoboss/domain';
import { importListingsPage } from './import-listings-page';
import {
  IMPORT_DEFAULT_SLEEP_MS,
  IMPORT_LISTING_CAP,
  IMPORT_MAX_RATE_LIMIT_SLEEPS,
  ORDER_PREVIEW_WINDOW,
  finishInitialImport as finish,
  type InitialImportCursor,
  type InitialImportRef,
  type InitialImportStepResult,
  type RunInitialImportDeps,
} from './initial-import-state';

/**
 * Run one durable initial-import step (US20 / RFC 04 task 32c): locations
 * → listing pages → order preview → capability re-evaluation. Stops when
 * the connection is no longer connected. rate_limited asks the workflow
 * to sleep (≤20 times); more sleeps or over 10,000 listings → incomplete.
 */
export async function runInitialImportStep(
  deps: RunInitialImportDeps,
  input: InitialImportRef & { cursor: InitialImportCursor }
): Promise<InitialImportStepResult> {
  const { workspaceId, connectionId, cursor } = input;
  const row = await deps.connections.find(workspaceId, connectionId);
  const credentials = row && (await deps.vault.open(connectionId));
  if (!row || row.status !== 'connected' || row.removedAt || !credentials) {
    return { kind: 'done', status: 'stopped' };
  }
  const ctx: MarketplaceConnectorContext = {
    provider: row.provider,
    shop: row,
    credentials,
  };
  const connector = deps.connectorFor(row.provider);
  let next: InitialImportCursor;
  try {
    if (cursor.phase === 'locations') {
      await deps.listings.upsertLocations(
        input,
        await connector.listLocations(ctx)
      );
      next = { ...cursor, phase: 'listings' };
    } else if (cursor.phase === 'listings') {
      const page = await importListingsPage(deps, {
        workspaceId,
        connectionId,
        cursor: cursor.listingCursor,
      });
      if (page.outcome === 'skipped')
        return { kind: 'done', status: 'stopped' };
      const listingsImported = cursor.listingsImported + page.imported;
      next = page.nextCursor
        ? { ...cursor, listingCursor: page.nextCursor, listingsImported }
        : { ...cursor, phase: 'orders', listingCursor: null, listingsImported };
      if (page.nextCursor && listingsImported >= IMPORT_LISTING_CAP) {
        await deps.saveCursor(connectionId, next);
        return finish(deps, row, 'incomplete', next);
      }
    } else if (cursor.phase === 'orders') {
      await deps.orderPreviews.replace(
        input,
        await connector.listRecentOrders(ctx, ORDER_PREVIEW_WINDOW)
      );
      next = { ...cursor, phase: 'capabilities' };
    } else {
      const caps = connector.describeCapabilities(row, row.grantedScopes);
      return finish(deps, row, 'complete', cursor, {
        capabilities: caps.capabilities,
        missingPermissions: [...caps.missingPermissions],
      });
    }
  } catch (err) {
    if (
      !(err instanceof MarketplaceConnectorError) ||
      err.kind !== 'rate_limited'
    )
      throw err;
    if (cursor.rateLimitSleeps >= IMPORT_MAX_RATE_LIMIT_SLEEPS)
      return finish(deps, row, 'incomplete', cursor);
    const slept = { ...cursor, rateLimitSleeps: cursor.rateLimitSleeps + 1 };
    await deps.saveCursor(connectionId, slept);
    return {
      kind: 'sleep',
      cursor: slept,
      sleepMs: err.retryAfterMs ?? IMPORT_DEFAULT_SLEEP_MS,
    };
  }
  await deps.saveCursor(connectionId, next);
  return { kind: 'continue', cursor: next, sleepMs: 0 };
}
