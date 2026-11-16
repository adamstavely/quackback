-- Trust & Security: per-recipient delivery of update notices (review 2026-11-15, finding 3).
CREATE TABLE IF NOT EXISTS "fork_trust_update_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"update_id" uuid NOT NULL,
	"principal_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"claimed_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fork_trust_update_deliveries_channel_check" CHECK ("channel" IN ('in_app', 'email')),
	CONSTRAINT "fork_trust_update_deliveries_state_check" CHECK ("state" IN ('pending', 'sending', 'sent', 'failed', 'skipped'))
);
--> statement-breakpoint
ALTER TABLE "fork_trust_update_deliveries" ADD CONSTRAINT "fork_trust_update_deliveries_update_fk"
	FOREIGN KEY ("update_id") REFERENCES "fork_trust_updates"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "fork_trust_update_deliveries" ADD CONSTRAINT "fork_trust_update_deliveries_principal_fk"
	FOREIGN KEY ("principal_id") REFERENCES "principal"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "fork_trust_update_deliveries_uq" ON "fork_trust_update_deliveries" USING btree ("update_id", "principal_id", "channel");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fork_trust_update_deliveries_state_idx" ON "fork_trust_update_deliveries" USING btree ("update_id", "state");
