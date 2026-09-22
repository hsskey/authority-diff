CREATE TABLE "replay_changed_actions" (
	"replay_run_id" text NOT NULL,
	"action_key" text NOT NULL,
	"group_key" text NOT NULL,
	"from_effect" text NOT NULL,
	"to_effect" text NOT NULL,
	CONSTRAINT "replay_changed_actions_replay_run_id_action_key_pk" PRIMARY KEY("replay_run_id","action_key")
);
--> statement-breakpoint
CREATE TABLE "replay_diff_groups" (
	"replay_run_id" text NOT NULL,
	"group_key" text NOT NULL,
	"direction" text NOT NULL,
	"from_effect" text NOT NULL,
	"to_effect" text NOT NULL,
	"capability" text NOT NULL,
	"from_zone" text NOT NULL,
	"to_zone" text NOT NULL,
	"program" text,
	"severity" text NOT NULL,
	"action_count" integer NOT NULL,
	"session_count" integer NOT NULL,
	"analyzability_none_count" integer NOT NULL,
	"first_occurred_at" text NOT NULL,
	"last_occurred_at" text NOT NULL,
	"baseline_rule_ids" jsonb NOT NULL,
	"candidate_rule_ids" jsonb NOT NULL,
	"target_summary" jsonb NOT NULL,
	"headline" text NOT NULL,
	"sample_action_keys" jsonb NOT NULL,
	CONSTRAINT "replay_diff_groups_replay_run_id_group_key_pk" PRIMARY KEY("replay_run_id","group_key")
);
--> statement-breakpoint
CREATE TABLE "replay_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"baseline_version_id" text NOT NULL,
	"candidate_version_id" text NOT NULL,
	"window_from" text NOT NULL,
	"window_to" text NOT NULL,
	"status" text NOT NULL,
	"classifier_version" text NOT NULL,
	"inputs_hash" text NOT NULL,
	"result_hash" text,
	"stats" jsonb,
	"error_code" text,
	"created_at" text NOT NULL,
	"started_at" text,
	"completed_at" text
);
--> statement-breakpoint
CREATE INDEX "idx_replay_diff_groups__replay_run_id_direction_severity" ON "replay_diff_groups" USING btree ("replay_run_id","direction","severity");--> statement-breakpoint
CREATE INDEX "idx_replay_runs__inputs_hash" ON "replay_runs" USING btree ("inputs_hash");--> statement-breakpoint
CREATE INDEX "idx_replay_runs__status" ON "replay_runs" USING btree ("status");