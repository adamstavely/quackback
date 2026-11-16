-- Trust & Security page, phase 1 (plans/v2/70-trust-security.md §4).
CREATE TABLE IF NOT EXISTS "fork_trust_document_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by_principal_id" uuid,
	CONSTRAINT "fork_trust_document_groups_name_check" CHECK (char_length("name") <= 80)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "fork_trust_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"access" text DEFAULT 'restricted' NOT NULL,
	"published" boolean DEFAULT false NOT NULL,
	"storage_key" text,
	"file_name" text,
	"content_type" text,
	"size_bytes" bigint,
	"version" integer DEFAULT 1 NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by_principal_id" uuid,
	CONSTRAINT "fork_trust_documents_access_check" CHECK ("access" IN ('open', 'restricted')),
	CONSTRAINT "fork_trust_documents_title_check" CHECK (char_length("title") <= 160),
	CONSTRAINT "fork_trust_documents_description_check" CHECK ("description" IS NULL OR char_length("description") <= 500)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "fork_trust_compliance_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"label" text NOT NULL,
	"detail" text,
	"document_id" uuid,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by_principal_id" uuid,
	CONSTRAINT "fork_trust_compliance_items_name_check" CHECK (char_length("name") <= 120),
	CONSTRAINT "fork_trust_compliance_items_label_check" CHECK (char_length("label") <= 8),
	CONSTRAINT "fork_trust_compliance_items_detail_check" CHECK ("detail" IS NULL OR char_length("detail") <= 120)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "fork_trust_control_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by_principal_id" uuid,
	CONSTRAINT "fork_trust_control_groups_name_check" CHECK (char_length("name") <= 80),
	CONSTRAINT "fork_trust_control_groups_description_check" CHECK ("description" IS NULL OR char_length("description") <= 300)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "fork_trust_controls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'in_place' NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"external_id" text,
	"last_checked_at" timestamp with time zone,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by_principal_id" uuid,
	CONSTRAINT "fork_trust_controls_status_check" CHECK ("status" IN ('in_place', 'in_progress', 'not_applicable')),
	CONSTRAINT "fork_trust_controls_source_check" CHECK ("source" IN ('manual', 'integration')),
	CONSTRAINT "fork_trust_controls_name_check" CHECK (char_length("name") <= 160),
	CONSTRAINT "fork_trust_controls_description_check" CHECK ("description" IS NULL OR char_length("description") <= 1000)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "fork_trust_subprocessors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"purpose" text NOT NULL,
	"location" text NOT NULL,
	"data_categories" text,
	"website" text,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by_principal_id" uuid,
	CONSTRAINT "fork_trust_subprocessors_name_check" CHECK (char_length("name") <= 120),
	CONSTRAINT "fork_trust_subprocessors_purpose_check" CHECK (char_length("purpose") <= 300),
	CONSTRAINT "fork_trust_subprocessors_location_check" CHECK (char_length("location") <= 120)
);
--> statement-breakpoint
ALTER TABLE "fork_trust_documents" ADD CONSTRAINT "fork_trust_documents_group_fk"
	FOREIGN KEY ("group_id") REFERENCES "fork_trust_document_groups"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "fork_trust_compliance_items" ADD CONSTRAINT "fork_trust_compliance_items_document_fk"
	FOREIGN KEY ("document_id") REFERENCES "fork_trust_documents"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "fork_trust_controls" ADD CONSTRAINT "fork_trust_controls_group_fk"
	FOREIGN KEY ("group_id") REFERENCES "fork_trust_control_groups"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "fork_trust_document_groups" ADD CONSTRAINT "fork_trust_document_groups_updated_by_fk"
	FOREIGN KEY ("updated_by_principal_id") REFERENCES "principal"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "fork_trust_documents" ADD CONSTRAINT "fork_trust_documents_updated_by_fk"
	FOREIGN KEY ("updated_by_principal_id") REFERENCES "principal"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "fork_trust_compliance_items" ADD CONSTRAINT "fork_trust_compliance_items_updated_by_fk"
	FOREIGN KEY ("updated_by_principal_id") REFERENCES "principal"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "fork_trust_control_groups" ADD CONSTRAINT "fork_trust_control_groups_updated_by_fk"
	FOREIGN KEY ("updated_by_principal_id") REFERENCES "principal"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "fork_trust_controls" ADD CONSTRAINT "fork_trust_controls_updated_by_fk"
	FOREIGN KEY ("updated_by_principal_id") REFERENCES "principal"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "fork_trust_subprocessors" ADD CONSTRAINT "fork_trust_subprocessors_updated_by_fk"
	FOREIGN KEY ("updated_by_principal_id") REFERENCES "principal"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fork_trust_documents_group_idx" ON "fork_trust_documents" USING btree ("group_id", "position");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fork_trust_controls_group_idx" ON "fork_trust_controls" USING btree ("group_id", "position");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "fork_trust_controls_external_uq" ON "fork_trust_controls" USING btree ("external_id") WHERE "external_id" IS NOT NULL;
