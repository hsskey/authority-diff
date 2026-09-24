ALTER TABLE "conformance_findings" ADD COLUMN "status" text DEFAULT 'open' NOT NULL;--> statement-breakpoint
ALTER TABLE "conformance_findings" ADD COLUMN "note" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "conformance_findings" ADD CONSTRAINT "ck_conformance_findings__status" CHECK ("conformance_findings"."status" in ('open', 'acknowledged'));