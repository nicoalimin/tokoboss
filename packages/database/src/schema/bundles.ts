import {
  index,
  integer,
  pgTable,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { tenants } from './tenants';
import { catalogVariants } from './catalog';
import { utcTimestamps, uuidPk } from './helpers';

/**
 * Bundle / BOM lines (UTA-79, Story 13).
 *
 * One row = one BOM line: bundle variant → component variant × qty.
 * Both ends are workspace-scoped FKs to `catalog_variants`; `qty` is the
 * units of the component consumed per assembled bundle unit.
 *
 * - `UNIQUE (bundle_variant_id, component_variant_id)`: a component
 *   appears at most once per bundle (bump qty instead of duplicating).
 * - No self-reference / cycle guards in DDL — those need graph traversal
 *   and live in the application use-cases (both stores share them).
 * - Removal is through the archive path (`clearBundleLines`); there is no
 *   delete endpoint for single lines (replace the whole BOM instead).
 * - Optimistic concurrency rides on the bundle variant's `version`
 *   (checked + bumped atomically with the line writes in
 *   `DrizzleCatalogStore`), so this table carries no version of its own.
 */
export const catalogBundleLines = pgTable(
  'catalog_bundle_lines',
  {
    id: uuidPk(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    bundleVariantId: uuid('bundle_variant_id')
      .notNull()
      .references(() => catalogVariants.id, { onDelete: 'cascade' }),
    componentVariantId: uuid('component_variant_id')
      .notNull()
      .references(() => catalogVariants.id, { onDelete: 'restrict' }),
    qty: integer('qty').notNull(),
    ...utcTimestamps(),
  },
  (t) => [
    uniqueIndex('catalog_bundle_lines_bundle_component_unique').on(
      t.bundleVariantId,
      t.componentVariantId
    ),
    index('catalog_bundle_lines_workspace_bundle_idx').on(
      t.workspaceId,
      t.bundleVariantId
    ),
    index('catalog_bundle_lines_workspace_component_idx').on(
      t.workspaceId,
      t.componentVariantId
    ),
  ]
);

export type CatalogBundleLineRow = typeof catalogBundleLines.$inferSelect;
export type NewCatalogBundleLineRow = typeof catalogBundleLines.$inferInsert;
