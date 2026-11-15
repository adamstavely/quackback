-- Trust & Security, phase 4: updates and their subscribers (plans/v2/70-trust-security.md §4).
CREATE TABLE IF NOT EXISTS "fork_trust_updates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"link_url" text,
	"link_label" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone,
	"notified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by_principal_id" uuid,
	CONSTRAINT "fork_trust_updates_status_check" CHECK ("status" IN ('draft', 'published')),
	CONSTRAINT "fork_trust_updates_title_check" CHECK (char_length("title") <= 160),
	CONSTRAINT "fork_trust_updates_body_check" CHECK (char_length("body") <= 2000)
);
--> statement-breakpoint
ALTER TABLE "fork_trust_updates" ADD CONSTRAINT "fork_trust_updates_updated_by_fk"
	FOREIGN KEY ("updated_by_principal_id") REFERENCES "principal"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fork_trust_updates_published_idx" ON "fork_trust_updates" USING btree ("status", "published_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "fork_trust_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"principal_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"unsubscribed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "fork_trust_subscriptions" ADD CONSTRAINT "fork_trust_subscriptions_principal_fk"
	FOREIGN KEY ("principal_id") REFERENCES "principal"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "fork_trust_subscriptions_principal_uq" ON "fork_trust_subscriptions" USING btree ("principal_id");
