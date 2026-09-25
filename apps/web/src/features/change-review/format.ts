import type {
  ChangeReviewResponse,
  ReviewAdoptionGroupResponse,
  ReviewDiffGroupResponse,
} from '@authority/contracts/schema';
import { foldHomePaths } from '@authority/kernel';
import type { Messages } from '../../shared/i18n/en.ts';

type Verdict = ReviewDiffGroupResponse['verdict'];
type NonNullVerdict = Exclude<Verdict, null>;
type ReviewKind = ChangeReviewResponse['kind'];
type Severity = ReviewDiffGroupResponse['severity'];

export const VERDICT_OPTIONS: readonly NonNullVerdict[] = ['expected', 'investigate', 'unexpected'];

/** A change review asks whether a Widening was expected; an adoption review whether a limit is intended. */
export function verdictLabel(t: Messages, kind: ReviewKind, verdict: Verdict): string {
  return verdict === null ? t.verdict.none : t.verdict[kind][verdict];
}

const SEVERITY_RANK: Record<Severity, number> = { critical: 0, normal: 1 };

export function bySeverityThenImpact(
  a: ReviewDiffGroupResponse,
  b: ReviewDiffGroupResponse,
): number {
  return (
    SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
    b.actionCount - a.actionCount ||
    a.groupKey.localeCompare(b.groupKey)
  );
}

export function formatZoneTransition(from: string, to: string): string {
  return from === to ? from : `${from} → ${to}`;
}

/** Names a Diff Group by its whole signature, so each group's controls read apart. */
export function diffGroupLabel(t: Messages, group: ReviewDiffGroupResponse): string {
  return [
    group.capability,
    formatZoneTransition(group.fromZone, group.toZone),
    formatZoneTransition(t.effect[group.fromEffect], t.effect[group.toEffect]),
    group.program ?? t.groupLabel.noProgram,
  ].join(' · ');
}

/** Names an Adoption Group by its whole signature: Capability, Zone, and Effect. */
export function adoptionGroupLabel(t: Messages, group: ReviewAdoptionGroupResponse): string {
  return [group.capability, group.zone, t.effect[group.effect]].join(' · ');
}

/** The Target Summary keeps the top five keys, so five entries mean at least five Targets. */
const TARGET_SUMMARY_LIMIT = 5;

/**
 * The Headline in the screen's language, composed from the group's structured
 * fields. The server's Headline stays in the Evidence Report only.
 */
export function diffGroupHeadline(t: Messages, group: ReviewDiffGroupResponse): string {
  const top = group.targetSummary[0];
  return t.headline.diff({
    target: top === undefined ? null : foldHomePaths(top.key),
    targetCount: group.targetSummary.length,
    targetCountIsFloor: group.targetSummary.length >= TARGET_SUMMARY_LIMIT,
    capability: t.headline.capability[group.capability],
    actionCount: group.actionCount,
    fromEffect: t.effect[group.fromEffect],
    toEffect: t.effect[group.toEffect],
    zoneChange:
      group.fromZone === group.toZone
        ? null
        : { from: t.headline.zone[group.fromZone], to: t.headline.zone[group.toZone] },
  });
}

export function adoptionGroupHeadline(t: Messages, group: ReviewAdoptionGroupResponse): string {
  return t.headline.adoption({
    zone: t.headline.zone[group.zone],
    capability: t.headline.capability[group.capability],
    actionCount: group.actionCount,
    effect: t.effect[group.effect],
  });
}

/** One decimal, and a nonzero share never reads as 0%. */
export function formatShare(count: number, total: number): string {
  if (total === 0 || count === 0) {
    return '0%';
  }
  const percent = (count / total) * 100;
  return percent < 0.05 ? '<0.1%' : `${percent.toFixed(1)}%`;
}
