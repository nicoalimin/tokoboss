-- SKU mapping provenance + append-only mapping history (UTA-40 / User Story 03, RFC 05 task 1). Additive only.
ALTER TABLE "catalog_channel_mappings" ADD COLUMN "connection_id" uuid REFERENCES "marketplace_connections"("id") ON DELETE set null;
--> statement-breakpoint
ALTER TABLE "catalog_channel_mappings" ADD COLUMN "external_item_id" text;
--> statement-breakpoint
ALTER TABLE "catalog_channel_mappings" ADD COLUMN "variant_name" text;
--> statement-breakpoint
ALTER TABLE "catalog_channel_mappings" ADD COLUMN "mapped_by" text;
--> statement-breakpoint
ALTER TABLE "catalog_channel_mappings" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
CREATE TABLE "catalog_channel_mapping_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL REFERENCES "public"."tenants"("id") ON DELETE cascade,
	"mapping_id" uuid REFERENCES "catalog_channel_mappings"("id") ON DELETE set null,
	"variant_id" uuid NOT NULL REFERENCES "catalog_variants"("id") ON DELETE cascade,
	"previous_variant_id" uuid REFERENCES "catalog_variants"("id") ON DELETE set null,
	"connection_id" uuid REFERENCES "marketplace_connections"("id") ON DELETE set null,
	"channel" text NOT NULL CHECK ("channel" IN ('shopee', 'tiktok_shop', 'blibli')),
	"shop_ext_id" text NOT NULL,
	"external_item_id" text,
	"platform_sku_id" text NOT NULL,
	"store_sku_text" text,
	"listing_title" text,
	"variant_name" text,
	"action" text NOT NULL CHECK ("action" IN ('mapped', 'remapped', 'unmapped', 'bulk_mapped', 'restored')),
	"source" text NOT NULL CHECK ("source" IN ('manual', 'suggested_single', 'suggested_bulk')),
	"actor_id" text NOT NULL,
	"correlation_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "catalog_mapping_events_workspace_created_idx" ON "catalog_channel_mapping_events" USING btree ("workspace_id","created_at" DESC);
--> statement-breakpoint
CREATE INDEX "catalog_mapping_events_workspace_variant_created_idx" ON "catalog_channel_mapping_events" USING btree ("workspace_id","variant_id","created_at" DESC);
