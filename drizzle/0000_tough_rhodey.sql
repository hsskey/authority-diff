CREATE TABLE "policies" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "policy_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"policy_id" text NOT NULL,
	"version_number" integer NOT NULL,
	"status" text NOT NULL,
	"document" jsonb NOT NULL,
	"content_hash" text NOT NULL,
	"base_version_id" text,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_policies__name" ON "policies" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_policy_versions__policy_id_version_number" ON "policy_versions" USING btree ("policy_id","version_number");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_policy_versions__one_in_review" ON "policy_versions" USING btree ("policy_id") WHERE "policy_versions"."status" = 'in_review';