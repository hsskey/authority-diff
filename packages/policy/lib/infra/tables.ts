import { sql } from 'drizzle-orm';
import { integer, jsonb, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core';
import type { PolicyDocument } from '../../schema.ts';

// Store IsoTimestamp as text: timestamptz rewrites the brand format; ISO-Z UTC sorts as time (docs/design.md chapter 25).
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
