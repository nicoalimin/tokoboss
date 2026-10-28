-- Outbound inventory sync state (1:1 per SKU mapping) + append-only sync events (UTA-37 / User Story 04, RFC 06 task 15). Additive only.
CREATE TABLE "marketplace_inventory_sync_states" (
	"mapping_id" uuid PRIMARY KEY NOT NULL REFERENCES "catalog_channel_mappings"("id") ON DELETE cascade,
	"workspace_id" uuid NOT NULL REFERENCES "public"."tenants"("id") ON DELETE cascade,
	"variant_id" uuid NOT NULL REFERENCES "catalog_variants"("id") ON DELETE cascade,
	"connection_id" uuid REFERENCES "marketplace_connections"("id") ON DELETE set null,
	"sync_enabled" boolean DEFAULT false NOT NULL,
	"stock_buffer" integer DEFAULT 0 NOT NULL CHECK ("stock_buffer" >= 0 AND "stock_buffer" <= 100000),
	"allocation_pct" integer DEFAULT 100 NOT NULL CHECK ("allocation_pct" >= 1 AND "allocation_pct" <= 100),
	"sync_status" text DEFAULT 'off' NOT NULL CHECK ("sync_status" IN ('off', 'syncing', 'synced', 'needs_attention')),
	"desired_qty" integer,
	"last_pushed_qty" integer,
	"last_synced_at" timestamp with time zone,
	"last_error_code" text,
	"last_error_message" text,
	"sync_seq" integer DEFAULT 0 NOT NULL,
	"last_pushed_seq" integer DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "marketplace_sync_states_workspace_status_idx" ON "marketplace_inventory_sync_states" USING btree ("workspace_id","sync_status");
--> statement-breakpoint
CREATE INDEX "marketplace_sync_states_workspace_variant_idx" ON "marketplace_inventory_sync_states" USING btree ("workspace_id","variant_id");
--> statement-breakpoint
CREATE INDEX "marketplace_sync_states_connection_idx" ON "marketplace_inventory_sync_states" USING btree ("connection_id");
--> statement-breakpoint
CREATE TABLE "marketplace_inventory_sync_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL REFERENCES "public"."tenants"("id") ON DELETE cascade,
	"mapping_id" uuid NOT NULL REFERENCES "catalog_channel_mappings"("id") ON DELETE cascade,
	"variant_id" uuid NOT NULL REFERENCES "catalog_variants"("id") ON DELETE cascade,
	"connection_id" uuid REFERENCES "marketplace_connections"("id") ON DELETE set null,
	"channel" text NOT NULL CHECK ("channel" IN ('shopee', 'tiktok_shop', 'blibli')),
	"shop_ext_id" text NOT NULL,
	"platform_sku_id" text NOT NULL,
	"sync_seq" integer NOT NULL,
	"trigger" text NOT NULL CHECK ("trigger" IN ('stock_adjustment', 'transfer_send', 'transfer_receive', 'transfer_cancel', 'stock_count_post', 'config_change', 'manual_retry', 'location_link')),
	"outcome" text NOT NULL CHECK ("outcome" IN ('synced', 'needs_attention', 'skipped_stale')),
	"desired_qty" integer NOT NULL,
	"pushed_qty" integer,
	"error_code" text,
	"error_message" text,
	"actor_id" text,
	"correlation_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "marketplace_sync_events_workspace_created_idx" ON "marketplace_inventory_sync_events" USING btree ("workspace_id","created_at" DESC);
--> statement-breakpoint
CREATE INDEX "marketplace_sync_events_mapping_created_idx" ON "marketplace_inventory_sync_events" USING btree ("mapping_id","created_at" DESC);
