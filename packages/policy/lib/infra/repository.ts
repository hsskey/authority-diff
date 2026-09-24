import { and, asc, desc, eq, gt, max } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { err, invariant, ok } from '@authority/kernel';
import type { AppError, Clock, IdGenerator, Result } from '@authority/kernel';
import { canonicalJson, sha256Hex } from '@authority/kernel/hash';
import {
  PolicyActivationSchema,
  PolicySchema,
  PolicyVersionSchema,
  type Policy,
  type PolicyActivation,
  type PolicyDocument,
  type PolicyId,
  type PolicyVersion,
  type PolicyVersionId,
} from '../../schema.ts';
import { DEFAULT_POLICY_DOCUMENT } from '../domain/default-policy-document.ts';
import { EMPTY_POLICY_DOCUMENT } from '../domain/empty-policy-document.ts';
import { nextStatus, type PolicyTransition } from '../domain/transition.ts';
import { upgradePolicyDocument } from '../domain/upgrade-policy-document.ts';
import { validatePolicyDocument } from '../domain/validate-policy-document.ts';
import { policies, policyActivations, policyVersions } from './tables.ts';

export interface CreatePolicyInput {
  readonly name: string;
  readonly template: 'default' | 'empty';
}

export interface SeedAcceptedPolicyInput {
  readonly name: string;
  readonly document: PolicyDocument;
}

export interface SeedAcceptedPolicyResult {
  readonly policy: Policy;
  readonly version: PolicyVersion;
  readonly created: boolean;
}

export interface DeclareActivationInput {
  readonly reason: string;
  readonly actorName: string;
}

export interface PolicyPage {
  readonly items: readonly Policy[];
  readonly nextCursor: string | null;
}

export interface PolicyVersionPage {
  readonly items: readonly PolicyVersion[];
  readonly nextCursor: string | null;
}

export interface PolicyRepository {
  /** Creates a Policy whose version 1 is a draft built from the template. */
  createPolicy(
    input: CreatePolicyInput,
  ): Promise<Result<{ policy: Policy; initialVersion: PolicyVersion }, AppError>>;
  listPolicies(cursor: string | null, limit: number): Promise<Result<PolicyPage, AppError>>;
  /** The Policy's versions in version order, oldest first; the cursor is the last version's versionNumber. */
  listVersions(
    policyId: PolicyId,
    cursor: string | null,
    limit: number,
  ): Promise<Result<PolicyVersionPage, AppError>>;
  getVersion(id: PolicyVersionId): Promise<Result<PolicyVersion, AppError>>;
  /** A new draft from the base version's document upgraded to schemaVersion 2; the base version is never rewritten. */
  createDraftVersion(
    policyId: PolicyId,
    baseVersionId: PolicyVersionId,
  ): Promise<Result<PolicyVersion, AppError>>;
  updateDraftDocument(
    id: PolicyVersionId,
    ifMatch: string,
    document: PolicyDocument,
  ): Promise<Result<PolicyVersion, AppError>>;
  transitionVersion(
    id: PolicyVersionId,
    transition: PolicyTransition,
  ): Promise<Result<PolicyVersion, AppError>>;
  /** The latest accepted version, or `policy.no_accepted_version` when none was accepted yet. */
  getBaseline(policyId: PolicyId): Promise<Result<PolicyVersion, AppError>>;
  hasAcceptedVersion(policyId: PolicyId): Promise<Result<boolean, AppError>>;
  /**
   * Records that an operator applied an accepted version. The version's status
   * and every other read stay unchanged; `policy.version_not_accepted` when the
   * version is not `accepted`.
   */
  declareActivation(
    id: PolicyVersionId,
    input: DeclareActivationInput,
  ): Promise<Result<PolicyActivation, AppError>>;
  /**
   * Legacy, test-only path: inserts an accepted version 1 without a Change
   * Review. Product code creates a draft version 1 with `createPolicy` and
   * accepts it through review; this stays for fixtures and mirrors the rows
   * that were seeded before that change, which remain valid.
   */
  seedAcceptedPolicy(
    input: SeedAcceptedPolicyInput,
  ): Promise<Result<SeedAcceptedPolicyResult, AppError>>;
}

export interface PolicyRepositoryDeps {
  readonly db: PostgresJsDatabase;
  readonly clock: Clock;
  readonly idGenerator: IdGenerator;
}

const contentHash = (document: PolicyDocument): string => sha256Hex(canonicalJson(document));

const toPolicy = (row: typeof policies.$inferSelect): Policy => PolicySchema.parse(row);
const toVersion = (row: typeof policyVersions.$inferSelect): PolicyVersion =>
  PolicyVersionSchema.parse(row);
const toActivation = (row: typeof policyActivations.$inferSelect): PolicyActivation =>
  PolicyActivationSchema.parse(row);

// drizzle wraps the driver error in a DrizzleQueryError and keeps the
// PostgresError (code, constraint_name) on `cause`, so walk the cause chain.
function pgError(cause: unknown): { code?: unknown; constraint_name?: unknown } | null {
  let current = cause;
  for (let depth = 0; depth < 5; depth++) {
    if (typeof current !== 'object' || current === null) {
      return null;
    }
    if ('code' in current && typeof current.code === 'string') {
      return current;
    }
    current = 'cause' in current ? current.cause : null;
  }
  return null;
}

function isUniqueViolation(cause: unknown, constraint: string): boolean {
  const error = pgError(cause);
  return error !== null && error.code === '23505' && error.constraint_name === constraint;
}

function versionNotFound(id: PolicyVersionId): AppError {
  return {
    code: 'policy.version_not_found',
    message: `no policy version ${id}`,
    isRetryable: false,
    details: { id },
    cause: null,
  };
}

function internal(cause: unknown): AppError {
  return {
    code: 'internal.unexpected',
    message: 'the policy store failed',
    isRetryable: false,
    details: null,
    cause,
  };
}

export function createPolicyRepository(deps: PolicyRepositoryDeps): PolicyRepository {
  const { db, clock, idGenerator } = deps;

  const loadVersion = async (id: PolicyVersionId): Promise<PolicyVersion | null> => {
    const [row] = await db.select().from(policyVersions).where(eq(policyVersions.id, id)).limit(1);
    return row === undefined ? null : toVersion(row);
  };

  return {
    async createPolicy(input) {
      const now = clock.now();
      const policyId = idGenerator.next('pol');
      const versionId = idGenerator.next('pver');
      const document =
        input.template === 'default' ? DEFAULT_POLICY_DOCUMENT : EMPTY_POLICY_DOCUMENT;
      try {
        const created = await db.transaction(async (tx) => {
          const [policyRow] = await tx
            .insert(policies)
            .values({ id: policyId, name: input.name, createdAt: now })
            .returning();
          const [versionRow] = await tx
            .insert(policyVersions)
            .values({
              id: versionId,
              policyId,
              versionNumber: 1,
              status: 'draft',
              document,
              contentHash: contentHash(document),
              baseVersionId: null,
              createdAt: now,
              updatedAt: now,
            })
            .returning();
          invariant(policyRow !== undefined && versionRow !== undefined, 'insert returned no row');
          return { policyRow, versionRow };
        });
        return ok({
          policy: toPolicy(created.policyRow),
          initialVersion: toVersion(created.versionRow),
        });
      } catch (cause) {
        if (isUniqueViolation(cause, 'uq_policies__name')) {
          return err({
            code: 'policy.name_conflict',
            message: `a policy named ${input.name} already exists`,
            isRetryable: false,
            details: { name: input.name },
            cause: null,
          });
        }
        return err(internal(cause));
      }
    },

    async listPolicies(cursor, limit) {
      try {
        const rows = await db
          .select()
          .from(policies)
          .where(cursor === null ? undefined : gt(policies.id, cursor))
          .orderBy(asc(policies.id))
          .limit(limit + 1);
        const items = rows.slice(0, limit).map(toPolicy);
        const nextCursor = rows.length > limit ? (items.at(-1)?.id ?? null) : null;
        return ok({ items, nextCursor });
      } catch (cause) {
        return err(internal(cause));
      }
    },

    async listVersions(policyId, cursor, limit) {
      let after: number | null = null;
      if (cursor !== null) {
        if (!/^\d+$/.test(cursor)) {
          return err({
            code: 'validation.invalid_request',
            message: `invalid policy versions cursor ${cursor}`,
            isRetryable: false,
            details: { cursor },
            cause: null,
          });
        }
        after = Number(cursor);
      }
      try {
        const rows = await db
          .select()
          .from(policyVersions)
          .where(
            after === null
              ? eq(policyVersions.policyId, policyId)
              : and(eq(policyVersions.policyId, policyId), gt(policyVersions.versionNumber, after)),
          )
          .orderBy(asc(policyVersions.versionNumber))
          .limit(limit + 1);
        const items = rows.slice(0, limit).map(toVersion);
        const last = items.at(-1);
        const nextCursor =
          rows.length > limit && last !== undefined ? String(last.versionNumber) : null;
        return ok({ items, nextCursor });
      } catch (cause) {
        return err(internal(cause));
      }
    },

    async getVersion(id) {
      try {
        const version = await loadVersion(id);
        return version === null ? err(versionNotFound(id)) : ok(version);
      } catch (cause) {
        return err(internal(cause));
      }
    },

    async createDraftVersion(policyId, baseVersionId) {
      const now = clock.now();
      const draftId = idGenerator.next('pver');
      try {
        return await db.transaction(async (tx): Promise<Result<PolicyVersion, AppError>> => {
          const [baseRow] = await tx
            .select()
            .from(policyVersions)
            .where(and(eq(policyVersions.id, baseVersionId), eq(policyVersions.policyId, policyId)))
            .limit(1);
          if (baseRow === undefined) {
            return err(versionNotFound(baseVersionId));
          }
          const base = toVersion(baseRow);
          const document = upgradePolicyDocument(base.document);

          const [openDraft] = await tx
            .select({ id: policyVersions.id })
            .from(policyVersions)
            .where(and(eq(policyVersions.policyId, policyId), eq(policyVersions.status, 'draft')))
            .limit(1);
          if (openDraft !== undefined) {
            return err({
              code: 'policy.draft_exists',
              message: `policy ${policyId} already has an open draft`,
              isRetryable: false,
              details: { policyId },
              cause: null,
            });
          }

          const [highest] = await tx
            .select({ value: max(policyVersions.versionNumber) })
            .from(policyVersions)
            .where(eq(policyVersions.policyId, policyId));

          const [draftRow] = await tx
            .insert(policyVersions)
            .values({
              id: draftId,
              policyId,
              versionNumber: (highest?.value ?? 0) + 1,
              status: 'draft',
              document,
              contentHash: contentHash(document),
              baseVersionId,
              createdAt: now,
              updatedAt: now,
            })
            .returning();
          invariant(draftRow !== undefined, 'insert returned no row');
          return ok(toVersion(draftRow));
        });
      } catch (cause) {
        return err(internal(cause));
      }
    },

    async updateDraftDocument(id, ifMatch, document) {
      const now = clock.now();
      try {
        const [row] = await db
          .update(policyVersions)
          .set({ document, contentHash: contentHash(document), updatedAt: now })
          .where(
            and(
              eq(policyVersions.id, id),
              eq(policyVersions.status, 'draft'),
              eq(policyVersions.contentHash, ifMatch),
            ),
          )
          .returning();
        if (row !== undefined) {
          return ok(toVersion(row));
        }
        const existing = await loadVersion(id);
        if (existing === null) {
          return err(versionNotFound(id));
        }
        if (existing.status !== 'draft') {
          return err({
            code: 'policy.version_not_draft',
            message: `policy version ${id} is ${existing.status}, not draft`,
            isRetryable: false,
            details: { id, status: existing.status },
            cause: null,
          });
        }
        return err({
          code: 'policy.content_conflict',
          message: `policy version ${id} was modified since ${ifMatch}`,
          isRetryable: false,
          details: { id, expected: ifMatch, actual: existing.contentHash },
          cause: null,
        });
      } catch (cause) {
        return err(internal(cause));
      }
    },

    async transitionVersion(id, transition) {
      const now = clock.now();
      try {
        return await db.transaction(async (tx): Promise<Result<PolicyVersion, AppError>> => {
          const [row] = await tx
            .select()
            .from(policyVersions)
            .where(eq(policyVersions.id, id))
            .limit(1);
          if (row === undefined) {
            return err(versionNotFound(id));
          }
          const current = toVersion(row);
          const target = nextStatus(current.status, transition);
          if (!target.ok) {
            return target;
          }
          const [updated] = await tx
            .update(policyVersions)
            .set({ status: target.value, updatedAt: now })
            .where(and(eq(policyVersions.id, id), eq(policyVersions.status, current.status)))
            .returning();
          invariant(updated !== undefined, 'transition matched no row');
          return ok(toVersion(updated));
        });
      } catch (cause) {
        if (isUniqueViolation(cause, 'uq_policy_versions__one_in_review')) {
          return err({
            code: 'policy.in_review_exists',
            message: `policy version ${id} cannot enter review while another version is in review`,
            isRetryable: false,
            details: { id },
            cause: null,
          });
        }
        return err(internal(cause));
      }
    },

    async getBaseline(policyId) {
      try {
        const [accepted] = await db
          .select()
          .from(policyVersions)
          .where(and(eq(policyVersions.policyId, policyId), eq(policyVersions.status, 'accepted')))
          .orderBy(desc(policyVersions.versionNumber))
          .limit(1);
        if (accepted !== undefined) {
          return ok(toVersion(accepted));
        }
        return err({
          code: 'policy.no_accepted_version',
          message: `policy ${policyId} has no accepted version`,
          isRetryable: false,
          details: { policyId },
          cause: null,
        });
      } catch (cause) {
        return err(internal(cause));
      }
    },

    async hasAcceptedVersion(policyId) {
      try {
        const [accepted] = await db
          .select({ id: policyVersions.id })
          .from(policyVersions)
          .where(and(eq(policyVersions.policyId, policyId), eq(policyVersions.status, 'accepted')))
          .limit(1);
        return ok(accepted !== undefined);
      } catch (cause) {
        return err(internal(cause));
      }
    },

    async declareActivation(id, input) {
      try {
        const version = await loadVersion(id);
        if (version === null) {
          return err(versionNotFound(id));
        }
        if (version.status !== 'accepted') {
          return err({
            code: 'policy.version_not_accepted',
            message: `policy version ${id} is ${version.status}, not accepted`,
            isRetryable: false,
            details: { id, status: version.status },
            cause: null,
          });
        }
        const [row] = await db
          .insert(policyActivations)
          .values({
            id: idGenerator.next('pact'),
            policyVersionId: id,
            reason: input.reason,
            actorName: input.actorName,
            createdAt: clock.now(),
          })
          .returning();
        invariant(row !== undefined, 'insert returned no row');
        return ok(toActivation(row));
      } catch (cause) {
        return err(internal(cause));
      }
    },

    async seedAcceptedPolicy(input) {
      const issues = validatePolicyDocument(input.document);
      if (issues.length > 0) {
        return err({
          code: 'policy.document_invalid',
          message: 'the policy document is invalid',
          isRetryable: false,
          details: { issues },
          cause: null,
        });
      }
      const expectedHash = contentHash(input.document);
      try {
        const [existingPolicy] = await db
          .select()
          .from(policies)
          .where(eq(policies.name, input.name))
          .limit(1);
        if (existingPolicy !== undefined) {
          const [versionRow] = await db
            .select()
            .from(policyVersions)
            .where(
              and(
                eq(policyVersions.policyId, existingPolicy.id),
                eq(policyVersions.versionNumber, 1),
              ),
            )
            .limit(1);
          if (versionRow === undefined) {
            return err(internal(new Error(`policy ${input.name} has no version 1`)));
          }
          const version = toVersion(versionRow);
          if (version.contentHash !== expectedHash) {
            return err({
              code: 'policy.seed_document_mismatch',
              message: `policy ${input.name} exists with a different document`,
              isRetryable: false,
              details: { name: input.name },
              cause: null,
            });
          }
          return ok({
            policy: toPolicy(existingPolicy),
            version,
            created: false,
          });
        }

        const now = clock.now();
        const policyId = idGenerator.next('pol');
        const versionId = idGenerator.next('pver');
        const created = await db.transaction(async (tx) => {
          const [policyRow] = await tx
            .insert(policies)
            .values({ id: policyId, name: input.name, createdAt: now })
            .returning();
          const [versionRow] = await tx
            .insert(policyVersions)
            .values({
              id: versionId,
              policyId,
              versionNumber: 1,
              status: 'accepted',
              document: input.document,
              contentHash: expectedHash,
              baseVersionId: null,
              createdAt: now,
              updatedAt: now,
            })
            .returning();
          invariant(policyRow !== undefined && versionRow !== undefined, 'insert returned no row');
          return { policyRow, versionRow };
        });
        return ok({
          policy: toPolicy(created.policyRow),
          version: toVersion(created.versionRow),
          created: true,
        });
      } catch (cause) {
        if (isUniqueViolation(cause, 'uq_policies__name')) {
          return err({
            code: 'policy.name_conflict',
            message: `a policy named ${input.name} already exists`,
            isRetryable: false,
            details: { name: input.name },
            cause: null,
          });
        }
        return err(internal(cause));
      }
    },
  };
}
