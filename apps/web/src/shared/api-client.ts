import { ErrorEnvelopeSchema, type ErrorEnvelope } from '@authority/contracts/schema';
import type { RouteDef } from '@authority/contracts/routes';
import { err, ok } from '@authority/kernel';
import type { Result } from '@authority/kernel';
import { readAuthToken } from './auth.ts';

export type ApiClientError =
  | { kind: 'http'; status: number; envelope: ErrorEnvelope }
  | { kind: 'network'; message: string }
  | { kind: 'validation'; message: string };

/** Plain Korean for the failures a screen can act on; other codes keep the server message. */
const ERROR_MESSAGE: Readonly<Record<string, string>> = {
  'auth.token_missing': '로그인이 필요합니다. token을 입력하세요.',
  'auth.token_invalid': 'token이 올바르지 않습니다. 다시 로그인하세요.',
  'review.not_open': '결정이 끝난 검토라 더 이상 바꿀 수 없습니다.',
  'review.open_review_exists':
    '이 정책에 진행 중인 검토가 이미 있습니다. 먼저 그 검토를 결정하세요.',
  'review.gate_blocked': 'gate가 닫혀 있어 채택할 수 없습니다. blocker를 먼저 해결하세요.',
  'policy.draft_exists': '이 정책에 열린 draft가 이미 있습니다.',
  'policy.organization_policy_exists': '조직 정책이 이미 있습니다.',
  'policy.version_not_draft': 'draft가 아닌 version은 편집할 수 없습니다.',
  'policy.content_conflict': '다른 곳에서 먼저 저장된 문서입니다. 새로 고친 뒤 다시 저장하세요.',
  'policy.transition_not_allowed': '이 version 상태에서는 검토를 만들 수 없습니다.',
  'replay.classifier_version_mismatch':
    '기간 안에 다른 classifier version으로 분류된 Action이 있습니다. reclassify 후 다시 시도하세요.',
};

/** A human-readable line for any API failure, for inline error surfaces. */
export function describeApiError(error: ApiClientError): string {
  if (error.kind === 'network' || error.kind === 'validation') {
    return error.message;
  }
  const { code, message } = error.envelope.error;
  return ERROR_MESSAGE[code] ?? `${error.status}: ${message}`;
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
    const message = cause instanceof Error ? cause.message : '네트워크 요청이 실패했습니다';
    return err({ kind: 'network', message });
  }

  const isJson = response.headers.get('Content-Type')?.includes('application/json') ?? false;
  const body: unknown = isJson ? await response.json().catch(() => null) : await response.text();

  if (!response.ok) {
    const envelope = ErrorEnvelopeSchema.safeParse(body);
    if (!envelope.success) {
      return err({
        kind: 'validation',
        message: '오류 응답이 계약과 맞지 않습니다',
      });
    }
    return err({ kind: 'http', status: response.status, envelope: envelope.data });
  }

  const parsed = route.response.safeParse(body);
  if (!parsed.success) {
    return err({ kind: 'validation', message: '응답이 계약과 맞지 않습니다' });
  }
  return ok(parsed.data);
}
