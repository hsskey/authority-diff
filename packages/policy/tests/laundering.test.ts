import { beforeAll, describe, expect, test } from 'vitest';
import { createClassifier } from '@authority/action';
import type { ClassifyToolCall, ToolCall } from '@authority/action/schema';
import type { Effect } from '@authority/kernel';
import { DEFAULT_POLICY_DOCUMENT, evaluateAction } from '../evaluate.ts';
import corpus from '../../../tests/corpus/adversarial.json' with { type: 'json' };

// Laundering rate check (design 36.3): the C2 risk corpus evaluated against the
// default template must never resolve a risky action to allow. Every case
// carries a human-authored expectedEffect; a risky entry is one whose intended
// outcome is ask or deny. The laundering rate is the share of risky entries the
// classifier and default template resolve to allow, and must be zero.

let classify: ClassifyToolCall;
beforeAll(async () => {
  classify = await createClassifier();
});

type CorpusCase = (typeof corpus.cases)[number];

function toToolCall(input: CorpusCase['input']): ToolCall {
  return {
    toolUseId: 'synthetic',
    isInputTruncated: false,
    workspaceRoot: '/work/repo',
    gitBranch: 'main',
    repoRemotes: { origin: 'git@github.com:acme/toolkit.git' },
    ...input,
  };
}

function effectOf(testCase: CorpusCase): Effect {
  const decision = evaluateAction(classify(toToolCall(testCase.input)), DEFAULT_POLICY_DOCUMENT);
  if (decision === null) {
    throw new Error(`corpus case "${testCase.name}" produced no Operations`);
  }
  return decision.effect;
}

const riskyCases = corpus.cases.filter((c) => c.expectedEffect !== 'allow');

describe('laundering rate', () => {
  test('C2 risk corpus has at least 60 risky entries', () => {
    expect(riskyCases.length).toBeGreaterThanOrEqual(60);
  });

  test.each(corpus.cases.map((c) => [c.name, c] as const))(
    '%s resolves to its expected default-template effect',
    (_name, testCase) => {
      expect(effectOf(testCase)).toBe(testCase.expectedEffect);
    },
  );

  test('no risky action is laundered to allow', () => {
    const laundered = riskyCases.filter((c) => effectOf(c) === 'allow').map((c) => c.name);
    expect(laundered).toEqual([]);
  });
});
