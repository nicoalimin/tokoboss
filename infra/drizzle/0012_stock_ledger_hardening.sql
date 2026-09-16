CREATE TABLE "catalog_stock_settings" (
	"workspace_id" uuid PRIMARY KEY NOT NULL,
	"allow_negative" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "catalog_stock_ledger" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
ALTER TABLE "catalog_stock_settings" ADD CONSTRAINT "catalog_stock_settings_workspace_id_tenants_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_ledger_workspace_idempotency_unique" ON "catalog_stock_ledger" USING btree ("workspace_id","idempotency_key") WHERE idempotency_key is not null;