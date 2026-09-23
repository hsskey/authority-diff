ALTER TABLE "change_reviews" ALTER COLUMN "baseline_version_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "review_decisions" ALTER COLUMN "baseline_content_hash" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "change_reviews" ADD COLUMN "kind" text DEFAULT 'change' NOT NULL;--> statement-breakpoint
ALTER TABLE "change_reviews" ADD CONSTRAINT "ck_change_reviews__kind" CHECK ("change_reviews"."kind" in ('change', 'adoption'));--> statement-breakpoint
ALTER TABLE "change_reviews" ADD CONSTRAINT "ck_change_reviews__baseline_version_id" CHECK (("change_reviews"."kind" = 'adoption') = ("change_reviews"."baseline_version_id" is null));