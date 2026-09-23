CREATE FUNCTION "reject_review_decisions_change"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'review_decisions is append-only: % is not allowed', TG_OP;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "review_decisions_append_only" BEFORE UPDATE OR DELETE ON "review_decisions" FOR EACH ROW EXECUTE FUNCTION "reject_review_decisions_change"();--> statement-breakpoint
CREATE TRIGGER "review_decisions_no_truncate" BEFORE TRUNCATE ON "review_decisions" FOR EACH STATEMENT EXECUTE FUNCTION "reject_review_decisions_change"();
