CREATE TABLE "conformance_findings" (
	"replay_run_id" text NOT NULL,
	"finding_key" text NOT NULL,
	"kind" text NOT NULL,
	"capability" text NOT NULL,
	"zone" text NOT NULL,
	"program" text,
	"action_count" integer NOT NULL,
	"session_count" integer NOT NULL,
	"first_occurred_at" text NOT NULL,
	"last_occurred_at" text NOT NULL,
	"sample_action_keys" jsonb NOT NULL,
	CONSTRAINT "conformance_findings_replay_run_id_finding_key_pk" PRIMARY KEY("replay_run_id","finding_key")
);
--> statement-breakpoint
ALTER TABLE "runtime_observations" DROP CONSTRAINT "ck_runtime_observations__event";--> statement-breakpoint
ALTER TABLE "replay_runs" ALTER COLUMN "baseline_version_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "replay_runs" ADD COLUMN "kind" text DEFAULT 'version_diff' NOT NULL;--> statement-breakpoint
ALTER TABLE "runtime_observations" ADD COLUMN "action_key" text;--> statement-breakpoint
ALTER TABLE "runtime_observations" ADD COLUMN "tool_use_id" text;--> statement-breakpoint
ALTER TABLE "runtime_observations" ADD COLUMN "hook_decision" text;--> statement-breakpoint
CREATE INDEX "idx_runtime_observations__action_key" ON "runtime_observations" USING btree ("action_key");--> statement-breakpoint
ALTER TABLE "replay_runs" ADD CONSTRAINT "ck_replay_runs__kind" CHECK ("replay_runs"."kind" in ('version_diff', 'conformance'));--> statement-breakpoint
ALTER TABLE "replay_runs" ADD CONSTRAINT "ck_replay_runs__baseline_version_id" CHECK (("replay_runs"."kind" = 'conformance') = ("replay_runs"."baseline_version_id" is null));--> statement-breakpoint
ALTER TABLE "runtime_observations" ADD CONSTRAINT "ck_runtime_observations__hook_decision" CHECK ("runtime_observations"."hook_decision" is null or "runtime_observations"."hook_decision" in ('allow', 'deny'));--> statement-breakpoint
ALTER TABLE "runtime_observations" ADD CONSTRAINT "ck_runtime_observations__event" CHECK ("runtime_observations"."event" in ('pre_tool_use', 'permission_request', 'session_end'));