import {
  bomReaches,
  BundleRules,
  BusinessRuleViolationError,
} from '@tokoboss/domain';
import type { WorkspaceContext } from '../tenancy/tenancy-types';
import {
  assertManagerOrAdmin,
  assertSameWorkspace,
} from '../tenancy/workspace-context';
import { catalogNotFound } from '../catalog/catalog-errors';
import type { CatalogStore } from '../catalog/catalog-ports';
import type {
  CatalogVariantRecord,
  InventoryLevelRecord,
} from '../catalog/catalog-types';
import {
  bundleConflict,
  bundleCycle,
  bundleNotFound,
  bundleValidation,
} from './bundle-errors';
import type {
  BundleAvailabilityRecord,
  BundleLineRecord,
  NewBundleLineInput,
} from './bundle-types';

/**
 * Bundle / BOM use-cases (UTA-79, Story 13).
 *
 * A bundle is a catalog variant (one SKU TokoBoss) that sells as a
 * composition of component variants. Every use-case takes the path
 * `workspaceId` explicitly and asserts it against the server-resolved
 * `ctx` (never trusts client claims). RBAC mirrors catalog: reads need
 * active membership; BOM writes need Manager/Admin.
 *
 * Guardrails (all enforced here, both stores):
 * - bundle shell + every component must exist and be `active`
 * - ≥1 components, each `(component, qty)` unique per bundle, qty ≥ 1
 * - no self-reference, no transitive cycles through other bundles
 * - optimistic concurrency via the bundle variant's `version`
 */

export interface BundleLineDetail {
  line: BundleLineRecord;
  component: CatalogVariantRecord;
}

export interface BundleDetail {
  bundle: CatalogVariantRecord;
  lines: BundleLineDetail[];
  /** Per-warehouse sellable units from component on-hand. */
  availability: BundleAvailabilityRecord[];
}

export interface BundleSummary {
  bundle: CatalogVariantRecord;
  lines: BundleLineDetail[];
}

function cleanComponentId(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw bundleValidation('Component variant id must not be empty');
  }
  return value.trim();
}

interface ValidatedLine {
  componentVariantId: string;
  qty: number;
}

function validateLinesInput(raw: unknown): ValidatedLine[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw bundleValidation('A bundle needs at least one component');
  }
  if (raw.length > 100) {
    throw bundleValidation('A bundle holds at most 100 components');
  }
  return raw.map((entry) => {
    if (typeof entry !== 'object' || entry === null) {
      throw bundleValidation('Component must be an object');
    }
    const rec = entry as Record<string, unknown>;
    const qty = rec['qty'];
    try {
      BundleRules.assertLineQtyAllowed(
        typeof qty === 'number' ? qty : Number.NaN
      );
    } catch (err) {
      throw bundleValidation(
        err instanceof Error ? err.message : 'Component qty is invalid'
      );
    }
    return {
      componentVariantId: cleanComponentId(rec['componentVariantId']),
      qty: qty as number,
    };
  });
}

function asCycleOrValidation(err: unknown): Error & { code: string } {
  if (err instanceof BusinessRuleViolationError) {
    if (
      err.message.includes('itself') ||
      err.message.includes('cycle') ||
      err.message.includes('Cycle')
    ) {
      return bundleCycle(err.message);
    }
    if (err.message.includes('only once')) {
      return bundleConflict(err.message);
    }
    return bundleValidation(err.message);
  }
  throw err;
}

/**
 * Load the workspace BOM adjacency map with `bundleId` edges replaced by
 * `proposed` (the lines being written). Pure traversal input for
 * `bomReaches` — lets cycle checks see the write as-if committed.
 */
async function adjacencyWithProposed(
  store: CatalogStore,
  workspaceId: string,
  bundleId: string,
  proposed: ValidatedLine[]
): Promise<Map<string, string[]>> {
  const all = await store.listBundlesByWorkspace(workspaceId);
  const adjacency = new Map<string, string[]>();
  for (const line of all) {
    if (line.bundleVariantId === bundleId) continue;
    const list = adjacency.get(line.bundleVariantId) ?? [];
    list.push(line.componentVariantId);
    adjacency.set(line.bundleVariantId, list);
  }
  adjacency.set(
    bundleId,
    proposed.map((l) => l.componentVariantId)
  );
  return adjacency;
}

async function assertComponentsUsable(
  store: CatalogStore,
  input: {
    workspaceId: string;
    bundleVariantId: string;
    bundleStatus: string;
    lines: ValidatedLine[];
  }
): Promise<Map<string, CatalogVariantRecord>> {
  try {
    BundleRules.assertBundleActive(input.bundleStatus);
    BundleRules.assertUniqueComponents(
      input.lines.map((l) => l.componentVariantId)
    );
    for (const line of input.lines) {
      BundleRules.assertLineQtyAllowed(line.qty);
      BundleRules.assertNoSelfReference({
        bundleVariantId: input.bundleVariantId,
        componentVariantId: line.componentVariantId,
      });
    }
  } catch (err) {
    throw asCycleOrValidation(err);
  }

  const adjacency = await adjacencyWithProposed(
    store,
    input.workspaceId,
    input.bundleVariantId,
    input.lines
  );
  for (const line of input.lines) {
    try {
      BundleRules.assertNoCycle({
        bundleVariantId: input.bundleVariantId,
        componentVariantId: line.componentVariantId,
        reachesBundle: (from, target) => bomReaches(adjacency, from, target),
      });
    } catch (err) {
      throw asCycleOrValidation(err);
    }
  }

  const components = new Map<string, CatalogVariantRecord>();
  for (const line of input.lines) {
    const component = await store.findVariantById(
      input.workspaceId,
      line.componentVariantId
    );
    if (!component) throw catalogNotFound('Variant');
    try {
      BundleRules.assertComponentActive({
        componentId: component.id,
        status: component.status,
      });
    } catch (err) {
      throw asCycleOrValidation(err);
    }
    components.set(component.id, component);
  }
  return components;
}

function toNewLines(lines: ValidatedLine[]): NewBundleLineInput[] {
  return lines.map((l) => ({
    componentVariantId: l.componentVariantId,
    qty: l.qty,
  }));
}

async function loadDetail(
  store: CatalogStore,
  workspaceId: string,
  bundle: CatalogVariantRecord
): Promise<BundleDetail> {
  const lines = await store.listBundleLines(workspaceId, bundle.id);
  const detail: BundleLineDetail[] = [];
  for (const line of lines) {
    const component = await store.findVariantById(
      workspaceId,
      line.componentVariantId
    );
    // A line's component is workspace-scoped by FK; a miss here means
    // corrupt data (components are never hard-deleted), so surface it.
    if (!component) throw catalogNotFound('Variant');
    detail.push({ line, component });
  }
  return {
    bundle,
    lines: detail,
    availability: await availabilityFor(store, workspaceId, lines),
  };
}

/**
 * Per-warehouse sellable units: `min(floor(onHand / required))` across
 * components. Missing level rows count as zero on-hand. Every workspace
 * warehouse is reported so the sell surface never hides a zero.
 */
async function availabilityFor(
  store: CatalogStore,
  workspaceId: string,
  lines: BundleLineRecord[]
): Promise<BundleAvailabilityRecord[]> {
  const warehouses = await store.listWarehouses(workspaceId);
  if (lines.length === 0 || warehouses.length === 0) {
    return warehouses.map((w) => ({ warehouseId: w.id, available: 0 }));
  }
  const levelsByComponent = new Map<string, InventoryLevelRecord[]>();
  for (const line of lines) {
    levelsByComponent.set(
      line.componentVariantId,
      await store.listLevelsByVariant(workspaceId, line.componentVariantId)
    );
  }
  return warehouses.map((w) => {
    let available = Number.POSITIVE_INFINITY;
    for (const line of lines) {
      const levels = levelsByComponent.get(line.componentVariantId) ?? [];
      const onHand = levels.find((l) => l.warehouseId === w.id)?.qty ?? 0;
      available = Math.min(available, Math.floor(onHand / line.qty));
    }
    return {
      warehouseId: w.id,
      available: Number.isFinite(available) ? available : 0,
    };
  });
}

/**
 * Define the BOM of a bundle variant (Manager/Admin). The variant must be
 * active and BOM-less (update or archive-then-recreate to change it).
 */
export async function createBundle(
  store: CatalogStore,
  input: {
    ctx: WorkspaceContext;
    workspaceId: string;
    bundleVariantId: string;
    components: unknown;
    expectedVersion: number;
  }
): Promise<BundleDetail> {
  assertSameWorkspace(input.ctx, input.workspaceId);
  assertManagerOrAdmin(input.ctx);
  const bundle = await store.findVariantById(
    input.workspaceId,
    input.bundleVariantId
  );
  if (!bundle) throw catalogNotFound('Variant');
  const existing = await store.listBundleLines(input.workspaceId, bundle.id);
  if (existing.length > 0) {
    throw bundleConflict('Bundle already has a BOM; update it instead.');
  }
  const lines = validateLinesInput(input.components);
  await assertComponentsUsable(store, {
    workspaceId: input.workspaceId,
    bundleVariantId: bundle.id,
    bundleStatus: bundle.status,
    lines,
  });
  const stored = await store.replaceBundleLines(
    input.workspaceId,
    bundle.id,
    toNewLines(lines),
    input.expectedVersion
  );
  const refreshed = await store.findVariantById(input.workspaceId, bundle.id);
  if (!refreshed) throw catalogNotFound('Variant');
  void stored;
  return loadDetail(store, input.workspaceId, refreshed);
}

/**
 * Replace the full BOM of a bundle variant (Manager/Admin). The variant
 * must be active and already hold a BOM; `expectedVersion` must match the
 * bundle variant's current version.
 */
export async function updateBundle(
  store: CatalogStore,
  input: {
    ctx: WorkspaceContext;
    workspaceId: string;
    bundleVariantId: string;
    components: unknown;
    expectedVersion: number;
  }
): Promise<BundleDetail> {
  assertSameWorkspace(input.ctx, input.workspaceId);
  assertManagerOrAdmin(input.ctx);
  const bundle = await store.findVariantById(
    input.workspaceId,
    input.bundleVariantId
  );
  if (!bundle) throw catalogNotFound('Variant');
  const existing = await store.listBundleLines(input.workspaceId, bundle.id);
  if (existing.length === 0) throw bundleNotFound();
  const lines = validateLinesInput(input.components);
  await assertComponentsUsable(store, {
    workspaceId: input.workspaceId,
    bundleVariantId: bundle.id,
    bundleStatus: bundle.status,
    lines,
  });
  await store.replaceBundleLines(
    input.workspaceId,
    bundle.id,
    toNewLines(lines),
    input.expectedVersion
  );
  const refreshed = await store.findVariantById(input.workspaceId, bundle.id);
  if (!refreshed) throw catalogNotFound('Variant');
  return loadDetail(store, input.workspaceId, refreshed);
}

/**
 * Archive a bundle BOM (idempotent removal of every line, Manager/Admin).
 * The bundle variant itself keeps its status — use the catalog archive
 * endpoints to retire the SKU. Clearing an already-empty BOM is a no-op
 * that returns the current detail.
 */
export async function archiveBundle(
  store: CatalogStore,
  input: {
    ctx: WorkspaceContext;
    workspaceId: string;
    bundleVariantId: string;
    expectedVersion: number;
  }
): Promise<BundleDetail> {
  assertSameWorkspace(input.ctx, input.workspaceId);
  assertManagerOrAdmin(input.ctx);
  const bundle = await store.findVariantById(
    input.workspaceId,
    input.bundleVariantId
  );
  if (!bundle) throw catalogNotFound('Variant');
  const existing = await store.listBundleLines(input.workspaceId, bundle.id);
  if (existing.length === 0) {
    return loadDetail(store, input.workspaceId, bundle);
  }
  await store.clearBundleLines(
    input.workspaceId,
    bundle.id,
    input.expectedVersion
  );
  const refreshed = await store.findVariantById(input.workspaceId, bundle.id);
  if (!refreshed) throw catalogNotFound('Variant');
  return loadDetail(store, input.workspaceId, refreshed);
}

/** Bundle detail with components + per-warehouse availability (any member). */
export async function getBundleDetail(
  store: CatalogStore,
  input: { ctx: WorkspaceContext; workspaceId: string; bundleVariantId: string }
): Promise<BundleDetail> {
  assertSameWorkspace(input.ctx, input.workspaceId);
  const bundle = await store.findVariantById(
    input.workspaceId,
    input.bundleVariantId
  );
  if (!bundle) throw catalogNotFound('Variant');
  const lines = await store.listBundleLines(input.workspaceId, bundle.id);
  if (lines.length === 0) throw bundleNotFound();
  return loadDetail(store, input.workspaceId, bundle);
}

/** Every bundle in the workspace with its components (any member). */
export async function listBundles(
  store: CatalogStore,
  input: { ctx: WorkspaceContext; workspaceId: string; limit?: number }
): Promise<BundleSummary[]> {
  assertSameWorkspace(input.ctx, input.workspaceId);
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 100);
  const allLines = await store.listBundlesByWorkspace(input.workspaceId);
  const bundleIds = [...new Set(allLines.map((l) => l.bundleVariantId))].slice(
    0,
    limit
  );
  const out: BundleSummary[] = [];
  for (const bundleId of bundleIds) {
    const bundle = await store.findVariantById(input.workspaceId, bundleId);
    if (!bundle) continue;
    const lines = allLines.filter((l) => l.bundleVariantId === bundleId);
    const detail: BundleLineDetail[] = [];
    for (const line of lines) {
      const component = await store.findVariantById(
        input.workspaceId,
        line.componentVariantId
      );
      if (!component) continue;
      detail.push({ line, component });
    }
    out.push({ bundle, lines: detail });
  }
  return out;
}

/**
 * Archive guard shared by the catalog removal paths: an *active* bundle
 * that consumes `variantId` blocks archiving it. Returns the blocking
 * bundle variant ids (empty = safe to archive).
 */
export async function activeBundlesUsing(
  store: CatalogStore,
  workspaceId: string,
  variantId: string
): Promise<string[]> {
  const usages = await store.listBundlesUsingComponent(workspaceId, variantId);
  const blockers: string[] = [];
  for (const usage of usages) {
    const bundle = await store.findVariantById(
      workspaceId,
      usage.bundleVariantId
    );
    if (bundle && bundle.status === 'active') blockers.push(bundle.id);
  }
  return blockers;
}
