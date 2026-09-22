-- Add Gudang/warehouse transfer state machine and inter-warehouse transfers
CREATE TABLE "catalog_transfer_headers" (
	"id" uuid NOT NULL PRIMARY KEY,
	"workspace_id" uuid NOT NULL REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action,
	"transfer_number" text NOT NULL,
	"source_warehouse_id" uuid NOT NULL,
	"destination_warehouse_id" uuid NOT NULL,
	"status" text NOT NULL CHECK ("status" IN ('draft', 'sent', 'received', 'cancelled')) DEFAULT 'draft',
	"version" integer NOT NULL DEFAULT 1,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_transfer_headers_workspace_transfer_unique" ON "catalog_transfer_headers" USING btree ("workspace_id","transfer_number");
--> statement-breakpoint
CREATE INDEX "catalog_transfer_headers_workspace_status_idx" ON "catalog_transfer_headers" USING btree ("workspace_id", "status");
--> statement-breakpoint
CREATE INDEX "catalog_transfer_headers_source_idx" ON "catalog_transfer_headers" USING btree ("source_warehouse_id");
--> statement-breakpoint
CREATE INDEX "catalog_transfer_headers_dest_idx" ON "catalog_transfer_headers" USING btree ("destination_warehouse_id");
--> statement-breakpoint
ALTER TABLE "catalog_transfer_headers" ADD CONSTRAINT "catalog_transfer_headers_source_active_fk" FOREIGN KEY ("source_warehouse_id") REFERENCES "catalog_warehouses"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "catalog_transfer_headers" ADD CONSTRAINT "catalog_transfer_headers_dest_active_fk" FOREIGN KEY ("destination_warehouse_id") REFERENCES "catalog_warehouses"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint

CREATE TABLE "catalog_transfer_lines" (
	"id" uuid NOT NULL PRIMARY KEY,
	"workspace_id" uuid NOT NULL,
	"header_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"qty_send" integer NOT NULL,
	"qty_receive" integer NOT NULL DEFAULT 0,
	"qty_damaged" integer NOT NULL DEFAULT 0,
	"version" integer NOT NULL DEFAULT 1,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "catalog_transfer_lines" ADD CONSTRAINT "catalog_transfer_lines_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "catalog_transfer_lines" ADD CONSTRAINT "catalog_transfer_lines_workspace_header_fk" FOREIGN KEY ("workspace_id", "header_id") REFERENCES "catalog_transfer_headers"("workspace_id", "id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "catalog_transfer_lines" ADD CONSTRAINT "catalog_transfer_lines_variant_fk" FOREIGN KEY ("variant_id") REFERENCES "catalog_variants"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "catalog_transfer_lines_header_idx" ON "catalog_transfer_lines" USING btree ("header_id");
--> statement-breakpoint
CREATE INDEX "catalog_transfer_lines_variant_idx" ON "catalog_transfer_lines" USING btree ("variant_id");
--> statement-breakpoint
