import { expect, test } from 'vitest';
import { IsoTimestampSchema } from '@authority/kernel';
import { renderAdoptionReport, renderReport } from '../index.ts';
import type { AdoptionReportInput, ReportInput } from '../index.ts';

const BASELINE_HASH = 'a'.repeat(64);
const CANDIDATE_HASH = 'b'.repeat(64);
const DECISION_HASH = 'c'.repeat(64);
const REPLAY_INPUTS_HASH = 'd'.repeat(64);
const REPLAY_RESULT_HASH = 'e'.repeat(64);
const TAIL_HASH = 'f'.repeat(64);
const AUDIT_TAIL = { sequence: 9, hash: TAIL_HASH };
const TRACE_SOURCES = { transcript: 47, hook: 0, synthetic: 0 };
const CONFORMANCE = {
  replayRunId: 'rpl_0123456789abcdefghjkmnpqrs',
  policyVersionId: 'pver_0123456789abcdefghjkmnpqrs',
  windowFrom: IsoTimestampSchema.parse('2026-01-15T00:00:00.000Z'),
  windowTo: IsoTimestampSchema.parse('2026-02-01T00:00:00.000Z'),
  observationGaps: [],
  byPermissionMode: [
    { permissionMode: 'bypassPermissions', actionCount: 30, findingCount: 12 },
    { permissionMode: 'default', actionCount: 17, findingCount: 3 },
  ],
};

function makeInput(overrides: Partial<ReportInput> = {}): ReportInput {
  return {
    changeReviewId: 'rev_0123456789abcdefghjkmnpqrs',
    status: 'accepted',
    baselineContentHash: BASELINE_HASH,
    candidateContentHash: CANDIDATE_HASH,
    windowFrom: IsoTimestampSchema.parse('2026-01-01T00:00:00.000Z'),
    windowTo: IsoTimestampSchema.parse('2026-02-01T00:00:00.000Z'),
    traceSources: TRACE_SOURCES,
    evaluatedActions: 47,
    changedActions: 15,
    analyzabilityNoneCount: 2,
    transitions: [{ from: 'ask', to: 'allow', count: 15 }],
    operationWidening: [],
    groups: [
      {
        direction: 'widening',
        headline:
          "github.com/acme-oss/toolkit and 1 other Target: 15 push Actions change from 'ask' to 'allow'.",
        fromEffect: 'ask',
        toEffect: 'allow',
        actionCount: 15,
        targetSummary: [{ key: 'github.com/acme-oss/toolkit', count: 9 }],
        verdict: 'expected',
      },
    ],
    conformance: CONFORMANCE,
    decision: {
      decision: 'accept',
      reviewerName: 'reviewer',
      decidedAt: IsoTimestampSchema.parse('2026-02-02T00:00:00.000Z'),
      note: 'Reviewed',
      sequence: 7,
      hash: DECISION_HASH,
      replayInputsHash: REPLAY_INPUTS_HASH,
      replayResultHash: REPLAY_RESULT_HASH,
    },
    auditTail: AUDIT_TAIL,
    ...overrides,
  };
}

test('the report carries the two fixed notice sentences verbatim', () => {
  const report = renderReport(makeInput());
  expect(report).toContain(
    'This record states that the policy change was reviewed against the past records above.',
  );
  expect(report).toContain(
    'Authority Diff did not deploy or enforce the policy and did not measure whether the runtime behaves as the policy says.',
  );
});

test('the report lists both content hashes, the window, and each headline', () => {
  const report = renderReport(makeInput());
  expect(report).toContain(BASELINE_HASH);
  expect(report).toContain(CANDIDATE_HASH);
  expect(report).toContain('2026-01-01T00:00:00.000Z ~ 2026-02-01T00:00:00.000Z');
  expect(report).toContain(
    "github.com/acme-oss/toolkit and 1 other Target: 15 push Actions change from 'ask' to 'allow'.",
  );
});

test('the report sums the modes that never prompt as the workload that could run without a guard', () => {
  const report = renderReport(makeInput());
  expect(report).toContain(
    'Actions that can run without a guard (bypassPermissions, auto): 30 (63.8%)',
  );
  expect(report).toContain('| bypassPermissions | 30 | 12 |');
  expect(report).toContain('rpl_0123456789abcdefghjkmnpqrs');
});

test('the report states each observation gap of the conformance window', () => {
  const report = renderReport(
    makeInput({
      conformance: {
        ...CONFORMANCE,
        observationGaps: [
          {
            from: IsoTimestampSchema.parse('2026-01-20T08:00:00.000Z'),
            to: IsoTimestampSchema.parse('2026-01-22T09:30:00.000Z'),
          },
        ],
      },
    }),
  );
  expect(report).toContain(
    '- Observation window: 2026-01-15T00:00:00.000Z ~ 2026-02-01T00:00:00.000Z\n- No observations from 2026-01-20T08:00:00.000Z to 2026-01-22T09:30:00.000Z.\n',
  );
});

test('the report has no observation gap line when the window has none', () => {
  const report = renderReport(makeInput());
  expect(report).not.toContain('No observations');
});

test('the report says so when no conformance run has completed', () => {
  const report = renderReport(makeInput({ conformance: null }));
  expect(report).toContain('No permission mode table because no conformance run has completed.');
});

test('the report names the reviewer and decision when decided', () => {
  const report = renderReport(makeInput());
  expect(report).toContain('reviewer');
  expect(report).toContain('- Decision: Policy change accepted');
});

test('the report labels a change Verdict with the review screen words', () => {
  const report = renderReport(makeInput());
  expect(report).toContain('## Effect transitions');
  expect(report).toContain('- Verdict: Expected change');
});

test('the report records the Decision Record sequence and hash when decided', () => {
  const report = renderReport(makeInput());
  expect(report).toContain(
    `- Decision Record sequence: 7\n- Decision Record hash: \`${DECISION_HASH}\``,
  );
});

test('the Policy Version section lists the decision record replay hashes', () => {
  const report = renderReport(makeInput());
  expect(report).toContain(
    `- Replay inputsHash: \`${REPLAY_INPUTS_HASH}\`\n- Replay resultHash: \`${REPLAY_RESULT_HASH}\``,
  );
});

test('the report shows the audit chain tail sequence and hash apart from the Decision Record', () => {
  const report = renderReport(makeInput());
  expect(report).toContain(
    `## Audit chain\n\n- Audit chain sequence when the report was generated: 9\n- Audit chain hash when the report was generated: \`${TAIL_HASH}\``,
  );
});

test('an undecided review still shows the audit chain tail', () => {
  const report = renderReport(makeInput({ decision: null }));
  expect(report).toContain(`Audit chain hash when the report was generated: \`${TAIL_HASH}\``);
});

test('an empty audit chain renders a placeholder instead of a tail', () => {
  const report = renderReport(makeInput({ auditTail: null }));
  expect(report).toContain('## Audit chain\n\nNo decision recorded yet.');
});

test('an undecided review still renders without a reviewer line', () => {
  const report = renderReport(makeInput({ decision: null }));
  expect(report).toContain('Not decided yet.');
});

test("a group's Target key is deriveTargetKey's first-two-segment form, never a full absolute path", () => {
  const report = renderReport(
    makeInput({
      groups: [
        {
          direction: 'widening',
          headline: "etc/nginx only: 4 read Actions change from 'ask' to 'allow'.",
          fromEffect: 'ask',
          toEffect: 'allow',
          actionCount: 4,
          targetSummary: [{ key: 'etc/nginx', count: 4 }],
          verdict: 'expected',
        },
      ],
    }),
  );
  expect(report).toContain('- etc/nginx (4)');
  expect(report).not.toContain('/etc/nginx/nginx.conf');
});

test('the report lists operation-level widening when Action effect is unchanged', () => {
  const report = renderReport(
    makeInput({
      changedActions: 0,
      transitions: [{ from: 'ask', to: 'ask', count: 1 }],
      operationWidening: [
        { capability: 'push', fromZone: 'public_remote', toZone: 'trusted_remote', count: 1 },
        { capability: 'push', fromZone: 'unknown_remote', toZone: 'trusted_remote', count: 2 },
      ],
      groups: [],
    }),
  );
  expect(report).toContain('## Operation-level widening with the Action Effect unchanged');
  expect(report).toContain('| Capability | Baseline Zone | Candidate Zone | Count |');
  expect(report).toContain('| push | unknown_remote | trusted_remote | 2 |');
  expect(report).toContain('| push | public_remote | trusted_remote | 1 |');
});

const ADOPTION_HEADLINE_ASK = "This policy gives 'ask' to 3 execute Actions in the host Zone.";
const ADOPTION_HEADLINE_DENY = "This policy gives 'deny' to 1 read Action in the credentials Zone.";

function makeAdoptionInput(overrides: Partial<AdoptionReportInput> = {}): AdoptionReportInput {
  return {
    changeReviewId: 'rev_0123456789abcdefghjkmnpqrs',
    status: 'accepted',
    candidateContentHash: CANDIDATE_HASH,
    windowFrom: IsoTimestampSchema.parse('2026-01-01T00:00:00.000Z'),
    windowTo: IsoTimestampSchema.parse('2026-02-01T00:00:00.000Z'),
    traceSources: TRACE_SOURCES,
    stats: {
      totalActions: 10,
      evaluatedActions: 8,
      excludedActions: 2,
      effectCounts: { allow: 4, ask: 3, deny: 1 },
      analyzability: { full: 5, partial: 1, none: 2 },
      cells: [],
    },
    groups: [
      {
        effect: 'deny',
        headline: ADOPTION_HEADLINE_DENY,
        actionCount: 1,
        sessionCount: 1,
        targetSummary: [{ key: '~/.synthetic-credentials', count: 1 }],
        verdict: 'expected',
      },
      {
        effect: 'ask',
        headline: ADOPTION_HEADLINE_ASK,
        actionCount: 3,
        sessionCount: 2,
        targetSummary: [{ key: 'unknown', count: 3 }],
        verdict: null,
      },
    ],
    decision: {
      decision: 'accept',
      reviewerName: 'reviewer',
      decidedAt: IsoTimestampSchema.parse('2026-02-02T00:00:00.000Z'),
      note: '',
      sequence: 3,
      hash: DECISION_HASH,
      replayInputsHash: REPLAY_INPUTS_HASH,
      replayResultHash: REPLAY_RESULT_HASH,
    },
    auditTail: AUDIT_TAIL,
    ...overrides,
  };
}

test('the adoption report carries the fixed notice and the adoption sentence verbatim', () => {
  const report = renderAdoptionReport(makeAdoptionInput());
  expect(report).toContain(
    'Authority Diff did not deploy or enforce the policy and did not measure whether the runtime behaves as the policy says.',
  );
  expect(report).toContain(
    'These figures apply the policy to past behavior; they do not reconstruct what the runtime approved at the time.',
  );
});

test('the adoption report lists the candidate hash, the window, and the analysis size', () => {
  const report = renderAdoptionReport(makeAdoptionInput());
  expect(report).toContain(`- Candidate Policy Version contentHash: \`${CANDIDATE_HASH}\``);
  expect(report).not.toContain('Baseline Policy Version');
  expect(report).toContain('2026-01-01T00:00:00.000Z ~ 2026-02-01T00:00:00.000Z');
  expect(report).toContain('- Analyzed Actions: 8 (total 10, excluded 2)');
  expect(report).toContain('- Of those, analyzability none: 2 (25.0%)');
});

test('the adoption report tabulates allow, ask, and deny counts with their rate of evaluated Actions', () => {
  const report = renderAdoptionReport(makeAdoptionInput());
  expect(report).toContain(
    '| Effect | Actions | Share |\n| --- | --- | --- |\n| allow | 4 | 50.0% |\n| ask | 3 | 37.5% |\n| deny | 1 | 12.5% |',
  );
});

test('the adoption report puts ask and deny groups in separate tables with each Verdict', () => {
  const report = renderAdoptionReport(makeAdoptionInput());
  const askSection = report.slice(
    report.indexOf("## 'ask' Adoption Groups and Verdicts"),
    report.indexOf("## 'deny' Adoption Groups and Verdicts"),
  );
  const denySection = report.slice(
    report.indexOf("## 'deny' Adoption Groups and Verdicts"),
    report.indexOf('## Decision'),
  );
  expect(askSection).toContain(`| ${ADOPTION_HEADLINE_ASK} | 3 | 2 | unknown (3) | Unreviewed |`);
  expect(askSection).not.toContain(ADOPTION_HEADLINE_DENY);
  expect(denySection).toContain(
    `| ${ADOPTION_HEADLINE_DENY} | 1 | 1 | ~/.synthetic-credentials (1) | Intended restriction |`,
  );
  expect(denySection).not.toContain(ADOPTION_HEADLINE_ASK);
});

test('the adoption report names the adoption decision and its Decision Record hash', () => {
  const report = renderAdoptionReport(makeAdoptionInput());
  expect(report).toContain('- Decision: First policy adopted');
  expect(report).toContain(
    `- Decision Record sequence: 3\n- Decision Record hash: \`${DECISION_HASH}\``,
  );
  expect(report).toContain(
    `- Replay inputsHash: \`${REPLAY_INPUTS_HASH}\`\n- Replay resultHash: \`${REPLAY_RESULT_HASH}\``,
  );
});

test('an adoption report before the run completes has no numbers and no group tables', () => {
  const report = renderAdoptionReport(
    makeAdoptionInput({ stats: null, groups: [], decision: null }),
  );
  expect(report).toContain('No analysis figures yet because the replay has not completed.');
  expect(report).toContain('No Effect table yet because the replay has not completed.');
  expect(report).toContain("No 'ask' Adoption Group.");
  expect(report).toContain("No 'deny' Adoption Group.");
  expect(report).toContain('Not decided yet.');
});

test('the adoption report shows the audit chain tail sequence and hash', () => {
  const report = renderAdoptionReport(makeAdoptionInput());
  expect(report).toContain(
    `## Audit chain\n\n- Audit chain sequence when the report was generated: 9\n- Audit chain hash when the report was generated: \`${TAIL_HASH}\``,
  );
});

test.each([
  ['change', renderReport(makeInput({ traceSources: { transcript: 40, hook: 0, synthetic: 7 } }))],
  [
    'adoption',
    renderAdoptionReport(
      makeAdoptionInput({ traceSources: { transcript: 40, hook: 0, synthetic: 7 } }),
    ),
  ],
])('the %s report states the record provenance before its first section', (_kind, report) => {
  expect(report).toMatch(
    /`\n\nRecord sources: real transcript 40 \/ synthetic 7\n\n## Policy Versions/,
  );
});

test('the provenance line names hook imports only when some Action came from one', () => {
  const report = renderReport(
    makeInput({ traceSources: { transcript: 3, hook: 2, synthetic: 0 } }),
  );
  expect(report).toContain('Record sources: real transcript 3 / synthetic 0 / hook 2\n');
});

test('a change report folds a home directory in headlines and Target keys to ~', () => {
  const report = renderReport(
    makeInput({
      groups: [
        {
          direction: 'widening',
          headline: "Users/alice only: 4 read Actions change from 'ask' to 'allow'.",
          fromEffect: 'ask',
          toEffect: 'allow',
          actionCount: 4,
          targetSummary: [{ key: 'Users/alice', count: 4 }],
          verdict: 'expected',
        },
      ],
    }),
  );
  expect(report).toContain("#### ~ only: 4 read Actions change from 'ask' to 'allow'.");
  expect(report).toContain('  - ~ (4)');
  expect(report).not.toContain('alice');
});

test('an adoption report folds a home directory in its Target column to ~', () => {
  const report = renderAdoptionReport(
    makeAdoptionInput({
      groups: [
        {
          effect: 'ask',
          headline: ADOPTION_HEADLINE_ASK,
          actionCount: 3,
          sessionCount: 2,
          targetSummary: [
            { key: 'home/alice', count: 2 },
            { key: 'etc/hosts', count: 1 },
          ],
          verdict: null,
        },
      ],
    }),
  );
  expect(report).toContain('| ~ (2), etc/hosts (1) |');
});
