-- Create transfer header table
CREATE TABLE "catalog_transfers" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"reference_num" text NOT NULL,
	"source_warehouse_id" text NOT NULL,
	"dest_warehouse_id" text NOT NULL,
	"status" text NOT NULL,
	"notes" text,
	"expected_receive_date" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- Add foreign key to workspace
ALTER TABLE "catalog_transfers" ADD CONSTRAINT "catalog_transfers_workspace_id_tenants_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

-- Add foreign key to source warehouse
ALTER TABLE "catalog_transfers" ADD CONSTRAINT "catalog_transfers_source_warehouse_id_catalog_warehouses_id_fk" FOREIGN KEY ("source_warehouse_id") REFERENCES "catalog_warehouses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

-- Add foreign key to destination warehouse
ALTER TABLE "catalog_transfers" ADD CONSTRAINT "catalog_transfers_dest_warehouse_id_catalog_warehouses_id_fk" FOREIGN KEY ("dest_warehouse_id") REFERENCES "catalog_warehouses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

-- Unique constraint for reference number per workspace
CREATE UNIQUE INDEX "catalog_transfers_workspace_reference_num_unique" ON "catalog_transfers" USING btree ("workspace_id","reference_num");
--> statement-breakpoint

-- Create transfer items table
CREATE TABLE "catalog_transfer_items" (
	"id" text PRIMARY KEY NOT NULL,
	"transfer_id" text NOT NULL,
	"workspace_id" uuid NOT NULL,
	"variant_id" text NOT NULL,
	"requested_qty" integer NOT NULL,
	"sent_qty" integer DEFAULT 0 NOT NULL,
	"received_qty" integer DEFAULT 0 NOT NULL,
	"damaged_qty" integer DEFAULT 0 NOT NULL,
	"cancellation_reason" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- Add foreign key to workspace
ALTER TABLE "catalog_transfer_items" ADD CONSTRAINT "catalog_transfer_items_workspace_id_tenants_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

-- Add foreign key to transfer
ALTER TABLE "catalog_transfer_items" ADD CONSTRAINT "catalog_transfer_items_transfer_id_catalog_transfers_id_fk" FOREIGN KEY ("transfer_id") REFERENCES "catalog_transfers"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

-- Add foreign key to variant
ALTER TABLE "catalog_transfer_items" ADD CONSTRAINT "catalog_transfer_items_variant_id_catalog_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "catalog_variants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
