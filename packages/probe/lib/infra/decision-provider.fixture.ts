import { err, ok } from '@authority/kernel';
import type { Result } from '@authority/kernel';
import type {
  BoundedJudgment,
  DecisionProvider,
  DecisionProviderInput,
  ProbeError,
} from '../app/decision-provider.port.ts';
import { validateJudgment } from '../app/judgment.ts';

export interface RecordedResponse {
  readonly contextIncludes: string;
  readonly judgments: readonly BoundedJudgment[];
}

function fixtureError(code: ProbeError['code'], message: string): ProbeError {
  return { code, message, isRetryable: false };
}

function replayResponse(
  responses: readonly RecordedResponse[],
  input: DecisionProviderInput,
): Result<readonly BoundedJudgment[], ProbeError> {
  if (input.signal.aborted) {
    return err(fixtureError('probe.aborted', 'probe request was aborted'));
  }
  const response = responses.find((item) => input.context.includes(item.contextIncludes));
  if (response === undefined) {
    return err(fixtureError('probe.fixture_not_found', 'no recorded response matches the context'));
  }
  if (response.judgments.length !== input.questions.length) {
    return err(
      fixtureError('probe.invalid_response', 'recorded response has the wrong answer count'),
    );
  }

  for (const question of input.questions) {
    const judgment = response.judgments.find(
      (candidate) => candidate.questionId === question.questionId,
    );
    if (judgment === undefined) {
      return err(
        fixtureError(
          'probe.invalid_response',
          `recorded response is missing ${question.questionId}`,
        ),
      );
    }
    const issue = validateJudgment(question, judgment);
    if (issue !== null) {
      return err(issue);
    }
  }
  return ok(response.judgments);
}

export function createFixtureDecisionProvider(
  responses: readonly RecordedResponse[],
): DecisionProvider {
  return {
    providerId: 'fixture',
    judge: (input) => Promise.resolve(replayResponse(responses, input)),
  };
}
