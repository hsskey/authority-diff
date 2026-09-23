import { ErrorEnvelopeSchema, type ErrorEnvelope } from '@authority/contracts/schema';
import type { RouteDef } from '@authority/contracts/routes';
import { err, ok } from '@authority/kernel';
import type { Result } from '@authority/kernel';
import { readAuthToken } from './auth.ts';

export type ApiClientError =
  | { kind: 'http'; status: number; envelope: ErrorEnvelope }
  | { kind: 'network'; message: string }
  | { kind: 'validation'; message: string };

/** A human-readable line for any API failure, for inline error surfaces. */
export function describeApiError(error: ApiClientError): string {
  if (error.kind === 'network' || error.kind === 'validation') {
    return error.message;
  }
  return `${error.status}: ${error.envelope.error.message}`;
}

interface CallOptions<Req> {
  readonly params?: Readonly<Record<string, string>>;
  readonly query?: Readonly<Record<string, string | number | undefined>>;
  readonly body?: Req;
  readonly headers?: Readonly<Record<string, string>>;
}

function buildPath(template: string, params: Readonly<Record<string, string>>): string {
  return template.replace(/:([A-Za-z]+)/g, (_match, name: string) => {
    const value = params[name];
    if (value === undefined) {
      throw new Error(`missing path parameter "${name}" for ${template}`);
    }
    return encodeURIComponent(value);
  });
}

function withQuery(path: string, query: CallOptions<unknown>['query']): string {
  if (!query) {
    return path;
  }
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      search.set(key, String(value));
    }
  }
  const suffix = search.toString();
  return suffix ? `${path}?${suffix}` : path;
}

/**
 * Issues one request described by a `routes` entry and validates the response
 * against that route's response schema. The route table is the only source of
 * paths, methods, and DTO shapes.
 */
export async function callRoute<Res, Req>(
  route: RouteDef<Res, Req>,
  options: CallOptions<Req> = {},
): Promise<Result<Res, ApiClientError>> {
  const url = withQuery(buildPath(route.path, options.params ?? {}), options.query);

  const headers = new Headers({ Accept: 'application/json' });
  const token = readAuthToken();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  for (const [key, value] of Object.entries(options.headers ?? {})) {
    headers.set(key, value);
  }

  const init: RequestInit = { method: route.method, headers };
  if (options.body !== undefined) {
    headers.set('Content-Type', 'application/json');
    init.body = JSON.stringify(options.body);
  }

  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'network request failed';
    return err({ kind: 'network', message });
  }

  const isJson = response.headers.get('Content-Type')?.includes('application/json') ?? false;
  const body: unknown = isJson ? await response.json().catch(() => null) : await response.text();

  if (!response.ok) {
    const envelope = ErrorEnvelopeSchema.safeParse(body);
    if (!envelope.success) {
      return err({
        kind: 'validation',
        message: 'error response did not match the error envelope contract',
      });
    }
    return err({ kind: 'http', status: response.status, envelope: envelope.data });
  }

  const parsed = route.response.safeParse(body);
  if (!parsed.success) {
    return err({ kind: 'validation', message: 'response did not match the expected contract' });
  }
  return ok(parsed.data);
}
