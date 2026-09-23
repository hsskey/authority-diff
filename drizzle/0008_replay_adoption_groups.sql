CREATE TABLE "replay_adoption_assignments" (
	"replay_run_id" text NOT NULL,
	"action_key" text NOT NULL,
	"group_key" text NOT NULL,
	"effect" text NOT NULL,
	CONSTRAINT "replay_adoption_assignments_replay_run_id_action_key_pk" PRIMARY KEY("replay_run_id","action_key")
);
--> statement-breakpoint
CREATE TABLE "replay_adoption_groups" (
	"replay_run_id" text NOT NULL,
	"group_key" text NOT NULL,
	"position" integer NOT NULL,
	"effect" text NOT NULL,
	"capability" text NOT NULL,
	"zone" text NOT NULL,
	"program" text,
	"program_summary" jsonb NOT NULL,
	"distinct_program_count" integer NOT NULL,
	"action_count" integer NOT NULL,
	"session_count" integer NOT NULL,
	"analyzability_none_count" integer NOT NULL,
	"first_occurred_at" text NOT NULL,
	"last_occurred_at" text NOT NULL,
	"deciding_rule_ids" jsonb NOT NULL,
	"target_summary" jsonb NOT NULL,
	"headline" text NOT NULL,
	"sample_action_keys" jsonb NOT NULL,
	CONSTRAINT "replay_adoption_groups_replay_run_id_group_key_pk" PRIMARY KEY("replay_run_id","group_key"),
	CONSTRAINT "ck_replay_adoption_groups__effect" CHECK ("replay_adoption_groups"."effect" in ('ask', 'deny'))
);
--> statement-breakpoint
ALTER TABLE "replay_runs" DROP CONSTRAINT "ck_replay_runs__kind";--> statement-breakpoint
ALTER TABLE "replay_runs" DROP CONSTRAINT "ck_replay_runs__baseline_version_id";--> statement-breakpoint
CREATE UNIQUE INDEX "uq_replay_adoption_groups__replay_run_id_position" ON "replay_adoption_groups" USING btree ("replay_run_id","position");--> statement-breakpoint
ALTER TABLE "replay_runs" ADD CONSTRAINT "ck_replay_runs__kind" CHECK ("replay_runs"."kind" in ('version_diff', 'conformance', 'adoption'));--> statement-breakpoint
ALTER TABLE "replay_runs" ADD CONSTRAINT "ck_replay_runs__baseline_version_id" CHECK (("replay_runs"."kind" in ('conformance', 'adoption')) = ("replay_runs"."baseline_version_id" is null));