import type { Context, Hono } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { AppError } from '@authority/kernel';
import { Sha256Schema } from '@authority/kernel';
import {
  ChangeReviewResponseSchema,
  CreateChangeReviewRequestSchema,
  CreateDecisionRequestSchema,
  ListChangeReviewsQuerySchema,
  ListChangeReviewsResponseSchema,
  ListReviewAdoptionGroupsQuerySchema,
  ListReviewAdoptionGroupsResponseSchema,
  ListReviewDiffGroupsQuerySchema,
  ListReviewDiffGroupsResponseSchema,
  RecordVerdictRequestSchema,
  VerdictResponseSchema,
} from '@authority/contracts/schema';
import type { ChangeReviewView, ReviewModule } from '@authority/review';
import { ChangeReviewIdSchema } from '@authority/review/schema';
import type { AppEnv } from '../env.ts';
import {
  httpStatusForError,
  respondError,
  toErrorEnvelope,
  validationInvalidRequest,
} from '../errors.ts';

const REVIEW_STATUS_BY_CODE: Record<string, ContentfulStatusCode> = {
  'review.not_found': 404,
  'review.not_open': 409,
  'review.open_review_exists': 409,
  'review.gate_blocked': 409,
  'policy.version_not_found': 404,
  'policy.transition_not_allowed': 409,
  'policy.in_review_exists': 409,
  'replay.group_not_found': 404,
  'replay.run_not_found': 404,
  'replay.source_invalid': 422,
  'replay.classifier_version_mismatch': 409,
};

/** Responds with the review/policy/replay error's status; the shared mapper does not know these codes. */
function respondReviewError(c: Context<AppEnv>, error: AppError): Response {
  const requestId = c.get('requestId');
  const status = REVIEW_STATUS_BY_CODE[error.code] ?? httpStatusForError(error);
  return c.json(toErrorEnvelope(error, requestId), status, { 'X-Request-Id': requestId });
}

function reviewNotFound(): AppError {
  return {
    code: 'review.not_found',
    message: 'no change review for the given id',
    isRetryable: false,
    details: null,
    cause: null,
  };
}

function toResponse(view: ChangeReviewView): unknown {
  return ChangeReviewResponseSchema.parse({
    ...view.review,
    replaySummary: view.replaySummary,
    gate: view.gate,
    traceSources: view.traceSources,
  });
}

function toPage(views: readonly ChangeReviewView[], nextCursor: string | null): unknown {
  return ListChangeReviewsResponseSchema.parse({ items: views.map(toResponse), nextCursor });
}

export function registerChangeReviewsRoutes(app: Hono<AppEnv>, review: ReviewModule): void {
  app.post('/api/v1/change-reviews', async (c) => {
    const body: unknown = await c.req.json().catch(() => null);
    const parsed = CreateChangeReviewRequestSchema.safeParse(body);
    if (!parsed.success) {
      return respondError(c, validationInvalidRequest({ issues: parsed.error.issues }));
    }
    const result = await review.createChangeReview(parsed.data);
    if (!result.ok) {
      return respondReviewError(c, result.error);
    }
    return c.json(toResponse(result.value), 202);
  });

  app.get('/api/v1/change-reviews', async (c) => {
    const query = ListChangeReviewsQuerySchema.safeParse(c.req.query());
    if (!query.success) {
      return respondError(c, validationInvalidRequest({ issues: query.error.issues }));
    }
    const result = await review.listChangeReviews({
      policyId: query.data.policyId,
      cursor: query.data.cursor,
      limit: query.data.limit,
    });
    if (!result.ok) {
      return respondReviewError(c, result.error);
    }
    return c.json(toPage(result.value.items, result.value.nextCursor));
  });

  app.get('/api/v1/change-reviews/:id', async (c) => {
    const id = ChangeReviewIdSchema.safeParse(c.req.param('id'));
    if (!id.success) {
      return respondReviewError(c, reviewNotFound());
    }
    const result = await review.getChangeReview(id.data);
    if (!result.ok) {
      return respondReviewError(c, result.error);
    }
    return c.json(toResponse(result.value));
  });

  app.get('/api/v1/change-reviews/:id/diff-groups', async (c) => {
    const id = ChangeReviewIdSchema.safeParse(c.req.param('id'));
    if (!id.success) {
      return respondReviewError(c, reviewNotFound());
    }
    const query = ListReviewDiffGroupsQuerySchema.safeParse(c.req.query());
    if (!query.success) {
      return respondError(c, validationInvalidRequest({ issues: query.error.issues }));
    }
    const result = await review.listDiffGroups(id.data, {
      direction: query.data.direction,
      severity: query.data.severity,
      verdict: query.data.verdict,
      cursor: query.data.cursor,
      limit: query.data.limit,
    });
    if (!result.ok) {
      return respondReviewError(c, result.error);
    }
    return c.json(ListReviewDiffGroupsResponseSchema.parse(result.value));
  });

  app.get('/api/v1/change-reviews/:id/adoption-groups', async (c) => {
    const id = ChangeReviewIdSchema.safeParse(c.req.param('id'));
    if (!id.success) {
      return respondReviewError(c, reviewNotFound());
    }
    const query = ListReviewAdoptionGroupsQuerySchema.safeParse(c.req.query());
    if (!query.success) {
      return respondError(c, validationInvalidRequest({ issues: query.error.issues }));
    }
    const result = await review.listAdoptionGroups(id.data, {
      effect: query.data.effect,
      verdict: query.data.verdict,
      cursor: query.data.cursor,
      limit: query.data.limit,
    });
    if (!result.ok) {
      return respondReviewError(c, result.error);
    }
    return c.json(ListReviewAdoptionGroupsResponseSchema.parse(result.value));
  });

  app.put('/api/v1/change-reviews/:id/verdicts/:groupKey', async (c) => {
    const id = ChangeReviewIdSchema.safeParse(c.req.param('id'));
    const groupKey = Sha256Schema.safeParse(c.req.param('groupKey'));
    if (!id.success || !groupKey.success) {
      return respondReviewError(c, reviewNotFound());
    }
    const body: unknown = await c.req.json().catch(() => null);
    const parsed = RecordVerdictRequestSchema.safeParse(body);
    if (!parsed.success) {
      return respondError(c, validationInvalidRequest({ issues: parsed.error.issues }));
    }
    const result = await review.recordVerdict({
      changeReviewId: id.data,
      groupKey: groupKey.data,
      verdict: parsed.data.verdict,
      note: parsed.data.note,
    });
    if (!result.ok) {
      return respondReviewError(c, result.error);
    }
    return c.json(VerdictResponseSchema.parse(result.value));
  });

  app.post('/api/v1/change-reviews/:id/decisions', async (c) => {
    const id = ChangeReviewIdSchema.safeParse(c.req.param('id'));
    if (!id.success) {
      return respondReviewError(c, reviewNotFound());
    }
    const body: unknown = await c.req.json().catch(() => null);
    const parsed = CreateDecisionRequestSchema.safeParse(body);
    if (!parsed.success) {
      return respondError(c, validationInvalidRequest({ issues: parsed.error.issues }));
    }
    const result = await review.decide({
      changeReviewId: id.data,
      decision: parsed.data.decision,
      note: parsed.data.note,
      reviewerName: parsed.data.reviewerName,
    });
    if (!result.ok) {
      return respondReviewError(c, result.error);
    }
    return c.json(toResponse(result.value), 201);
  });

  app.post('/api/v1/change-reviews/:id/withdrawals', async (c) => {
    const id = ChangeReviewIdSchema.safeParse(c.req.param('id'));
    if (!id.success) {
      return respondReviewError(c, reviewNotFound());
    }
    const result = await review.withdraw(id.data);
    if (!result.ok) {
      return respondReviewError(c, result.error);
    }
    return c.json(toResponse(result.value), 201);
  });

  app.get('/api/v1/change-reviews/:id/report', async (c) => {
    const id = ChangeReviewIdSchema.safeParse(c.req.param('id'));
    if (!id.success) {
      return respondReviewError(c, reviewNotFound());
    }
    const result = await review.getReport(id.data);
    if (!result.ok) {
      return respondReviewError(c, result.error);
    }
    return c.body(result.value, 200, {
      'Content-Type': 'text/markdown; charset=utf-8',
      'X-Request-Id': c.get('requestId'),
    });
  });
}
