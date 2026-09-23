import { expect, test } from 'vitest';
import { IsoTimestampSchema } from '@authority/kernel';
import { renderReport } from '../index.ts';
import type { ReportInput } from '../index.ts';

const BASELINE_HASH = 'a'.repeat(64);
const CANDIDATE_HASH = 'b'.repeat(64);
const DECISION_HASH = 'c'.repeat(64);

function makeInput(overrides: Partial<ReportInput> = {}): ReportInput {
  return {
    changeReviewId: 'rev_0123456789abcdefghjkmnpqrs',
    status: 'accepted',
    baselineContentHash: BASELINE_HASH,
    candidateContentHash: CANDIDATE_HASH,
    windowFrom: IsoTimestampSchema.parse('2026-01-01T00:00:00.000Z'),
    windowTo: IsoTimestampSchema.parse('2026-02-01T00:00:00.000Z'),
    evaluatedActions: 47,
    changedActions: 15,
    analyzabilityNoneCount: 2,
    transitions: [{ from: 'ask', to: 'allow', count: 15 }],
    operationWidening: [],
    groups: [
      {
        direction: 'widening',
        headline: "저장소 2곳으로의 push 15건이 '확인 필요'에서 '허용'으로 바뀝니다.",
        fromEffect: 'ask',
        toEffect: 'allow',
        actionCount: 15,
        targetSummary: [{ key: 'github.com/acme-oss/toolkit', count: 9 }],
        verdict: 'expected',
      },
    ],
    decision: {
      decision: 'accept',
      reviewerName: 'reviewer',
      decidedAt: IsoTimestampSchema.parse('2026-02-02T00:00:00.000Z'),
      note: '검토 완료',
      sequence: 7,
      hash: DECISION_HASH,
    },
    ...overrides,
  };
}

test('the report carries the two fixed notice sentences verbatim', () => {
  const report = renderReport(makeInput());
  expect(report).toContain(
    '이 기록은 정책 변경을 위 과거 기록에 비추어 검토했다는 사실을 남깁니다.',
  );
  expect(report).toContain(
    'Authority Diff는 정책을 배포하거나 강제하지 않았고, runtime이 이 정책대로 동작하는지는 측정하지 않았습니다.',
  );
});

test('the report lists both content hashes, the window, and each headline', () => {
  const report = renderReport(makeInput());
  expect(report).toContain(BASELINE_HASH);
  expect(report).toContain(CANDIDATE_HASH);
  expect(report).toContain('2026-01-01T00:00:00.000Z ~ 2026-02-01T00:00:00.000Z');
  expect(report).toContain("저장소 2곳으로의 push 15건이 '확인 필요'에서 '허용'으로 바뀝니다.");
});

test('the report names the reviewer and decision when decided', () => {
  const report = renderReport(makeInput());
  expect(report).toContain('reviewer');
  expect(report).toContain('정책 변경 수락');
});

test('the report records the Decision Record sequence and hash when decided', () => {
  const report = renderReport(makeInput());
  expect(report).toContain(
    `- Decision Record sequence: 7\n- Decision Record hash: \`${DECISION_HASH}\``,
  );
});

test('an undecided review still renders without a reviewer line', () => {
  const report = renderReport(makeInput({ decision: null }));
  expect(report).toContain('아직 결정되지 않았습니다.');
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
  expect(report).toContain('Action effect unchanged, operation-level widening');
  expect(report).toContain('| push | unknown_remote | trusted_remote | 2 |');
  expect(report).toContain('| push | public_remote | trusted_remote | 1 |');
});
