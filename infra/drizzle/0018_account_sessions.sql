-- Account-level sessions and workspace landing (UTA-162 / User Story 29, RFC 02 task 1). Expand only.
ALTER TABLE "auth_users" ADD COLUMN "auth_version" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE "auth_users" ADD COLUMN "deactivated_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "auth_sessions" ALTER COLUMN "workspace_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "workspace_members" ADD COLUMN "last_active_at" timestamp with time zone;
--> statement-breakpoint
UPDATE "workspace_members" AS wm
SET "last_active_at" = s."max_seen"
FROM (
  SELECT "workspace_id", "user_id", MAX("last_seen_at") AS "max_seen"
  FROM "auth_sessions"
  GROUP BY "workspace_id", "user_id"
) AS s
WHERE wm."workspace_id" = s."workspace_id" AND wm."user_id" = s."user_id";
--> statement-breakpoint
CREATE INDEX "workspace_members_user_status_last_active_idx" ON "workspace_members" USING btree ("user_id", "status", "last_active_at" DESC);
--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "status" text DEFAULT 'active' NOT NULL;
--> statement-breakpoint
ALTER TABLE "audit_events" ALTER COLUMN "tenant_id" DROP NOT NULL;
