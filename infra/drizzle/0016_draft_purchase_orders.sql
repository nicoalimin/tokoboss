-- Draft purchase orders from replenish recommendations (UTA-146 Slice 1d / Story 11)
CREATE TABLE "catalog_purchase_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"reference_num" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"supplier_name" text,
	"notes" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

ALTER TABLE "catalog_purchase_orders" ADD CONSTRAINT "catalog_purchase_orders_workspace_id_tenants_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

CREATE UNIQUE INDEX "catalog_purchase_orders_workspace_reference_num_unique" ON "catalog_purchase_orders" USING btree ("workspace_id","reference_num");
--> statement-breakpoint

CREATE INDEX "catalog_purchase_orders_workspace_status_idx" ON "catalog_purchase_orders" USING btree ("workspace_id","status");
--> statement-breakpoint

CREATE TABLE "catalog_purchase_order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"purchase_order_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"unit_cost_cents" integer,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

ALTER TABLE "catalog_purchase_order_items" ADD CONSTRAINT "catalog_purchase_order_items_workspace_id_tenants_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

ALTER TABLE "catalog_purchase_order_items" ADD CONSTRAINT "catalog_purchase_order_items_purchase_order_id_catalog_purchase_orders_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "catalog_purchase_orders"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

ALTER TABLE "catalog_purchase_order_items" ADD CONSTRAINT "catalog_purchase_order_items_variant_id_catalog_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "catalog_variants"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint

CREATE INDEX "catalog_purchase_order_items_workspace_po_idx" ON "catalog_purchase_order_items" USING btree ("workspace_id","purchase_order_id");
--> statement-breakpoint
