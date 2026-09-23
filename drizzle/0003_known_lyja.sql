CREATE TABLE "change_reviews" (
	"id" text PRIMARY KEY NOT NULL,
	"policy_id" text NOT NULL,
	"candidate_version_id" text NOT NULL,
	"candidate_content_hash" text NOT NULL,
	"baseline_version_id" text NOT NULL,
	"window_from" text NOT NULL,
	"window_to" text NOT NULL,
	"replay_run_id" text,
	"status" text NOT NULL,
	"decided_by" text,
	"decided_at" text,
	"decision_note" text,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_decisions" (
	"change_review_id" text PRIMARY KEY NOT NULL,
	"decision" text NOT NULL,
	"note" text NOT NULL,
	"reviewer_name" text NOT NULL,
	"decided_at" text NOT NULL,
	"baseline_content_hash" text NOT NULL,
	"candidate_content_hash" text NOT NULL,
	"replay_inputs_hash" text NOT NULL,
	"replay_result_hash" text NOT NULL,
	"classifier_version" text NOT NULL,
	"verdict_snapshot" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_verdicts" (
	"change_review_id" text NOT NULL,
	"group_key" text NOT NULL,
	"verdict" text NOT NULL,
	"note" text NOT NULL,
	"updated_at" text NOT NULL,
	CONSTRAINT "review_verdicts_change_review_id_group_key_pk" PRIMARY KEY("change_review_id","group_key")
);
--> statement-breakpoint
CREATE INDEX "idx_change_reviews__policy_id_status" ON "change_reviews" USING btree ("policy_id","status");