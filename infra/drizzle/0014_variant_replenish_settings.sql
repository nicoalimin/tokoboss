-- Add min_stock_qty for replenishment threshold
ALTER TABLE "catalog_variants" ADD COLUMN "min_stock_qty" integer;
--> statement-breakpoint

-- Add lead_time_days for supplier lead time estimation
ALTER TABLE "catalog_variants" ADD COLUMN "lead_time_days" integer;
--> statement-breakpoint
