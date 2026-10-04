-- Recommendation dismiss/snooze/edit state (UTA-146 Slice 1c / Story 11)
CREATE TABLE "catalog_recommendation_states" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"snoozed_until" timestamp with time zone,
	"suggested_reorder_qty_override" integer,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

ALTER TABLE "catalog_recommendation_states" ADD CONSTRAINT "catalog_recommendation_states_workspace_id_tenants_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

ALTER TABLE "catalog_recommendation_states" ADD CONSTRAINT "catalog_recommendation_states_variant_id_catalog_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "catalog_variants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

CREATE UNIQUE INDEX "catalog_recommendation_states_workspace_variant_unique" ON "catalog_recommendation_states" USING btree ("workspace_id","variant_id");
--> statement-breakpoint

CREATE INDEX "catalog_recommendation_states_workspace_status_idx" ON "catalog_recommendation_states" USING btree ("workspace_id","status");
--> statement-breakpoint
