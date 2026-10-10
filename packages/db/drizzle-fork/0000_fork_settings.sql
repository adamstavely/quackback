CREATE TABLE IF NOT EXISTS "fork_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by_principal_id" uuid
);
--> statement-breakpoint
ALTER TABLE "fork_settings" ADD CONSTRAINT "fork_settings_updated_by_principal_id_principal_id_fk"
	FOREIGN KEY ("updated_by_principal_id") REFERENCES "principal"("id") ON DELETE set null ON UPDATE no action;
