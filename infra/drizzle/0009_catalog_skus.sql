CREATE TABLE "catalog_channel_mappings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"shop_ext_id" text NOT NULL,
	"platform_sku_id" text NOT NULL,
	"seller_sku_hint" text,
	"barcode_hint" text,
	"listing_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "catalog_inventory_levels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"warehouse_id" uuid NOT NULL,
	"qty" integer DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "catalog_products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"unit" text DEFAULT 'pcs' NOT NULL,
	"pictures" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "catalog_stock_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"warehouse_id" uuid NOT NULL,
	"delta" integer NOT NULL,
	"balance_after" integer NOT NULL,
	"reason" text NOT NULL,
	"actor_id" text,
	"correlation_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "catalog_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"sku_code" text NOT NULL,
	"name" text,
	"barcode" text,
	"selling_price_cents" integer NOT NULL,
	"currency" text DEFAULT 'IDR' NOT NULL,
	"hpp_cents" integer,
	"cost_source" text,
	"listing_name" text,
	"status" text DEFAULT 'active' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "catalog_warehouses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "catalog_channel_mappings" ADD CONSTRAINT "catalog_channel_mappings_workspace_id_tenants_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_channel_mappings" ADD CONSTRAINT "catalog_channel_mappings_variant_id_catalog_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."catalog_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_inventory_levels" ADD CONSTRAINT "catalog_inventory_levels_workspace_id_tenants_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_inventory_levels" ADD CONSTRAINT "catalog_inventory_levels_variant_id_catalog_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."catalog_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_inventory_levels" ADD CONSTRAINT "catalog_inventory_levels_warehouse_id_catalog_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."catalog_warehouses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_products" ADD CONSTRAINT "catalog_products_workspace_id_tenants_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_stock_ledger" ADD CONSTRAINT "catalog_stock_ledger_workspace_id_tenants_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_stock_ledger" ADD CONSTRAINT "catalog_stock_ledger_variant_id_catalog_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."catalog_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_stock_ledger" ADD CONSTRAINT "catalog_stock_ledger_warehouse_id_catalog_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."catalog_warehouses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_variants" ADD CONSTRAINT "catalog_variants_workspace_id_tenants_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_variants" ADD CONSTRAINT "catalog_variants_product_id_catalog_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."catalog_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_warehouses" ADD CONSTRAINT "catalog_warehouses_workspace_id_tenants_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_mappings_workspace_channel_shop_platform_unique" ON "catalog_channel_mappings" USING btree ("workspace_id","channel","shop_ext_id","platform_sku_id");--> statement-breakpoint
CREATE INDEX "catalog_mappings_workspace_variant_idx" ON "catalog_channel_mappings" USING btree ("workspace_id","variant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_levels_variant_warehouse_unique" ON "catalog_inventory_levels" USING btree ("variant_id","warehouse_id");--> statement-breakpoint
CREATE INDEX "catalog_levels_workspace_variant_idx" ON "catalog_inventory_levels" USING btree ("workspace_id","variant_id");--> statement-breakpoint
CREATE INDEX "catalog_products_workspace_idx" ON "catalog_products" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "catalog_ledger_variant_warehouse_created_idx" ON "catalog_stock_ledger" USING btree ("variant_id","warehouse_id","created_at");--> statement-breakpoint
CREATE INDEX "catalog_ledger_workspace_variant_idx" ON "catalog_stock_ledger" USING btree ("workspace_id","variant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_variants_workspace_sku_unique" ON "catalog_variants" USING btree ("workspace_id","sku_code");--> statement-breakpoint
CREATE INDEX "catalog_variants_workspace_product_idx" ON "catalog_variants" USING btree ("workspace_id","product_id");--> statement-breakpoint
CREATE INDEX "catalog_variants_workspace_barcode_idx" ON "catalog_variants" USING btree ("workspace_id","barcode");--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_warehouses_workspace_code_unique" ON "catalog_warehouses" USING btree ("workspace_id","code");--> statement-breakpoint
CREATE INDEX "catalog_warehouses_workspace_idx" ON "catalog_warehouses" USING btree ("workspace_id");