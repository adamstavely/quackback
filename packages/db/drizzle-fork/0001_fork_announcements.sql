CREATE TABLE IF NOT EXISTS "fork_announcements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"link_url" text,
	"link_label" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"publish_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"priority" integer DEFAULT 0 NOT NULL,
	"surfaces" jsonb DEFAULT '["portal"]'::jsonb NOT NULL,
	"audience" jsonb DEFAULT '{"tier":"authenticated","segmentIds":[]}'::jsonb NOT NULL,
	"origin" jsonb DEFAULT '{"source":"local"}'::jsonb NOT NULL,
	"created_by_principal_id" uuid,
	"updated_by_principal_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fork_announcements_kind_check" CHECK ("kind" IN ('info', 'warning', 'critical', 'maintenance', 'success')),
	CONSTRAINT "fork_announcements_status_check" CHECK ("status" IN ('draft', 'published', 'archived')),
	CONSTRAINT "fork_announcements_title_check" CHECK (char_length("title") <= 140),
	CONSTRAINT "fork_announcements_body_check" CHECK ("body" IS NULL OR char_length("body") <= 500),
	CONSTRAINT "fork_announcements_window_check" CHECK ("expires_at" IS NULL OR "expires_at" > "publish_at")
);
--> statement-breakpoint
ALTER TABLE "fork_announcements" ADD CONSTRAINT "fork_announcements_created_by_principal_id_principal_id_fk"
	FOREIGN KEY ("created_by_principal_id") REFERENCES "principal"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "fork_announcements" ADD CONSTRAINT "fork_announcements_updated_by_principal_id_principal_id_fk"
	FOREIGN KEY ("updated_by_principal_id") REFERENCES "principal"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fork_announcements_live_idx" ON "fork_announcements" USING btree ("status", "publish_at", "expires_at");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "fork_announcements_broadcast_uq" ON "fork_announcements" ((origin->>'broadcastId')) WHERE origin ? 'broadcastId';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "fork_announcement_revision" (
	"singleton" smallint PRIMARY KEY NOT NULL,
	"epoch" uuid DEFAULT gen_random_uuid() NOT NULL,
	"revision" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fork_announcement_revision_singleton_check" CHECK ("singleton" = 1)
);
--> statement-breakpoint
INSERT INTO "fork_announcement_revision" ("singleton") VALUES (1) ON CONFLICT DO NOTHING;
