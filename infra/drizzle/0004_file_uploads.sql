CREATE TABLE "file_uploads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"purpose" text NOT NULL,
	"related_entity_type" text,
	"related_entity_id" text,
	"pathname" text NOT NULL,
	"url" text,
	"content_type" text NOT NULL,
	"byte_size" integer NOT NULL,
	"checksum" text,
	"idempotency_key" text NOT NULL,
	"created_by_type" text,
	"created_by_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"retention_until" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "file_uploads" ADD CONSTRAINT "file_uploads_workspace_id_tenants_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "file_uploads_workspace_idempotency_unique" ON "file_uploads" USING btree ("workspace_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "file_uploads_workspace_pathname_unique" ON "file_uploads" USING btree ("workspace_id","pathname");--> statement-breakpoint
CREATE INDEX "file_uploads_workspace_status_idx" ON "file_uploads" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "file_uploads_workspace_purpose_idx" ON "file_uploads" USING btree ("workspace_id","purpose");
