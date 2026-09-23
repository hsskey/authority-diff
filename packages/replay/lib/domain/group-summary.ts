import { assertNever } from '@authority/kernel';
import type { Effect } from '@authority/kernel';
import type { Capability, Target } from '@authority/action/schema';
import type { Zone } from '@authority/policy/schema';
import type { ActionForReplay } from '@authority/trace/schema';
import type { DeriveTargetKey } from '../../schema.ts';

/** Restrictiveness order used everywhere a "most restrictive" Effect is chosen. */
export const EFFECT_RANK: Record<Effect, number> = { allow: 0, ask: 1, deny: 2 };

/** The nine Effect transition cells, ordered allow, ask, deny for from then to. */
export const EFFECT_ORDER = ['allow', 'ask', 'deny'] as const;

/**
 * Derives the Target Summary key for a signature Operation's Target.
 *
 * See the DeriveTargetKey TSDoc in schema.ts for the frozen contract.
 */
export const deriveTargetKey: DeriveTargetKey = (target: Target): string => {
  switch (target.kind) {
    case 'path':
      if (target.isInsideWorkspace) {
        return 'workspace';
      }
      return target.path
        .split('/')
        .filter((segment) => segment.length > 0)
        .slice(0, 2)
        .join('/');
    case 'host':
      return target.host;
    case 'vcs_remote':
      return target.remoteKey ?? target.remoteName ?? 'unknown';
    case 'package':
      return target.source === null ? target.ecosystem : `${target.ecosystem}:${target.source}`;
    case 'mcp':
      return `mcp:${target.server}`;
    case 'deploy_target':
      return target.label ?? 'unknown';
    case 'unknown':
      return 'unknown';
    default:
      return assertNever(target);
  }
};

/** Plain Korean words for the fixed Headline templates. Never model output. */
export const CAPABILITY_WORD: Record<Capability, string> = {
  read: '읽기',
  write: '쓰기',
  delete: '삭제',
  execute: '실행',
  install: '설치',
  fetch: '가져오기',
  send: '전송',
  commit: 'commit',
  push: 'push',
  rewrite: '이력 재작성',
  deploy: '배포',
};

export const ZONE_WORD: Record<Zone, string> = {
  workspace: '작업 공간',
  host: '호스트',
  credentials: '자격 증명',
  agent_config: 'agent 설정',
  trusted_remote: '신뢰하는 원격',
  public_remote: '공개 원격',
  unknown_remote: '신뢰 목록에 없는 원격',
  protected: '보호 대상',
};

export const EFFECT_WORD: Record<Effect, string> = {
  allow: '허용',
  ask: '확인 필요',
  deny: '차단',
};

/** "으로" after a batchim-final syllable, "로" otherwise (e.g. 허용으로, 차단으로, 필요로). */
export function directionalParticle(word: string): '으로' | '로' {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  const hasBatchim = code >= 0 && code <= 11171 && code % 28 !== 0;
  return hasBatchim ? '으로' : '로';
}

export function sortedUniqueRuleIds(ids: readonly (string | null)[]): string[] {
  const present = ids.filter((id): id is string => id !== null);
  return [...new Set(present)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

function compareKeys(left: string | null, right: string | null): number {
  if (left === right) {
    return 0;
  }
  if (left === null) {
    return -1;
  }
  if (right === null) {
    return 1;
  }
  return left < right ? -1 : 1;
}

/**
 * Counts each key and keeps the `limit` most frequent, sorted by descending
 * count then ascending key in UTF-16 code-unit order; a null key sorts first.
 */
export function topCounts<K extends string | null>(
  keys: readonly K[],
  limit: number,
): { key: K; count: number }[] {
  const counts = new Map<K, number>();
  for (const key of keys) {
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => (b.count !== a.count ? b.count - a.count : compareKeys(a.key, b.key)))
    .slice(0, limit);
}

/** The Target Summary of the signature Operations: the top five Target keys. */
export function targetSummary(targets: readonly Target[]): { key: string; count: number }[] {
  return topCounts(targets.map(deriveTargetKey), 5);
}

/** The first five and last five Actions by (occurredAt, actionKey), or all when at most ten. */
export function sampleActionKeys(actions: readonly ActionForReplay[]): string[] {
  const keys = [...actions]
    .sort((left, right) => {
      if (left.occurredAt !== right.occurredAt) {
        return left.occurredAt < right.occurredAt ? -1 : 1;
      }
      return left.actionKey < right.actionKey ? -1 : left.actionKey > right.actionKey ? 1 : 0;
    })
    .map((action) => action.actionKey);
  if (keys.length <= 10) {
    return keys;
  }
  return [...keys.slice(0, 5), ...keys.slice(-5)];
}
