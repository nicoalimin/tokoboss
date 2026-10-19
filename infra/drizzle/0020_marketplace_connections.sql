-- Marketplace connections, sealed credentials, OAuth states and global store claims (UTA-39 / User Story 20, RFC 04 task 1a). Additive only.
CREATE TABLE "marketplace_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL REFERENCES "public"."tenants"("id") ON DELETE cascade,
	"provider" text NOT NULL CHECK ("provider" IN ('shopee', 'tiktok_shop', 'blibli')),
	"connect_mode" text NOT NULL CHECK ("connect_mode" IN ('oauth_redirect', 'credential_binding')),
	"provider_store_id" text NOT NULL,
	"provider_account_id" text,
	"shop_cipher" text,
	"store_name" text,
	"region" text,
	"status" text DEFAULT 'connected' NOT NULL CHECK ("status" IN ('connected', 'needs_reauth', 'disconnected')),
	"disconnect_source" text CHECK ("disconnect_source" IS NULL OR "disconnect_source" IN ('admin', 'seller', 'provider')),
	"disconnected_at" timestamp with time zone,
	"disconnected_by" text,
	"removed_at" timestamp with time zone,
	"capabilities" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"granted_scopes" text[] DEFAULT '{}'::text[] NOT NULL,
	"missing_permissions" text[] DEFAULT '{}'::text[] NOT NULL,
	"access_token_expires_at" timestamp with time zone,
	"auth_expires_at" timestamp with time zone,
	"last_refreshed_at" timestamp with time zone,
	"last_checked_at" timestamp with time zone,
	"last_error_code" text,
	"order_import_enabled" boolean DEFAULT false NOT NULL,
	"inventory_sync_enabled" boolean DEFAULT false NOT NULL,
	"initial_import_status" text CHECK ("initial_import_status" IS NULL OR "initial_import_status" IN ('queued', 'running', 'complete', 'incomplete', 'failed')),
	"initial_import_cursor" jsonb,
	"import_job_id" uuid REFERENCES "jobs"("id") ON DELETE set null,
	"connected_by" text,
	"connected_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "marketplace_connections_workspace_provider_store_unique" ON "marketplace_connections" USING btree ("workspace_id","provider","provider_store_id");
--> statement-breakpoint
CREATE INDEX "marketplace_connections_status_expiry_idx" ON "marketplace_connections" USING btree ("status","access_token_expires_at");
--> statement-breakpoint
CREATE TABLE "marketplace_credentials" (
	"connection_id" uuid PRIMARY KEY NOT NULL REFERENCES "marketplace_connections"("id") ON DELETE cascade,
	"kind" text NOT NULL CHECK ("kind" IN ('oauth_tokens', 'blibli_keys')),
	"key_id" text NOT NULL,
	"nonce" text NOT NULL,
	"ciphertext" text NOT NULL,
	"auth_tag" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marketplace_oauth_states" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL REFERENCES "public"."tenants"("id") ON DELETE cascade,
	"provider" text NOT NULL CHECK ("provider" IN ('shopee', 'tiktok_shop', 'blibli')),
	"user_id" text NOT NULL,
	"state_hash" text NOT NULL,
	"connection_id" uuid REFERENCES "marketplace_connections"("id") ON DELETE cascade,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "marketplace_oauth_states_state_hash_unique" ON "marketplace_oauth_states" USING btree ("state_hash");
--> statement-breakpoint
CREATE TABLE "marketplace_store_claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL CHECK ("provider" IN ('shopee', 'tiktok_shop', 'blibli')),
	"provider_store_id" text NOT NULL,
	"workspace_id" uuid NOT NULL REFERENCES "public"."tenants"("id") ON DELETE cascade,
	"connection_id" uuid NOT NULL REFERENCES "marketplace_connections"("id") ON DELETE cascade,
	"claimed_by" text NOT NULL,
	"claimed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "marketplace_store_claims_provider_store_unique" UNIQUE("provider","provider_store_id")
);
