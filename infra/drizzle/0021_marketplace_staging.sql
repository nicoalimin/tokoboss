-- Marketplace webhook intake and listing staging (UTA-39 / User Story 20, RFC 04 task 1b1). Additive only.
CREATE TABLE "marketplace_inbound_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL CHECK ("provider" IN ('shopee', 'tiktok_shop', 'blibli')),
	"dedupe_key" text NOT NULL,
	"connection_id" uuid REFERENCES "marketplace_connections"("id") ON DELETE set null,
	"workspace_id" uuid REFERENCES "public"."tenants"("id") ON DELETE cascade,
	"event_type" text NOT NULL,
	"provider_store_id" text,
	"payload" jsonb NOT NULL CHECK (octet_length("payload"::text) <= 65536),
	"status" text DEFAULT 'received' NOT NULL CHECK ("status" IN ('received', 'processed', 'ignored', 'failed')),
	"attempts" integer DEFAULT 0 NOT NULL,
	"processed_at" timestamp with time zone,
	"error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "marketplace_inbound_events_provider_dedupe_unique" ON "marketplace_inbound_events" USING btree ("provider","dedupe_key");
--> statement-breakpoint
CREATE INDEX "marketplace_inbound_events_status_created_idx" ON "marketplace_inbound_events" USING btree ("status","created_at");
--> statement-breakpoint
CREATE TABLE "marketplace_listings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL REFERENCES "public"."tenants"("id") ON DELETE cascade,
	"connection_id" uuid NOT NULL REFERENCES "marketplace_connections"("id") ON DELETE cascade,
	"external_item_id" text NOT NULL,
	"platform_sku_id" text NOT NULL,
	"store_sku_text" text,
	"barcode_hint" text,
	"title" text,
	"variant_name" text,
	"listing_status" text,
	"provider_stock" integer,
	"mapping_state" text DEFAULT 'unmapped' NOT NULL CHECK ("mapping_state" IN ('unmapped', 'suggested', 'ambiguous', 'mapped', 'ignored')),
	"suggested_variant_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "marketplace_listings_connection_platform_sku_unique" ON "marketplace_listings" USING btree ("connection_id","platform_sku_id");
--> statement-breakpoint
CREATE INDEX "marketplace_listings_connection_mapping_state_idx" ON "marketplace_listings" USING btree ("connection_id","mapping_state");
