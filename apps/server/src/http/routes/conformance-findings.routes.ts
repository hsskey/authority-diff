import type { Hono } from 'hono';
import { Sha256Schema } from '@authority/kernel';
import {
  AcknowledgeConformanceFindingRequestSchema,
  ConformanceFindingResponseSchema,
  CreatePolicyDraftFromFindingRequestSchema,
  ListConformanceFindingsResponseSchema,
  PolicyVersionResponseSchema,
} from '@authority/contracts/schema';
import type { ReplayModule } from '@authority/replay';
import type { ReviewModule } from '@authority/review';
import type { AppEnv } from '../env.ts';
import { respondError, validationInvalidRequest } from '../errors.ts';

function findingNotFound() {
  return {
    code: 'replay.finding_not_found',
    message: 'no Conformance Finding for the given finding key',
    isRetryable: false,
    details: null,
    cause: null,
  };
}

export function registerConformanceFindingsRoutes(app: Hono<AppEnv>, replay: ReplayModule): void {
  app.get('/api/v1/conformance-findings', async (c) => {
    const findings = await replay.listConformanceFindings();
    return c.json(ListConformanceFindingsResponseSchema.parse(findings));
  });

  app.put('/api/v1/conformance-findings/:id', async (c) => {
    const id = Sha256Schema.safeParse(c.req.param('id'));
    if (!id.success) {
      return respondError(c, findingNotFound());
    }
    const body: unknown = await c.req.json().catch(() => null);
    const parsed = AcknowledgeConformanceFindingRequestSchema.safeParse(body);
    if (!parsed.success) {
      return respondError(c, validationInvalidRequest({ issues: parsed.error.issues }));
    }
    const result = await replay.acknowledgeConformanceFinding(id.data, parsed.data.note);
    if (!result.ok) {
      return respondError(c, result.error);
    }
    return c.json(ConformanceFindingResponseSchema.parse(result.value));
  });
}

export function registerConformanceFindingDraftRoutes(
  app: Hono<AppEnv>,
  review: Pick<ReviewModule, 'createPolicyDraftFromFinding'>,
): void {
  app.post('/api/v1/conformance-findings/:id/policy-drafts', async (c) => {
    const id = Sha256Schema.safeParse(c.req.param('id'));
    if (!id.success) {
      return respondError(c, findingNotFound());
    }
    const body: unknown = await c.req.json().catch(() => null);
    const parsed = CreatePolicyDraftFromFindingRequestSchema.safeParse(body);
    if (!parsed.success) {
      return respondError(c, validationInvalidRequest({ issues: parsed.error.issues }));
    }
    const result = await review.createPolicyDraftFromFinding(id.data, parsed.data.effect);
    if (!result.ok) {
      return respondError(c, result.error);
    }
    return c.json(PolicyVersionResponseSchema.parse(result.value), 201);
  });
}
