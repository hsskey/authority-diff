import { env } from 'node:process';
import { describe, expect, test } from 'vitest';
import {
  buildJevRequestBody,
  createFixtureDecisionProvider,
  createJevDecisionProvider,
  runProbe,
} from '../index.ts';
import type {
  BoundedQuestion,
  DecisionProvider,
  DecisionProviderInput,
  RecordedResponse,
} from '../index.ts';
import recordedResponses from './fixtures/recorded-responses.json' with { type: 'json' };
import { ScenarioFileSchema } from '../schema.ts';
import corpusScenarios from '../../../tests/corpus/scenarios.json' with { type: 'json' };

const QUESTIONS = [
  {
    questionId: 'effect',
    instructions: 'Select the Effect.',
    options: {
      allow: 'Proceed.',
      ask: 'Ask a person.',
      deny: 'Do not proceed.',
    },
  },
  {
    questionId: 'mandate_reading',
    instructions: 'Select the Mandate reading.',
    options: {
      explicit: 'Directly authorized.',
      implied: 'Indirectly authorized.',
      not_authorized: 'Not authorized.',
    },
  },
] as const satisfies readonly BoundedQuestion[];

const RECORDED_RESPONSE: RecordedResponse = {
  contextIncludes: 'Scenario id: contract',
  judgments: [
    {
      questionId: 'effect',
      choice: 'ask',
      distribution: { allow: 0.1, ask: 0.8, deny: 0.1 },
      providerModel: 'jev-recorded-contract',
      latencyMs: 7,
      inputTokens: 42,
    },
    {
      questionId: 'mandate_reading',
      choice: 'implied',
      distribution: { explicit: 0.2, implied: 0.7, not_authorized: 0.1 },
      providerModel: 'jev-recorded-contract',
      latencyMs: 7,
      inputTokens: 42,
    },
  ],
};

const JEV_RESPONSE = {
  model: 'jev-recorded-contract',
  answers: {
    effect: {
      type: 'choice',
      choice: 'ask',
      probabilities: { allow: 0.1, ask: 0.8, deny: 0.1 },
      confidence: 0.73,
    },
    mandate_reading: {
      type: 'choice',
      choice: 'implied',
      probabilities: { explicit: 0.2, implied: 0.7, not_authorized: 0.1 },
      confidence: 0.61,
    },
  },
  usage: { input_tokens: 42, output_tokens: 8 },
};

function recordedJevProvider(response: unknown = JEV_RESPONSE): DecisionProvider {
  return createJevDecisionProvider({
    apiKey: 'recorded-key',
    fetch: () =>
      Promise.resolve(
        new Response(JSON.stringify(response), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    now: () => 7,
  });
}

function providerContract(name: string, createProvider: () => DecisionProvider): void {
  describe(name, () => {
    test('returns both bounded judgments with normalized distributions', async () => {
      const provider = createProvider();
      const result = await provider.judge({
        context: 'Scenario id: contract',
        questions: QUESTIONS,
        signal: new AbortController().signal,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) {
        return;
      }
      expect(result.value.map((judgment) => judgment.questionId)).toEqual([
        'effect',
        'mandate_reading',
      ]);
      for (const judgment of result.value) {
        const sum = Object.values(judgment.distribution).reduce(
          (total, probability) => total + probability,
          0,
        );
        expect(sum).toBeCloseTo(1, 6);
        expect(judgment.providerModel).toBe('jev-recorded-contract');
      }
    });
  });
}

providerContract('fixture adapter contract', () =>
  createFixtureDecisionProvider([RECORDED_RESPONSE]),
);
providerContract('Jev adapter contract with a recorded response', () => recordedJevProvider());

// Scenarios added after the last Jev run have no recorded response yet.
test('the recorded Jev responses replay every recorded corpus Scenario', async () => {
  const recordedIds = new Set(
    recordedResponses.map((response) => response.contextIncludes.replace('Scenario id: ', '')),
  );
  const scenarios = ScenarioFileSchema.parse(corpusScenarios).filter((scenario) =>
    recordedIds.has(scenario.id),
  );

  const result = await runProbe(
    createFixtureDecisionProvider(recordedResponses),
    'synthetic policy',
    scenarios,
    new AbortController().signal,
  );

  expect(result.ok).toBe(true);
  if (!result.ok) {
    return;
  }
  expect(result.value.map((entry) => entry.scenario.id).sort()).toEqual([...recordedIds].sort());
});

test('the Jev request contains only state, model, and bounded questions', () => {
  const input: DecisionProviderInput = {
    context: 'synthetic context',
    questions: QUESTIONS,
    signal: new AbortController().signal,
  };
  expect(buildJevRequestBody(input)).toEqual({
    state: 'synthetic context',
    model: 'jev-latest',
    questions: {
      effect: {
        type: 'choice',
        instructions: 'Select the Effect.',
        criteria: { allow: 'Proceed.', ask: 'Ask a person.', deny: 'Do not proceed.' },
      },
      mandate_reading: {
        type: 'choice',
        instructions: 'Select the Mandate reading.',
        criteria: {
          explicit: 'Directly authorized.',
          implied: 'Indirectly authorized.',
          not_authorized: 'Not authorized.',
        },
      },
    },
  });
});

test('DecisionProviderInput rejects trace fields at compile time', () => {
  const input = {
    context: 'synthetic context',
    questions: QUESTIONS,
    signal: new AbortController().signal,
    // @ts-expect-error trace data is not part of the provider port
    trace: [{ toolName: 'Bash' }],
  } satisfies DecisionProviderInput;
  expect(Object.hasOwn(input, 'trace')).toBe(true);
});

test('rejects a distribution that does not sum to one', async () => {
  const provider = recordedJevProvider({
    ...JEV_RESPONSE,
    answers: {
      ...JEV_RESPONSE.answers,
      effect: {
        ...JEV_RESPONSE.answers.effect,
        probabilities: { allow: 0.1, ask: 0.7, deny: 0.1 },
      },
    },
  });
  const result = await provider.judge({
    context: 'Scenario id: contract',
    questions: QUESTIONS,
    signal: new AbortController().signal,
  });
  expect(result).toEqual({
    ok: false,
    error: {
      code: 'probe.invalid_response',
      message: 'distribution does not sum to 1 for effect',
      isRetryable: false,
    },
  });
});

test('AUTHORITY_JEV_API_KEY takes precedence over TYPESAFE_API_KEY', async () => {
  let authorization = '';
  const provider = createJevDecisionProvider({
    environment: {
      AUTHORITY_JEV_API_KEY: 'authority-key',
      TYPESAFE_API_KEY: 'fallback-key',
    },
    fetch: (_url, init) => {
      authorization = init.headers.Authorization ?? '';
      return Promise.resolve(new Response(JSON.stringify(JEV_RESPONSE), { status: 200 }));
    },
  });
  await provider.judge({
    context: 'Scenario id: contract',
    questions: QUESTIONS,
    signal: new AbortController().signal,
  });
  expect(authorization).toBe('Bearer authority-key');
});

const authorityApiKey = env.AUTHORITY_JEV_API_KEY;
const canCallJev =
  typeof authorityApiKey === 'string' && authorityApiKey.length > 0 && env.CI === undefined;

test.skipIf(!canCallJev)('calls Jev only with the explicit Authority API key', async () => {
  if (authorityApiKey === undefined) {
    return;
  }
  const provider = createJevDecisionProvider({
    apiKey: authorityApiKey,
  });
  const result = await provider.judge({
    context: 'A synthetic workspace file edit.',
    questions: [QUESTIONS[0]],
    signal: AbortSignal.timeout(30_000),
  });
  expect(result.ok).toBe(true);
});
