CREATE TABLE "catalog_bundle_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"bundle_variant_id" uuid NOT NULL,
	"component_variant_id" uuid NOT NULL,
	"qty" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "catalog_bundle_lines" ADD CONSTRAINT "catalog_bundle_lines_workspace_id_tenants_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_bundle_lines" ADD CONSTRAINT "catalog_bundle_lines_bundle_variant_id_catalog_variants_id_fk" FOREIGN KEY ("bundle_variant_id") REFERENCES "public"."catalog_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_bundle_lines" ADD CONSTRAINT "catalog_bundle_lines_component_variant_id_catalog_variants_id_fk" FOREIGN KEY ("component_variant_id") REFERENCES "public"."catalog_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_bundle_lines_bundle_component_unique" ON "catalog_bundle_lines" USING btree ("bundle_variant_id","component_variant_id");--> statement-breakpoint
CREATE INDEX "catalog_bundle_lines_workspace_bundle_idx" ON "catalog_bundle_lines" USING btree ("workspace_id","bundle_variant_id");--> statement-breakpoint
CREATE INDEX "catalog_bundle_lines_workspace_component_idx" ON "catalog_bundle_lines" USING btree ("workspace_id","component_variant_id");