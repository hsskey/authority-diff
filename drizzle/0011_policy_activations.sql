CREATE TABLE "policy_activations" (
	"id" text PRIMARY KEY NOT NULL,
	"policy_version_id" text NOT NULL,
	"reason" text NOT NULL,
	"actor_name" text NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "policy_activations" ADD CONSTRAINT "policy_activations_policy_version_id_policy_versions_id_fk" FOREIGN KEY ("policy_version_id") REFERENCES "public"."policy_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_policy_activations__policy_version_id" ON "policy_activations" USING btree ("policy_version_id");--> statement-breakpoint
CREATE FUNCTION "reject_policy_activations_change"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'policy_activations is append-only: % is not allowed', TG_OP;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "policy_activations_append_only" BEFORE UPDATE OR DELETE ON "policy_activations" FOR EACH ROW EXECUTE FUNCTION "reject_policy_activations_change"();--> statement-breakpoint
CREATE TRIGGER "policy_activations_no_truncate" BEFORE TRUNCATE ON "policy_activations" FOR EACH STATEMENT EXECUTE FUNCTION "reject_policy_activations_change"();
