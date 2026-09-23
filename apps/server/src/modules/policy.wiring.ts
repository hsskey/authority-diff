import type { Hono } from 'hono';
import type { AppError, Clock, IdGenerator, Logger, TransactionRunner } from '@authority/kernel';
import {
  CreatePolicyRequestSchema,
  CreatePolicyVersionRequestSchema,
  UpdatePolicyVersionRequestSchema,
} from '@authority/contracts/schema';
import { createPolicyModule, createPolicyRepository } from '@authority/policy';
import type { PolicyModule, PolicyRepositoryDeps } from '@authority/policy';
import { PolicyIdSchema, PolicyVersionIdSchema } from '@authority/policy/schema';
import type { AppEnv } from '../http/env.ts';
import { respondError } from '../http/errors.ts';

// The db handle type is taken from @authority/policy so the server never
// imports drizzle-orm directly (see .dependency-cruiser.cjs / no-restricted-imports).
export interface PolicyWiringDeps {
  readonly db: PolicyRepositoryDeps['db'];
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly logger: Logger;
  readonly transactionRunner: TransactionRunner;
}

const API = '/api/v1';

function invalidRequest(message: string, details: Record<string, unknown>): AppError {
  return { code: 'validation.invalid_request', message, isRetryable: false, details, cause: null };
}

function parseLimit(raw: string | undefined): number | null {
  if (raw === undefined) {
    return 50;
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > 200) {
    return null;
  }
  return value;
}

async function readJson(c: { req: { json(): Promise<unknown> } }): Promise<unknown> {
  return c.req.json().then(
    (value) => value,
    () => null,
  );
}

export function registerPolicyRoutes(app: Hono<AppEnv>, policy: PolicyModule): void {
  app.post(`${API}/policies`, async (c) => {
    const parsed = CreatePolicyRequestSchema.safeParse(await readJson(c));
    if (!parsed.success) {
      return respondError(
        c,
        invalidRequest('invalid create-policy request', parsed.error.format()),
      );
    }
    const result = await policy.createPolicy(parsed.data);
    if (!result.ok) {
      return respondError(c, result.error);
    }
    return c.json(result.value, 201);
  });

  app.get(`${API}/policies`, async (c) => {
    const limit = parseLimit(c.req.query('limit'));
    if (limit === null) {
      return respondError(c, invalidRequest('limit must be an integer in 1..200', {}));
    }
    const cursor = c.req.query('cursor') ?? null;
    const result = await policy.listPolicies(cursor, limit);
    if (!result.ok) {
      return respondError(c, result.error);
    }
    return c.json({ items: result.value.items, nextCursor: result.value.nextCursor });
  });

  app.post(`${API}/policies/:policyId/versions`, async (c) => {
    const policyId = PolicyIdSchema.safeParse(c.req.param('policyId'));
    if (!policyId.success) {
      return respondError(c, invalidRequest('invalid policy id', {}));
    }
    const parsed = CreatePolicyVersionRequestSchema.safeParse(await readJson(c));
    if (!parsed.success) {
      return respondError(
        c,
        invalidRequest('invalid create-version request', parsed.error.format()),
      );
    }
    const result = await policy.createDraftVersion(policyId.data, parsed.data.baseVersionId);
    if (!result.ok) {
      return respondError(c, result.error);
    }
    return c.json(result.value, 201);
  });

  app.get(`${API}/policy-versions/:id`, async (c) => {
    const id = PolicyVersionIdSchema.safeParse(c.req.param('id'));
    if (!id.success) {
      return respondError(c, invalidRequest('invalid version id', {}));
    }
    const result = await policy.getVersion(id.data);
    if (!result.ok) {
      return respondError(c, result.error);
    }
    c.header('ETag', result.value.contentHash);
    return c.json(result.value);
  });

  app.put(`${API}/policy-versions/:id`, async (c) => {
    const id = PolicyVersionIdSchema.safeParse(c.req.param('id'));
    if (!id.success) {
      return respondError(c, invalidRequest('invalid version id', {}));
    }
    const ifMatch = c.req.header('If-Match');
    if (ifMatch === undefined || ifMatch.length === 0) {
      return respondError(c, {
        code: 'policy.precondition_required',
        message: 'If-Match header carrying the current content hash is required',
        isRetryable: false,
        details: null,
        cause: null,
      });
    }
    const parsed = UpdatePolicyVersionRequestSchema.safeParse(await readJson(c));
    if (!parsed.success) {
      return respondError(c, {
        code: 'policy.document_invalid',
        message: 'the policy document is invalid',
        isRetryable: false,
        details: parsed.error.format(),
        cause: null,
      });
    }
    const result = await policy.updateDraftDocument(id.data, ifMatch, parsed.data.document);
    if (!result.ok) {
      return respondError(c, result.error);
    }
    c.header('ETag', result.value.contentHash);
    return c.json(result.value);
  });

  app.post(`${API}/policy-versions/:id/validations`, async (c) => {
    const id = PolicyVersionIdSchema.safeParse(c.req.param('id'));
    if (!id.success) {
      return respondError(c, invalidRequest('invalid version id', {}));
    }
    const result = await policy.validateVersion(id.data);
    if (!result.ok) {
      return respondError(c, result.error);
    }
    return c.json(result.value);
  });
}

export function wirePolicy(app: Hono<AppEnv>, deps: PolicyWiringDeps): void {
  const policy = createPolicyModule(
    createPolicyRepository({ db: deps.db, clock: deps.clock, idGenerator: deps.ids }),
  );
  registerPolicyRoutes(app, policy);
}
