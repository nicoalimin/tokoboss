export type CatalogChannelMappingRow =
  typeof catalogChannelMappings.$inferSelect;

export const catalogTransfers = pgTable(
  'catalog_transfers',
  {
    id: uuidPk(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    referenceNum: text('reference_num').notNull(),
    status: text('status').notNull().default('draft'),
    sourceWarehouseId: uuid('source_warehouse_id')
      .notNull()
      .references(() => catalogWarehouses.id, { onDelete: 'restrict' }),
    destWarehouseId: uuid('dest_warehouse_id')
      .notNull()
      .references(() => catalogWarehouses.id, { onDelete: 'restrict' }),
    notes: text('notes'),
    expectedReceiveDate: text('expected_receive_date'),
    version: integer('version').notNull().default(1),
    ...utcTimestamps(),
  },
  (t) => [
    uniqueIndex('catalog_transfers_workspace_ref_unique').on(
      t.workspaceId,
      t.referenceNum
    ),
    index('catalog_transfers_workspace_idx').on(t.workspaceId),
  ]
);

export const catalogTransferItems = pgTable(
  'catalog_transfer_items',
  {
    id: uuidPk(),
    transferId: uuid('transfer_id')
      .notNull()
      .references(() => catalogTransfers.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    variantId: uuid('variant_id')
      .notNull()
      .references(() => catalogVariants.id, { onDelete: 'cascade' }),
    requestedQty: integer('requested_qty').notNull().default(0),
    sentQty: integer('sent_qty').notNull().default(0),
    receivedQty: integer('received_qty').notNull().default(0),
    damagedQty: integer('damaged_qty').notNull().default(0),
    cancellationReason: text('cancellation_reason'),
    version: integer('version').notNull().default(1),
    ...utcTimestamps(),
  },
  (t) => [
    index('catalog_transfer_items_transfer_idx').on(t.transferId),
    index('catalog_transfer_items_workspace_variant_idx').on(
      t.workspaceId,
      t.variantId
    ),
  ]
);

export type CatalogTransferRow = typeof catalogTransfers.$inferSelect;
export type NewCatalogTransferRow = typeof catalogTransfers.$inferInsert;
export type CatalogTransferItemRow = typeof catalogTransferItems.$inferSelect;
export type NewCatalogTransferItemRow =
  typeof catalogTransferItems.$inferInsert;
