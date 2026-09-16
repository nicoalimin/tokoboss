CREATE TABLE "product_import_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"job_id" uuid,
	"source_filename" text NOT NULL,
	"source_mime" text NOT NULL,
	"source_byte_size" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"total_rows" integer DEFAULT 0 NOT NULL,
	"ready_rows" integer DEFAULT 0 NOT NULL,
	"applied_rows" integer DEFAULT 0 NOT NULL,
	"rejected_rows" integer DEFAULT 0 NOT NULL,
	"idempotency_key" text NOT NULL,
	"created_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_import_rows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"batch_id" uuid NOT NULL,
	"row_number" integer NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"product_name" text DEFAULT '' NOT NULL,
	"sku_code" text DEFAULT '' NOT NULL,
	"variant_name" text,
	"barcode" text,
	"selling_price_cents" integer DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'IDR' NOT NULL,
	"hpp_cents" integer,
	"cost_source" text,
	"listing_name" text,
	"unit" text DEFAULT 'pcs' NOT NULL,
	"channel" text,
	"shop_ext_id" text,
	"platform_sku_id" text,
	"seller_sku_hint" text,
	"errors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"duplicate_of" jsonb,
	"applied" jsonb,
	"note" text,
	"raw" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "product_import_batches" ADD CONSTRAINT "product_import_batches_workspace_id_tenants_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_import_batches" ADD CONSTRAINT "product_import_batches_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_import_rows" ADD CONSTRAINT "product_import_rows_workspace_id_tenants_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_import_rows" ADD CONSTRAINT "product_import_rows_batch_id_product_import_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."product_import_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "product_import_batches_workspace_idempotency_unique" ON "product_import_batches" USING btree ("workspace_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "product_import_batches_workspace_status_idx" ON "product_import_batches" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "product_import_rows_batch_number_idx" ON "product_import_rows" USING btree ("batch_id","row_number");--> statement-breakpoint
CREATE INDEX "product_import_rows_workspace_batch_idx" ON "product_import_rows" USING btree ("workspace_id","batch_id");