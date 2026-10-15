-- Stock opname count sessions, lines and entries (UTA-32 / User Story 12, RFC 03 task 1). Additive only.
CREATE TABLE "stock_count_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL REFERENCES "public"."tenants"("id") ON DELETE cascade,
	"warehouse_id" uuid NOT NULL REFERENCES "catalog_warehouses"("id") ON DELETE restrict,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"scope_type" text NOT NULL DEFAULT 'all' CHECK ("scope_type" IN ('all', 'skus', 'categories')),
	"status" text NOT NULL DEFAULT 'counting' CHECK ("status" IN ('counting', 'submitted', 'posted', 'cancelled')),
	"freeze_outbound_transfers" boolean DEFAULT false NOT NULL,
	"snapshot_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"submitted_by" text,
	"submitted_at" timestamp with time zone,
	"submit_note" text,
	"returned_by" text,
	"returned_at" timestamp with time zone,
	"return_note" text,
	"posted_by" text,
	"posted_at" timestamp with time zone,
	"cancelled_by" text,
	"cancelled_at" timestamp with time zone,
	"cancel_reason" text,
	"self_approved" boolean DEFAULT false NOT NULL,
	"last_activity_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "stock_count_sessions_workspace_code_unique" ON "stock_count_sessions" USING btree ("workspace_id","code");
--> statement-breakpoint
CREATE INDEX "stock_count_sessions_workspace_warehouse_status_idx" ON "stock_count_sessions" USING btree ("workspace_id","warehouse_id","status");
--> statement-breakpoint
CREATE TABLE "stock_count_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL REFERENCES "public"."tenants"("id") ON DELETE cascade,
	"session_id" uuid NOT NULL REFERENCES "stock_count_sessions"("id") ON DELETE cascade,
	"warehouse_id" uuid NOT NULL REFERENCES "catalog_warehouses"("id") ON DELETE restrict,
	"variant_id" uuid NOT NULL REFERENCES "catalog_variants"("id") ON DELETE restrict,
	"snapshot_qty" integer NOT NULL,
	"counted_qty" integer CHECK ("counted_qty" IS NULL OR "counted_qty" >= 0),
	"system_qty_at_count" integer,
	"counted_at" timestamp with time zone,
	"counted_by" text,
	"entry_count" integer DEFAULT 0 NOT NULL,
	"variance_reason_code" text,
	"variance_note" text,
	"flag_verified" boolean DEFAULT false NOT NULL,
	"ledger_entry_id" uuid REFERENCES "catalog_stock_ledger"("id") ON DELETE restrict,
	"is_open" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "stock_count_lines_session_variant_unique" ON "stock_count_lines" USING btree ("session_id","variant_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "stock_count_lines_open_warehouse_variant_unique" ON "stock_count_lines" USING btree ("workspace_id","warehouse_id","variant_id") WHERE "is_open" = true;
--> statement-breakpoint
CREATE TABLE "stock_count_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL REFERENCES "public"."tenants"("id") ON DELETE cascade,
	"session_id" uuid NOT NULL REFERENCES "stock_count_sessions"("id") ON DELETE cascade,
	"line_id" uuid NOT NULL REFERENCES "stock_count_lines"("id") ON DELETE cascade,
	"qty" integer NOT NULL CHECK ("qty" >= 0 AND "qty" <= 1000000),
	"mode" text NOT NULL CHECK ("mode" IN ('add', 'replace')),
	"client_entry_id" text NOT NULL CHECK (char_length("client_entry_id") BETWEEN 1 AND 128),
	"device_label" text,
	"actor_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "stock_count_entries_workspace_client_entry_unique" ON "stock_count_entries" USING btree ("workspace_id","client_entry_id");
--> statement-breakpoint
CREATE INDEX "stock_count_entries_line_idx" ON "stock_count_entries" USING btree ("line_id","created_at");
