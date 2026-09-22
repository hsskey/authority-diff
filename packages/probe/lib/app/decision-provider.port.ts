import type { Result } from '@authority/kernel';

export type ProviderId = 'jev' | 'llm_baseline' | 'fixture';

export interface BoundedQuestion {
  readonly questionId: string;
  readonly instructions: string;
  readonly options: Readonly<Record<string, string>>;
}

export interface BoundedJudgment {
  readonly questionId: string;
  readonly choice: string;
  readonly distribution: Readonly<Record<string, number>>;
  readonly providerModel: string;
  readonly latencyMs: number;
  readonly inputTokens: number | null;
}

export type ProbeErrorCode =
  | 'probe.aborted'
  | 'probe.fixture_not_found'
  | 'probe.invalid_response'
  | 'probe.missing_api_key'
  | 'probe.request_failed';

export interface ProbeError {
  readonly code: ProbeErrorCode;
  readonly message: string;
  readonly isRetryable: boolean;
}

export interface DecisionProviderInput {
  readonly context: string;
  readonly questions: readonly BoundedQuestion[];
  readonly signal: AbortSignal;
}

export interface DecisionProvider {
  readonly providerId: ProviderId;
  judge(input: DecisionProviderInput): Promise<Result<readonly BoundedJudgment[], ProbeError>>;
}
