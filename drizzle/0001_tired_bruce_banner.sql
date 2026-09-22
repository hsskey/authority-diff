CREATE TABLE "agent_actions" (
	"action_key" text PRIMARY KEY NOT NULL,
	"session_external_id" text NOT NULL,
	"operations" jsonb NOT NULL,
	"observed_outcome" text NOT NULL,
	"occurred_at" text NOT NULL,
	"tool_name" text NOT NULL,
	"tool_input_redacted" text NOT NULL,
	"is_input_truncated" boolean NOT NULL,
	"is_sidechain" boolean NOT NULL,
	"classifier_version" text NOT NULL,
	"recorded_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"runtime" text NOT NULL,
	"runtime_version" text,
	"session_external_id" text NOT NULL,
	"workspace_root" text,
	"git_branch" text,
	"has_hook_coverage" boolean NOT NULL,
	"started_at" text,
	"ended_at" text
);
--> statement-breakpoint
CREATE TABLE "runtime_observations" (
	"observation_key" text PRIMARY KEY NOT NULL,
	"event" text NOT NULL,
	"session_external_id" text NOT NULL,
	"tool_name" text,
	"tool_input_hash" text,
	"cwd" text,
	"runtime_version" text,
	"occurred_at" text NOT NULL,
	CONSTRAINT "ck_runtime_observations__event" CHECK ("runtime_observations"."event" in ('permission_request', 'session_end'))
);
--> statement-breakpoint
CREATE TABLE "trace_imports" (
	"id" text PRIMARY KEY NOT NULL,
	"runtime" text NOT NULL,
	"source" text NOT NULL,
	"session_external_id" text NOT NULL,
	"accepted_count" integer NOT NULL,
	"duplicate_count" integer NOT NULL,
	"rejected_count" integer NOT NULL,
	"redaction_count" integer NOT NULL,
	"classifier_version" text NOT NULL,
	"created_at" text NOT NULL,
	CONSTRAINT "ck_trace_imports__source" CHECK ("trace_imports"."source" in ('transcript', 'hook', 'synthetic'))
);
--> statement-breakpoint
CREATE INDEX "idx_agent_actions__occurred_at_action_key" ON "agent_actions" USING btree ("occurred_at","action_key");--> statement-breakpoint
CREATE INDEX "idx_agent_actions__session_external_id" ON "agent_actions" USING btree ("session_external_id");--> statement-breakpoint
CREATE INDEX "idx_agent_actions__classifier_version" ON "agent_actions" USING btree ("classifier_version");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_agent_sessions__runtime_session_external_id" ON "agent_sessions" USING btree ("runtime","session_external_id");--> statement-breakpoint
CREATE INDEX "idx_runtime_observations__session_external_id_tool_input_hash" ON "runtime_observations" USING btree ("session_external_id","tool_input_hash");--> statement-breakpoint
CREATE INDEX "idx_trace_imports__created_at" ON "trace_imports" USING btree ("created_at");