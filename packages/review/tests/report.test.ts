import { expect, test } from 'vitest';
import { IsoTimestampSchema } from '@authority/kernel';
import { renderAdoptionReport, renderReport } from '../index.ts';
import type { AdoptionReportInput, ReportInput } from '../index.ts';

const BASELINE_HASH = 'a'.repeat(64);
const CANDIDATE_HASH = 'b'.repeat(64);
const DECISION_HASH = 'c'.repeat(64);
const REPLAY_INPUTS_HASH = 'd'.repeat(64);
const REPLAY_RESULT_HASH = 'e'.repeat(64);

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
      replayInputsHash: REPLAY_INPUTS_HASH,
      replayResultHash: REPLAY_RESULT_HASH,
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

test('the Policy Version section lists the decision record replay hashes', () => {
  const report = renderReport(makeInput());
  expect(report).toContain(
    `- Replay inputsHash: \`${REPLAY_INPUTS_HASH}\`\n- Replay resultHash: \`${REPLAY_RESULT_HASH}\``,
  );
});

test('an undecided review still renders without a reviewer line', () => {
  const report = renderReport(makeInput({ decision: null }));
  expect(report).toContain('아직 결정되지 않았습니다.');
});

test("a group's Target key is deriveTargetKey's first-two-segment form, never a full absolute path", () => {
  const report = renderReport(
    makeInput({
      groups: [
        {
          direction: 'widening',
          headline: "etc/nginx 등 1곳으로의 read 4건이 '확인 필요'에서 '허용'으로 바뀝니다.",
          fromEffect: 'ask',
          toEffect: 'allow',
          actionCount: 4,
          targetSummary: [{ key: 'etc/nginx', count: 4 }],
          verdict: 'expected',
        },
      ],
    }),
  );
  expect(report).toContain('- etc/nginx (4건)');
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
  expect(report).toContain('Action effect unchanged, operation-level widening');
  expect(report).toContain('| push | unknown_remote | trusted_remote | 2 |');
  expect(report).toContain('| push | public_remote | trusted_remote | 1 |');
});

const ADOPTION_HEADLINE_ASK = "호스트에서의 실행 3건이 이 정책에서 '확인 필요' 대상이 됩니다.";
const ADOPTION_HEADLINE_DENY = "자격 증명에서의 읽기 1건이 이 정책에서 '차단' 대상이 됩니다.";

function makeAdoptionInput(overrides: Partial<AdoptionReportInput> = {}): AdoptionReportInput {
  return {
    changeReviewId: 'rev_0123456789abcdefghjkmnpqrs',
    status: 'accepted',
    candidateContentHash: CANDIDATE_HASH,
    windowFrom: IsoTimestampSchema.parse('2026-01-01T00:00:00.000Z'),
    windowTo: IsoTimestampSchema.parse('2026-02-01T00:00:00.000Z'),
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
    ...overrides,
  };
}

test('the adoption report carries the fixed notice and the adoption sentence verbatim', () => {
  const report = renderAdoptionReport(makeAdoptionInput());
  expect(report).toContain(
    'Authority Diff는 정책을 배포하거나 강제하지 않았고, runtime이 이 정책대로 동작하는지는 측정하지 않았습니다.',
  );
  expect(report).toContain(
    '이 수치는 과거 행동에 정책을 적용한 결과이며 과거 runtime의 승인 여부를 복원한 것이 아닙니다.',
  );
});

test('the adoption report lists the candidate hash, the window, and the analysis size', () => {
  const report = renderAdoptionReport(makeAdoptionInput());
  expect(report).toContain(`- 제안 Policy Version contentHash: \`${CANDIDATE_HASH}\``);
  expect(report).not.toContain('기준 Policy Version');
  expect(report).toContain('2026-01-01T00:00:00.000Z ~ 2026-02-01T00:00:00.000Z');
  expect(report).toContain('- 분석한 Action: 8건 (전체 10건, 제외 2건)');
  expect(report).toContain('- 그중 analyzability none: 2건 (25.0%)');
});

test('the adoption report tabulates allow, ask, and deny counts with their rate of evaluated Actions', () => {
  const report = renderAdoptionReport(makeAdoptionInput());
  expect(report).toContain(
    '| Effect | Action 수 | 비율 |\n| --- | --- | --- |\n| 허용 | 4 | 50.0% |\n| 확인 필요 | 3 | 37.5% |\n| 차단 | 1 | 12.5% |',
  );
});

test('the adoption report puts ask and deny groups in separate tables with each Verdict', () => {
  const report = renderAdoptionReport(makeAdoptionInput());
  const askSection = report.slice(
    report.indexOf('## 확인 필요 Adoption Group과 Verdict'),
    report.indexOf('## 차단 Adoption Group과 Verdict'),
  );
  const denySection = report.slice(
    report.indexOf('## 차단 Adoption Group과 Verdict'),
    report.indexOf('## 결정'),
  );
  expect(askSection).toContain(`| ${ADOPTION_HEADLINE_ASK} | 3 | 2 | unknown (3건) | 미판정 |`);
  expect(askSection).not.toContain(ADOPTION_HEADLINE_DENY);
  expect(denySection).toContain(
    `| ${ADOPTION_HEADLINE_DENY} | 1 | 1 | ~/.synthetic-credentials (1건) | 예상함 |`,
  );
  expect(denySection).not.toContain(ADOPTION_HEADLINE_ASK);
});

test('the adoption report names the adoption decision and its Decision Record hash', () => {
  const report = renderAdoptionReport(makeAdoptionInput());
  expect(report).toContain('- 결정: 최초 정책 채택');
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
  expect(report).toContain('아직 replay가 완료되지 않아 분석 수치가 없습니다.');
  expect(report).toContain('아직 replay가 완료되지 않아 Effect 표가 없습니다.');
  expect(report).toContain("'확인 필요' 대상 Adoption Group이 없습니다.");
  expect(report).toContain("'차단' 대상 Adoption Group이 없습니다.");
  expect(report).toContain('아직 결정되지 않았습니다.');
});
