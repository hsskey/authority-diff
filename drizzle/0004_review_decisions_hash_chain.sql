ALTER TABLE "review_decisions" ADD COLUMN "sequence" bigserial NOT NULL;--> statement-breakpoint
ALTER TABLE "review_decisions" ADD COLUMN "prev_hash" text;--> statement-breakpoint
ALTER TABLE "review_decisions" ADD COLUMN "hash" text;--> statement-breakpoint
DO $$
DECLARE
  r record;
  n bigint := 0;
  prev text := repeat('0', 64);
  body text;
BEGIN
  FOR r IN SELECT * FROM "review_decisions" ORDER BY "decided_at", "change_review_id" LOOP
    n := n + 1;
    body := '{"baselineContentHash":' || to_json(r.baseline_content_hash)::text
      || ',"candidateContentHash":' || to_json(r.candidate_content_hash)::text
      || ',"changeReviewId":' || to_json(r.change_review_id)::text
      || ',"classifierVersion":' || to_json(r.classifier_version)::text
      || ',"decidedAt":' || to_json(r.decided_at)::text
      || ',"decision":' || to_json(r.decision)::text
      || ',"note":' || to_json(r.note)::text
      || ',"replayInputsHash":' || to_json(r.replay_inputs_hash)::text
      || ',"replayResultHash":' || to_json(r.replay_result_hash)::text
      || ',"reviewerName":' || to_json(r.reviewer_name)::text
      || ',"verdictSnapshot":['
      || coalesce((
        SELECT string_agg(
          '{"groupKey":' || to_json(e ->> 'groupKey')::text || ',"verdict":' || to_json(e ->> 'verdict')::text || '}',
          ',' ORDER BY i)
        FROM jsonb_array_elements(r.verdict_snapshot) WITH ORDINALITY AS s(e, i)
      ), '')
      || ']}';
    UPDATE "review_decisions"
      SET "sequence" = n, "prev_hash" = prev, "hash" = encode(sha256(convert_to(prev || body, 'UTF8')), 'hex')
      WHERE "change_review_id" = r.change_review_id;
    prev := encode(sha256(convert_to(prev || body, 'UTF8')), 'hex');
  END LOOP;
  PERFORM setval(pg_get_serial_sequence('review_decisions', 'sequence'), greatest(n, 1), n > 0);
END;
$$;--> statement-breakpoint
ALTER TABLE "review_decisions" ALTER COLUMN "prev_hash" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "review_decisions" ALTER COLUMN "hash" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_review_decisions__sequence" ON "review_decisions" USING btree ("sequence");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_review_decisions__prev_hash" ON "review_decisions" USING btree ("prev_hash");
