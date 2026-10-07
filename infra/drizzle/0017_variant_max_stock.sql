-- Add max_stock_qty for optional replenishment cap (UTA-146 Slice 1f / Story 11)
ALTER TABLE "catalog_variants" ADD COLUMN "max_stock_qty" integer;
--> statement-breakpoint
