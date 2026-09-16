import { BusinessRuleViolationError } from '../errors/domain-error';

/**
 * Bundle / BOM domain rules (UTA-79, Story 13).
 *
 * Pure business rules with no framework dependencies. A sellable bundle is
 * a catalog variant (one SKU TokoBoss) composed of component variant lines
 * with quantities. SKU TokoBoss remains the identity for components; the
 * bundle sells as a composed SKU.
 *
 * The application layer resolves the facts (variant rows, existing BOM
 * graph) and delegates the decisions here so Postgres and in-memory stores
 * share identical semantics.
 */
export const BundleRules = {
  /**
   * Every BOM line needs a positive integer quantity — a bundle consumes
   * `qty` units of the component per assembled unit.
   */
  assertLineQtyAllowed(qty: number): void {
    if (!Number.isInteger(qty) || qty <= 0) {
      throw new BusinessRuleViolationError(
        'BOM line quantity must be a positive integer'
      );
    }
  },

  /** A bundle cannot contain itself. */
  assertNoSelfReference(input: {
    bundleVariantId: string;
    componentVariantId: string;
  }): void {
    if (input.bundleVariantId === input.componentVariantId) {
      throw new BusinessRuleViolationError(
        'A bundle cannot contain itself as a component'
      );
    }
  },

  /** One component appears at most once per bundle (bump qty instead). */
  assertUniqueComponents(componentIds: string[]): void {
    if (new Set(componentIds).size !== componentIds.length) {
      throw new BusinessRuleViolationError(
        'A component may appear only once per bundle'
      );
    }
  },

  /**
   * A bundle cannot transitively contain itself. `reachesBundle` answers
   * whether `componentId` (itself possibly a bundle) can reach
   * `bundleVariantId` through the existing BOM graph — the use-case
   * supplies the lookup so this stays a pure predicate.
   */
  assertNoCycle(input: {
    bundleVariantId: string;
    componentVariantId: string;
    reachesBundle: (componentId: string, bundleId: string) => boolean;
  }): void {
    if (input.reachesBundle(input.componentVariantId, input.bundleVariantId)) {
      throw new BusinessRuleViolationError(
        'BOM cycle detected: a component already contains this bundle'
      );
    }
  },

  /** Only active components may join a BOM (archived SKUs are frozen). */
  assertComponentActive(input: { componentId: string; status: string }): void {
    if (input.status !== 'active') {
      throw new BusinessRuleViolationError(
        'BOM components must be active variants'
      );
    }
  },

  /** The bundle shell itself must be an active variant to hold a BOM. */
  assertBundleActive(status: string): void {
    if (status !== 'active') {
      throw new BusinessRuleViolationError(
        'BOM requires an active bundle variant'
      );
    }
  },

  /**
   * Bundle variants hold no direct stock — on-hand lives on the
   * components. Adjust the component variants instead; bundle
   * availability derives from them (see `bundle-availability`).
   */
  assertDirectStockAllowed(isBundle: boolean): void {
    if (isBundle) {
      throw new BusinessRuleViolationError(
        'Bundle variants hold no direct stock; adjust the components instead'
      );
    }
  },
} as const;

/**
 * Depth-first reachability over a BOM adjacency map
 * (`bundleVariantId -> componentVariantId[]`). Used by use-cases to feed
 * `assertNoCycle` without pulling graph code into the domain rules.
 */
export function bomReaches(
  adjacency: ReadonlyMap<string, readonly string[]>,
  fromId: string,
  targetId: string
): boolean {
  const visited = new Set<string>();
  const stack = [fromId];
  while (stack.length > 0) {
    const current = stack.pop() as string;
    if (current === targetId) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    for (const next of adjacency.get(current) ?? []) {
      if (!visited.has(next)) stack.push(next);
    }
  }
  return false;
}
