import type { BoundedJudgment, BoundedQuestion, ProbeError } from './decision-provider.port.ts';

const DISTRIBUTION_TOLERANCE = 1e-6;

function invalidResponse(message: string): ProbeError {
  return { code: 'probe.invalid_response', message, isRetryable: false };
}

export function validateJudgment(
  question: BoundedQuestion,
  judgment: BoundedJudgment,
): ProbeError | null {
  if (judgment.questionId !== question.questionId) {
    return invalidResponse(`answer questionId does not match ${question.questionId}`);
  }
  if (!(judgment.choice in question.options)) {
    return invalidResponse(`answer choice is not an option for ${question.questionId}`);
  }

  const optionKeys = Object.keys(question.options).sort();
  const distributionKeys = Object.keys(judgment.distribution).sort();
  if (
    optionKeys.length !== distributionKeys.length ||
    optionKeys.some((key, index) => key !== distributionKeys[index])
  ) {
    return invalidResponse(`distribution options do not match ${question.questionId}`);
  }

  const probabilities = Object.values(judgment.distribution);
  if (probabilities.some((probability) => !Number.isFinite(probability) || probability < 0)) {
    return invalidResponse(`distribution has an invalid probability for ${question.questionId}`);
  }
  const sum = probabilities.reduce((total, probability) => total + probability, 0);
  if (Math.abs(sum - 1) > DISTRIBUTION_TOLERANCE) {
    return invalidResponse(`distribution does not sum to 1 for ${question.questionId}`);
  }
  return null;
}
