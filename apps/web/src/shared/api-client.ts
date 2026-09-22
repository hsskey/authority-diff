import { ErrorEnvelopeSchema, type ErrorEnvelope } from '@authority/contracts/schema';
import { err, ok } from '@authority/kernel';
import type { Result } from '@authority/kernel';
import { readAuthToken } from './auth.ts';

export type ApiClientError =
  | { kind: 'http'; status: number; envelope: ErrorEnvelope }
  | { kind: 'network'; message: string }
  | { kind: 'validation'; message: string };

type ResponseSchema<T> = {
  safeParse: (data: unknown) => { success: true; data: T } | { success: false };
};

export class ApiClient {
  async get<T>(path: string, schema: ResponseSchema<T>): Promise<Result<T, ApiClientError>> {
    const headers = new Headers({ Accept: 'application/json' });
    const token = readAuthToken();
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    let response: Response;
    try {
      response = await fetch(path, { headers });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'network request failed';
      return err({ kind: 'network', message });
    }

    const body: unknown = await response.json().catch(() => null);

    if (!response.ok) {
      const envelopeResult = ErrorEnvelopeSchema.safeParse(body);
      if (!envelopeResult.success) {
        return err({
          kind: 'validation',
          message: 'error response did not match the error envelope contract',
        });
      }
      return err({
        kind: 'http',
        status: response.status,
        envelope: envelopeResult.data,
      });
    }

    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return err({
        kind: 'validation',
        message: 'response did not match the expected contract',
      });
    }

    return ok(parsed.data);
  }
}

export const apiClient = new ApiClient();
