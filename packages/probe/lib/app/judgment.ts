import type { BoundedJudgment, BoundedQuestion, ProbeError } from './decision-provider.port.ts';

const DISTRIBUTION_TOLERANCE = 1e-6;
// Jev rounds each probability to two decimals, so three options can sum to 1 +/- 0.015.
const ROUNDING_TOLERANCE = 0.015;

function distributionSum(distribution: Readonly<Record<string, number>>): number {
  return Object.values(distribution).reduce((total, probability) => total + probability, 0);
}

// Adapters call this before validateJudgment so the port always returns a distribution
// summing to 1; a sum outside the rounding tolerance is left for validateJudgment to reject.
export function normalizeRoundedJudgment(judgment: BoundedJudgment): BoundedJudgment {
  const sum = distributionSum(judgment.distribution);
  const offset = Math.abs(sum - 1);
  if (offset <= DISTRIBUTION_TOLERANCE || !(offset <= ROUNDING_TOLERANCE)) {
    return judgment;
  }
  return {
    ...judgment,
    distribution: Object.fromEntries(
      Object.entries(judgment.distribution).map(([key, probability]) => [key, probability / sum]),
    ),
  };
}

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
  if (Math.abs(distributionSum(judgment.distribution) - 1) > DISTRIBUTION_TOLERANCE) {
    return invalidResponse(`distribution does not sum to 1 for ${question.questionId}`);
  }
  return null;
}
