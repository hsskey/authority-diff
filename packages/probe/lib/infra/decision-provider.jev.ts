import { env } from 'node:process';
import { z } from 'zod';
import { err, ok } from '@authority/kernel';
import type {
  BoundedJudgment,
  DecisionProvider,
  DecisionProviderInput,
  ProbeError,
} from '../app/decision-provider.port.ts';
import { validateJudgment } from '../app/judgment.ts';

const JEV_ENDPOINT = 'https://api.typesafe.ai/v1/systemone';

interface JevChoiceQuestion {
  readonly type: 'choice';
  readonly instructions: string;
  readonly criteria: Readonly<Record<string, string>>;
}

export interface JevRequestBody {
  readonly state: string;
  readonly model: 'jev-latest';
  readonly questions: Readonly<Record<string, JevChoiceQuestion>>;
}

interface JevEnvironment {
  readonly AUTHORITY_JEV_API_KEY?: string;
  readonly TYPESAFE_API_KEY?: string;
}

interface HttpResponse {
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
}

type ProbeFetch = (
  url: string,
  init: {
    readonly method: 'POST';
    readonly headers: Readonly<Record<string, string>>;
    readonly body: string;
    readonly signal: AbortSignal;
  },
) => Promise<HttpResponse>;

export interface JevDecisionProviderOptions {
  readonly apiKey?: string;
  readonly endpoint?: string;
  readonly environment?: JevEnvironment;
  readonly fetch?: ProbeFetch;
  readonly now?: () => number;
}

const JevChoiceAnswerSchema = z.object({
  type: z.literal('choice'),
  choice: z.string(),
  probabilities: z.record(z.string(), z.number()),
  confidence: z.number().optional(),
});

const JevResponseSchema = z.object({
  model: z.string().min(1),
  answers: z.record(z.string(), JevChoiceAnswerSchema),
  usage: z
    .object({
      input_tokens: z.number().int().nonnegative(),
      output_tokens: z.number().int().nonnegative(),
    })
    .optional(),
});

function probeError(code: ProbeError['code'], message: string, isRetryable: boolean): ProbeError {
  return { code, message, isRetryable };
}

function resolveApiKey(options: JevDecisionProviderOptions): string | null {
  const environment = options.environment ?? env;
  const candidates = [
    options.apiKey,
    environment.AUTHORITY_JEV_API_KEY,
    environment.TYPESAFE_API_KEY,
  ];
  return candidates.find((candidate) => candidate !== undefined && candidate.length > 0) ?? null;
}

export function buildJevRequestBody(input: DecisionProviderInput): JevRequestBody {
  const questions: Record<string, JevChoiceQuestion> = {};
  for (const question of input.questions) {
    questions[question.questionId] = {
      type: 'choice',
      instructions: question.instructions,
      criteria: question.options,
    };
  }
  return { state: input.context, model: 'jev-latest', questions };
}

export function createJevDecisionProvider(
  options: JevDecisionProviderOptions = {},
): DecisionProvider {
  const apiKey = resolveApiKey(options);
  const request = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  const endpoint = options.endpoint ?? JEV_ENDPOINT;

  return {
    providerId: 'jev',
    judge: async (input) => {
      if (input.signal.aborted) {
        return err(probeError('probe.aborted', 'probe request was aborted', false));
      }
      if (apiKey === null) {
        return err(
          probeError(
            'probe.missing_api_key',
            'AUTHORITY_JEV_API_KEY or TYPESAFE_API_KEY is required',
            false,
          ),
        );
      }
      if (
        new Set(input.questions.map((question) => question.questionId)).size !==
        input.questions.length
      ) {
        return err(probeError('probe.invalid_response', 'questionId values must be unique', false));
      }

      const startedAt = now();
      let response: HttpResponse;
      try {
        response = await request(endpoint, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(buildJevRequestBody(input)),
          signal: input.signal,
        });
      } catch (error: unknown) {
        if (input.signal.aborted) {
          return err(probeError('probe.aborted', 'probe request was aborted', false));
        }
        const message = error instanceof Error ? error.message : 'unknown network error';
        return err(probeError('probe.request_failed', message, true));
      }

      if (!response.ok) {
        const body = await response.text();
        return err(
          probeError(
            'probe.request_failed',
            `Jev returned HTTP ${response.status}: ${body}`,
            response.status === 429 || response.status === 529 || response.status >= 500,
          ),
        );
      }

      const parsed = JevResponseSchema.safeParse(await response.json());
      if (!parsed.success) {
        return err(
          probeError('probe.invalid_response', 'Jev returned an invalid response body', false),
        );
      }

      const latencyMs = Math.max(0, now() - startedAt);
      const judgments: BoundedJudgment[] = [];
      for (const question of input.questions) {
        const answer = parsed.data.answers[question.questionId];
        if (answer === undefined) {
          return err(
            probeError(
              'probe.invalid_response',
              `Jev response is missing ${question.questionId}`,
              false,
            ),
          );
        }
        const judgment: BoundedJudgment = {
          questionId: question.questionId,
          choice: answer.choice,
          distribution: answer.probabilities,
          providerModel: parsed.data.model,
          latencyMs,
          inputTokens: parsed.data.usage?.input_tokens ?? null,
        };
        const issue = validateJudgment(question, judgment);
        if (issue !== null) {
          return err(issue);
        }
        judgments.push(judgment);
      }
      return ok(judgments);
    },
  };
}
