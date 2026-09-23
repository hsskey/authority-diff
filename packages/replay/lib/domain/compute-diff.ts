import { assertNever, invariant } from '@authority/kernel';
import type { Effect } from '@authority/kernel';
import { canonicalJson, sha256Hex } from '@authority/kernel/hash';
import type { Capability, Operation, Target } from '@authority/action/schema';
import type { Decision, OperationDecision, Zone } from '@authority/policy/schema';
import type { ActionForReplay } from '@authority/trace/schema';
import type { DeriveTargetKey, DiffGroup, DiffResult, ReplayStats } from '../../schema.ts';

/** Evaluates one Action's Operations against a compiled Policy Document. */
type EvaluateAction = (operations: readonly Operation[]) => Decision | null;

/** Restrictiveness order used everywhere a "most restrictive" Effect is chosen. */
const EFFECT_RANK: Record<Effect, number> = { allow: 0, ask: 1, deny: 2 };

/** The nine Effect transition cells, ordered allow, ask, deny for from then to. */
export const EFFECT_ORDER = ['allow', 'ask', 'deny'] as const;

/** Baseline Zones that make a widening group critical. */
const CRITICAL_BASELINE_ZONES: ReadonlySet<Zone> = new Set([
  'credentials',
  'agent_config',
  'protected',
  'public_remote',
  'unknown_remote',
]);

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

/** Plain Korean words for the fixed Headline template. Never model output. */
const CAPABILITY_WORD: Record<Capability, string> = {
  read: '읽기',
  write: '쓰기',
  delete: '삭제',
  execute: '실행',
  install: '설치',
  fetch: '가져오기',
  send: '전송',
  commit: 'commit',
  push: '저장소로의 push',
  rewrite: '이력 재작성',
  deploy: '배포',
};

const ZONE_WORD: Record<Zone, string> = {
  workspace: '작업 공간',
  host: '호스트',
  credentials: '자격 증명',
  agent_config: 'agent 설정',
  trusted_remote: '신뢰하는 원격',
  public_remote: '공개 원격',
  unknown_remote: '신뢰 목록에 없는 원격',
  protected: '보호 대상',
};

const EFFECT_WORD: Record<Effect, string> = {
  allow: '허용',
  ask: '확인 필요',
  deny: '차단',
};

/** The Headline is rendered from a group but is excluded from resultHash. */
type HeadlineInput = Omit<DiffGroup, 'headline'>;

/**
 * Renders the fixed plain-Korean Headline for a Diff Group.
 *
 * The template carries no command text, ruleId, or regular expression. The
 * target count is the number of summarized Target keys, the only distinct-target
 * count the frozen schema exposes. A Zone change adds one sentence.
 */
export function renderHeadline(group: HeadlineInput): string {
  const top = group.targetSummary[0];
  invariant(top !== undefined, 'a Diff Group always has at least one Target Summary entry');
  const sentence =
    `${top.key} 등 ${group.targetSummary.length}곳으로의 ` +
    `${CAPABILITY_WORD[group.capability]} ${group.actionCount}건이 ` +
    `'${EFFECT_WORD[group.fromEffect]}'에서 '${EFFECT_WORD[group.toEffect]}'로 바뀝니다.`;
  if (group.fromZone === group.toZone) {
    return sentence;
  }
  return (
    `${sentence} 기준 정책에서는 ${ZONE_WORD[group.fromZone]}이었고 ` +
    `변경안에서는 ${ZONE_WORD[group.toZone]}으로 분류됩니다.`
  );
}

/** One evaluated Action whose baseline and candidate Effects differ. */
interface ChangedEntry {
  readonly action: ActionForReplay;
  readonly direction: 'widening' | 'narrowing';
  readonly signatureOperation: Operation;
  readonly baselineOp: OperationDecision;
  readonly candidateOp: OperationDecision;
}

/** The frozen group signature; groupKey is its canonical hash. */
interface Signature {
  readonly fromEffect: Effect;
  readonly toEffect: Effect;
  readonly capability: Capability;
  readonly fromZone: Zone;
  readonly toZone: Zone;
  readonly program: string | null;
}

function selectSignatureOperation(
  action: ActionForReplay,
  baseline: Decision,
  candidate: Decision,
  direction: 'widening' | 'narrowing',
): ChangedEntry {
  const baselineByIndex = new Map(baseline.operations.map((op) => [op.operationIndex, op]));
  const candidateByIndex = new Map(candidate.operations.map((op) => [op.operationIndex, op]));

  let best: ChangedEntry | undefined;
  let bestRank = -1;
  const ordered = [...action.operations].sort((a, b) => a.index - b.index);
  for (const operation of ordered) {
    const baselineOp = baselineByIndex.get(operation.index);
    const candidateOp = candidateByIndex.get(operation.index);
    invariant(
      baselineOp !== undefined && candidateOp !== undefined,
      'every Operation index has a baseline and candidate Operation Decision',
    );
    if (baselineOp.effect === candidateOp.effect) {
      continue;
    }
    const rank =
      direction === 'widening' ? EFFECT_RANK[baselineOp.effect] : EFFECT_RANK[candidateOp.effect];
    if (rank > bestRank) {
      bestRank = rank;
      best = { action, direction, signatureOperation: operation, baselineOp, candidateOp };
    }
  }
  invariant(best !== undefined, 'a changed Action has at least one differing Operation');
  return best;
}

function signatureOf(entry: ChangedEntry): Signature {
  return {
    fromEffect: entry.baselineOp.effect,
    toEffect: entry.candidateOp.effect,
    capability: entry.signatureOperation.capability,
    fromZone: entry.baselineOp.zone,
    toZone: entry.candidateOp.zone,
    program: entry.signatureOperation.program,
  };
}

function groupKeyOf(signature: Signature): string {
  return sha256Hex(
    canonicalJson([
      signature.fromEffect,
      signature.toEffect,
      signature.capability,
      signature.fromZone,
      signature.toZone,
      signature.program,
    ]),
  );
}

function sortedUniqueRuleIds(ids: readonly (string | null)[]): string[] {
  const present = ids.filter((id): id is string => id !== null);
  return [...new Set(present)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

function targetSummary(entries: readonly ChangedEntry[]): { key: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    const key = deriveTargetKey(entry.signatureOperation.target);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => (b.count - a.count !== 0 ? b.count - a.count : a.key < b.key ? -1 : 1))
    .slice(0, 5);
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

/** A built group: the full Diff Group and its headline-free hashed projection. */
interface BuiltGroup {
  readonly full: DiffGroup;
  readonly hashed: HeadlineInput;
}

function buildGroup(groupKey: string, entries: readonly ChangedEntry[]): BuiltGroup {
  const first = entries[0];
  invariant(first !== undefined, 'a Diff Group has at least one changed Action');
  const signature = signatureOf(first);

  const occurredAts = entries.map((entry) => entry.action.occurredAt);
  const analyzabilityNoneCount = entries.filter(
    (entry) => entry.signatureOperation.analyzability === 'none',
  ).length;
  const anyIrreversible = entries.some(
    (entry) => entry.baselineOp.reversibility === 'irreversible',
  );
  const critical =
    first.direction === 'widening' &&
    (CRITICAL_BASELINE_ZONES.has(signature.fromZone) ||
      anyIrreversible ||
      analyzabilityNoneCount > 0);

  const summary = targetSummary(entries);
  const core: HeadlineInput = {
    groupKey,
    direction: first.direction,
    fromEffect: signature.fromEffect,
    toEffect: signature.toEffect,
    capability: signature.capability,
    fromZone: signature.fromZone,
    toZone: signature.toZone,
    program: signature.program,
    severity: critical ? 'critical' : 'normal',
    actionCount: entries.length,
    sessionCount: new Set(entries.map((entry) => entry.action.sessionExternalId)).size,
    analyzabilityNoneCount,
    firstOccurredAt: occurredAts.reduce((min, at) => (at < min ? at : min)),
    lastOccurredAt: occurredAts.reduce((max, at) => (at > max ? at : max)),
    baselineRuleIds: sortedUniqueRuleIds(entries.map((entry) => entry.baselineOp.decidingRuleId)),
    candidateRuleIds: sortedUniqueRuleIds(entries.map((entry) => entry.candidateOp.decidingRuleId)),
    targetSummary: summary,
    sampleActionKeys: sampleActionKeys(entries.map((entry) => entry.action)),
  };
  return { full: { ...core, headline: renderHeadline(core) }, hashed: core };
}

function directionOf(baseline: Effect, candidate: Effect): 'widening' | 'narrowing' {
  return EFFECT_RANK[candidate] < EFFECT_RANK[baseline] ? 'widening' : 'narrowing';
}

/**
 * The deterministic diff core. Receives injected evaluators so it can be
 * developed and tested independently of the Policy evaluation package.
 *
 * See the ComputeDiff TSDoc in schema.ts for the frozen output contract.
 */
export function computeDiffWith(
  evaluateBaseline: EvaluateAction,
  evaluateCandidate: EvaluateAction,
  actions: readonly ActionForReplay[],
): DiffResult {
  const seen = new Set<string>();
  for (const action of actions) {
    invariant(!seen.has(action.actionKey), `duplicate actionKey: ${action.actionKey}`);
    seen.add(action.actionKey);
  }

  const transitionCounts = new Map<string, number>();
  const changedEntries: ChangedEntry[] = [];
  let excludedActions = 0;

  for (const action of actions) {
    const baseline = evaluateBaseline(action.operations);
    const candidate = evaluateCandidate(action.operations);
    if (baseline === null || candidate === null) {
      excludedActions += 1;
      continue;
    }
    transitionCounts.set(
      `${baseline.effect}>${candidate.effect}`,
      (transitionCounts.get(`${baseline.effect}>${candidate.effect}`) ?? 0) + 1,
    );
    if (baseline.effect !== candidate.effect) {
      const direction = directionOf(baseline.effect, candidate.effect);
      changedEntries.push(selectSignatureOperation(action, baseline, candidate, direction));
    }
  }

  const transitions = EFFECT_ORDER.flatMap((from) =>
    EFFECT_ORDER.map((to) => ({
      from,
      to,
      count: transitionCounts.get(`${from}>${to}`) ?? 0,
    })),
  );

  const grouped = new Map<string, ChangedEntry[]>();
  for (const entry of changedEntries) {
    const groupKey = groupKeyOf(signatureOf(entry));
    const bucket = grouped.get(groupKey);
    if (bucket === undefined) {
      grouped.set(groupKey, [entry]);
    } else {
      bucket.push(entry);
    }
  }

  const built = [...grouped.entries()]
    .map(([groupKey, entries]) => buildGroup(groupKey, entries))
    .sort((a, b) =>
      a.full.groupKey < b.full.groupKey ? -1 : a.full.groupKey > b.full.groupKey ? 1 : 0,
    );
  const groups = built.map((group) => group.full);

  const changedActions = changedEntries
    .map((entry) => ({
      actionKey: entry.action.actionKey,
      groupKey: groupKeyOf(signatureOf(entry)),
      fromEffect: entry.baselineOp.effect,
      toEffect: entry.candidateOp.effect,
    }))
    .sort((a, b) => (a.actionKey < b.actionKey ? -1 : a.actionKey > b.actionKey ? 1 : 0));

  const stats: ReplayStats = {
    totalActions: actions.length,
    evaluatedActions: actions.length - excludedActions,
    excludedActions,
    changedActions: changedEntries.length,
    transitions,
  };

  const hashProjection = {
    stats,
    groups: built.map((group) => group.hashed),
    changedActions,
  };
  const resultHash = sha256Hex(canonicalJson(hashProjection));

  return { stats, groups, changedActions, resultHash };
}
