-- Trust & Security: files waiting to be removed from storage (review 2026-11-15, finding 5).
CREATE TABLE IF NOT EXISTS "fork_trust_storage_cleanup" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"storage_key" text NOT NULL,
	"reason" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "fork_trust_storage_cleanup_key_uq" ON "fork_trust_storage_cleanup" USING btree ("storage_key");
