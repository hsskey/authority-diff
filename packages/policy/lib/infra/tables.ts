import { sql } from 'drizzle-orm';
import { index, integer, jsonb, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core';
import type { PolicyDocument } from '../../schema.ts';

// docs/design.md 25장. Timestamp는 IsoTimestamp 문자열(밀리초 3자리, `Z`)을 그대로
// 보존하려고 text로 저장한다. timestamptz는 postgres가 다른 표기로 되돌려주어 브랜드
// 형식이 깨진다. ISO-Z UTC 문자열은 사전순 정렬이 시간순과 같다.
export const policies = pgTable(
  'policies',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => [uniqueIndex('uq_policies__name').on(t.name)],
);

export const policyVersions = pgTable(
  'policy_versions',
  {
    id: text('id').primaryKey(),
    policyId: text('policy_id').notNull(),
    versionNumber: integer('version_number').notNull(),
    status: text('status').notNull(),
    document: jsonb('document').$type<PolicyDocument>().notNull(),
    contentHash: text('content_hash').notNull(),
    baseVersionId: text('base_version_id'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [
    uniqueIndex('uq_policy_versions__policy_id_version_number').on(t.policyId, t.versionNumber),
    uniqueIndex('uq_policy_versions__one_in_review')
      .on(t.policyId)
      .where(sql`${t.status} = 'in_review'`),
  ],
);

export const policyActivations = pgTable(
  'policy_activations',
  {
    id: text('id').primaryKey(),
    policyVersionId: text('policy_version_id')
      .notNull()
      .references(() => policyVersions.id),
    reason: text('reason').notNull(),
    actorName: text('actor_name').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => [index('idx_policy_activations__policy_version_id').on(t.policyVersionId)],
);
