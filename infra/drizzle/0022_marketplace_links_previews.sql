-- Marketplace location links, PII-free order previews, mapping archive flag (UTA-39 / User Story 20, RFC 04 task 1b2). Additive only.
CREATE TABLE "marketplace_location_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL REFERENCES "public"."tenants"("id") ON DELETE cascade,
	"connection_id" uuid NOT NULL REFERENCES "marketplace_connections"("id") ON DELETE cascade,
	"external_location_id" text NOT NULL,
	"name" text,
	"warehouse_id" uuid REFERENCES "catalog_warehouses"("id") ON DELETE set null,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "marketplace_location_links_connection_location_unique" ON "marketplace_location_links" USING btree ("connection_id","external_location_id");
--> statement-breakpoint
CREATE TABLE "marketplace_order_previews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL REFERENCES "public"."tenants"("id") ON DELETE cascade,
	"connection_id" uuid NOT NULL REFERENCES "marketplace_connections"("id") ON DELETE cascade,
	"external_order_id" text NOT NULL,
	"provider_status" text,
	"ordered_at" timestamp with time zone,
	"line_count" integer DEFAULT 0 NOT NULL,
	"total_cents" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "marketplace_order_previews_connection_order_unique" ON "marketplace_order_previews" USING btree ("connection_id","external_order_id");
--> statement-breakpoint
ALTER TABLE "catalog_channel_mappings" ADD COLUMN "archived_at" timestamp with time zone;
