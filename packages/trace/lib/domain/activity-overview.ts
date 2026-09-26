import { assertNever } from '@authority/kernel';
import { AnalyzabilitySchema, CapabilitySchema } from '@authority/action/schema';
import type { Analyzability, Operation, Target } from '@authority/action/schema';
import { ActivityOverviewSchema, TargetKindSchema } from '#schema';
import type { BuildActivityOverview, TargetKind } from '#schema';

const TOP_LIMIT = 20;

const ANALYZABILITY_RANK: Record<Analyzability, number> = { full: 0, partial: 1, none: 2 };

function targetKindOf(target: Target): TargetKind {
  switch (target.kind) {
    case 'path':
      return target.isInsideWorkspace ? 'workspace_path' : 'other_path';
    case 'vcs_remote':
    case 'host':
    case 'package':
    case 'mcp':
    case 'deploy_target':
    case 'unknown':
      return target.kind;
    default:
      return assertNever(target);
  }
}

/** An Action's analyzability is its Operations' worst. */
function actionAnalyzability(operations: readonly Operation[]): Analyzability {
  return operations.reduce<Analyzability>(
    (worst, operation) =>
      ANALYZABILITY_RANK[operation.analyzability] > ANALYZABILITY_RANK[worst]
        ? operation.analyzability
        : worst,
    'full',
  );
}

function count(counts: Map<string, number>, key: string): void {
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

/** Every key of the enum with its count, zero included. */
function countsByKey(counts: Map<string, number>, keys: readonly string[]): Record<string, number> {
  return Object.fromEntries(keys.map((key) => [key, counts.get(key) ?? 0]));
}

function top(counts: Map<string, number>): { key: string; count: number }[] {
  return [...counts.entries()]
    .map(([key, value]) => ({ key, count: value }))
    .sort((a, b) => b.count - a.count || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    .slice(0, TOP_LIMIT);
}

export const buildActivityOverview: BuildActivityOverview = (actions) => {
  const sessions = new Set<string>();
  const capabilities = new Map<string, number>();
  const targetKinds = new Map<string, number>();
  const analyzability = new Map<string, number>();
  const programs = new Map<string, number>();
  const remoteKeys = new Map<string, number>();
  let evaluableActionCount = 0;

  for (const action of actions) {
    sessions.add(action.sessionExternalId);
    if (action.operations.length === 0) {
      continue;
    }
    evaluableActionCount += 1;
    count(analyzability, actionAnalyzability(action.operations));
    for (const operation of action.operations) {
      count(capabilities, operation.capability);
      count(targetKinds, targetKindOf(operation.target));
      if (operation.program !== null) {
        count(programs, operation.program);
      }
      if (operation.target.kind === 'vcs_remote' && operation.target.remoteKey !== null) {
        count(remoteKeys, operation.target.remoteKey);
      }
    }
  }

  return ActivityOverviewSchema.parse({
    sessionCount: sessions.size,
    actionCount: actions.length,
    evaluableActionCount,
    capabilityCounts: countsByKey(capabilities, CapabilitySchema.options),
    targetKindCounts: countsByKey(targetKinds, TargetKindSchema.options),
    analyzability: countsByKey(analyzability, AnalyzabilitySchema.options),
    topPrograms: top(programs).map(({ key, count: value }) => ({ program: key, count: value })),
    topRemoteKeys: top(remoteKeys).map(({ key, count: value }) => ({
      remoteKey: key,
      count: value,
    })),
  });
};
