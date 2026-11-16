-- Trust & Security, phase 3: requests for restricted documents (plans/v2/70-trust-security.md §4).
CREATE TABLE IF NOT EXISTS "fork_trust_access_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"requester_principal_id" uuid NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"reason" text,
	"ticket_id" text,
	"decision_note" text,
	"decided_by_principal_id" uuid,
	"decided_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fork_trust_access_requests_state_check" CHECK ("state" IN ('pending', 'approved', 'declined', 'revoked')),
	CONSTRAINT "fork_trust_access_requests_reason_check" CHECK ("reason" IS NULL OR char_length("reason") <= 500)
);
--> statement-breakpoint
ALTER TABLE "fork_trust_access_requests" ADD CONSTRAINT "fork_trust_access_requests_document_fk"
	FOREIGN KEY ("document_id") REFERENCES "fork_trust_documents"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "fork_trust_access_requests" ADD CONSTRAINT "fork_trust_access_requests_requester_fk"
	FOREIGN KEY ("requester_principal_id") REFERENCES "principal"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "fork_trust_access_requests" ADD CONSTRAINT "fork_trust_access_requests_decided_by_fk"
	FOREIGN KEY ("decided_by_principal_id") REFERENCES "principal"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fork_trust_access_requests_requester_idx" ON "fork_trust_access_requests" USING btree ("requester_principal_id", "document_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fork_trust_access_requests_state_idx" ON "fork_trust_access_requests" USING btree ("state", "created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "fork_trust_access_requests_pending_uq" ON "fork_trust_access_requests" USING btree ("document_id", "requester_principal_id") WHERE "state" = 'pending';
