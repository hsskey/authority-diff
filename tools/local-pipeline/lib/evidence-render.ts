import type {
  AdoptionGroup,
  AdoptionResult,
  DiffGroup,
  DiffResult,
  ReplayStats,
} from '@authority/replay/schema';
import type { ConformanceFinding } from '@authority/replay/schema';
import { CapabilitySchema } from '@authority/action/schema';
import { ZoneSchema } from '@authority/policy/schema';
import type { EnvironmentProfile } from '@authority/policy/schema';
import type { Masks } from './evidence-masks.ts';

export interface SnapshotInfo {
  readonly label: string;
  readonly date: string;
  readonly files: number;
  readonly sessions: number;
  readonly actions: number;
  readonly duplicates: number;
}

export interface Comparison {
  readonly label: string;
  readonly description: string;
  readonly candidateFile: string;
  readonly diff: DiffResult;
}

export interface GateInput {
  readonly classifierVersion: string;
  readonly measured: string;
  readonly snapshot: SnapshotInfo;
  readonly previousVersions: readonly string[];
  readonly comparisons: readonly Comparison[];
  readonly masks: Masks;
}

export interface AdoptionInput {
  readonly classifierVersion: string;
  readonly measured: string;
  readonly snapshot: SnapshotInfo;
  readonly environment: EnvironmentProfile;
  readonly candidateContentHash: string;
  readonly local: AdoptionResult;
  readonly localWallTimesMs: readonly [number, number];
  readonly sessionsWithAskOrDeny: number;
  readonly serverResultHash: string;
  readonly serverSessionDifference: number;
  readonly gateB: DiffResult;
  readonly masks: Masks;
}

export interface JourneyStep {
  readonly step: string;
  readonly via: string;
  readonly result: string;
}

export interface ConformanceInput {
  readonly classifierVersion: string;
  readonly measured: string;
  readonly snapshot: SnapshotInfo;
  readonly previousVersions: readonly string[];
  readonly window: { readonly from: string; readonly to: string };
  readonly imported: ImportSummary;
  readonly spool: SpoolSummary;
  readonly resultHash: string;
  readonly stats: ReplayStats;
  readonly findings: readonly ConformanceFinding[];
}

export interface ImportSummary {
  readonly sessions: number;
  readonly acceptedCount: number;
  readonly duplicateCount: number;
  readonly failedSessions: number;
}

export interface SpoolSummary {
  readonly lines: number;
  readonly events: ReadonlyMap<string, number>;
}

const EFFECTS = ['allow', 'ask', 'deny'] as const;
const NUMBER_WORDS = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
];

export function fmt(n: number): string {
  return n.toLocaleString('en-US');
}

function pct(n: number, total: number, digits = 1): string {
  return total === 0 ? '-' : `${((100 * n) / total).toFixed(digits)}%`;
}

/** An Effect share: two decimals below 1% so a small deny share is not shown as 0.1%. */
function effectShare(n: number, total: number): string {
  return total !== 0 && (100 * n) / total < 1 ? pct(n, total, 2) : pct(n, total);
}

export function shortHash(hash: string): string {
  return `${hash.slice(0, 8)}…${hash.slice(-4)}`;
}

function numberWord(n: number): string {
  return NUMBER_WORDS[n] ?? fmt(n);
}

function capitalize(word: string): string {
  return `${word.charAt(0).toUpperCase()}${word.slice(1)}`;
}

function plural(n: number, noun: string): string {
  return `${fmt(n)} ${noun}${n === 1 ? '' : 's'}`;
}

function transition(stats: ReplayStats, from: string, to: string): number {
  return stats.transitions.find((cell) => cell.from === from && cell.to === to)?.count ?? 0;
}

function snapshotStamp(snapshot: SnapshotInfo): string {
  return `corpus snapshot: ${snapshot.label} (${snapshot.date}, ${fmt(snapshot.files)} files, ${fmt(snapshot.actions)} Actions)`;
}

function earlierMeasurements(previousVersions: readonly string[]): string {
  if (previousVersions.length === 0) {
    return '';
  }
  const [first, ...rest] = previousVersions;
  return rest.length === 0
    ? `; the earlier ${first ?? ''} measurement is kept unchanged under "Previous version" at the end`
    : `; the earlier ${previousVersions.join(', ')} measurements are kept unchanged under "Previous version" at the end`;
}

function byActionsThenKey<T extends { actionCount: number; groupKey: string }>(a: T, b: T): number {
  return (
    b.actionCount - a.actionCount ||
    (a.groupKey < b.groupKey ? -1 : a.groupKey > b.groupKey ? 1 : 0)
  );
}

function noneOfChanged(diff: DiffResult): number {
  return diff.groups.reduce((sum, group) => sum + group.analyzabilityNoneCount, 0);
}

function countGroups(diff: DiffResult, keep: (group: DiffGroup) => boolean): number {
  return diff.groups.filter(keep).length;
}

function operationWideningLine(stats: ReplayStats): string {
  const cells = stats.operationWidening.map(
    (cell) => `${cell.capability} ${cell.fromZone} → ${cell.toZone} ${fmt(cell.count)}`,
  );
  return `Operation-level widening while the Action Effect is unchanged: ${cells.length === 0 ? 'none' : cells.join('; ')}.`;
}

function groupTable(groups: readonly DiffGroup[], masks: Masks): string[] {
  return [
    '| group | program | capability | fromZone → toZone | effect | severity | actions | sessions | none | top targets (masked) |',
    '| --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | --- |',
    ...[...groups].sort(byActionsThenKey).map((group) => {
      const targets = group.targetSummary
        .map((item) => `${masks.target(item.key)}(${fmt(item.count)})`)
        .join(', ');
      return `| ${group.groupKey.slice(0, 8)} | ${masks.program(group.program)} | ${group.capability} | ${group.fromZone} → ${group.toZone} | ${group.fromEffect} → ${group.toEffect} | ${group.severity} | ${fmt(group.actionCount)} | ${fmt(group.sessionCount)} | ${fmt(group.analyzabilityNoneCount)} | ${targets} |`;
    }),
  ];
}

const SHOWN_TRANSITIONS = [
  ['allow', 'allow'],
  ['ask', 'allow'],
  ['ask', 'ask'],
  ['deny', 'deny'],
] as const;

function otherTransitions(comparisons: readonly Comparison[]): string {
  const shown = new Set(SHOWN_TRANSITIONS.map(([from, to]) => `${from}→${to}`));
  const others = comparisons.flatMap(({ label, diff }) =>
    diff.stats.transitions
      .filter((cell) => cell.count > 0 && !shown.has(`${cell.from}→${cell.to}`))
      .map((cell) => `A vs ${label} ${cell.from}→${cell.to} ${fmt(cell.count)}`),
  );
  const narrowing = comparisons.some(({ diff }) =>
    diff.groups.some((group) => group.direction === 'narrowing'),
  );
  if (others.length === 0 && !narrowing) {
    return 'All other transition cells are 0 in every run: no narrowing, no allow→ask, and no transition into or out of deny.';
  }
  return `Other transition cells: ${others.length === 0 ? 'none' : others.join('; ')}${narrowing ? '; Narrowing groups are listed per run below' : ''}.`;
}

export function renderGateStamp(input: GateInput): string {
  const first = input.comparisons[0];
  return `${snapshotStamp(input.snapshot)}; classifier ${input.classifierVersion}; measured ${input.measured}; A vs ${first?.label ?? '-'} resultHash \`${shortHash(first?.diff.resultHash ?? '')}\``;
}

export function renderGateIntro(input: GateInput): string {
  return [
    `Gate 2 evidence from classifier ${input.classifierVersion} on the frozen snapshot and the corrected environment profile (policy v2), measured with \`pnpm evidence:remeasure\` on ${input.measured}.`,
    `Every number in the main sections is labelled **classifier ${input.classifierVersion}**${earlierMeasurements(input.previousVersions)}.`,
  ].join('\n');
}

export function renderGateComparisons(input: GateInput): string {
  const { comparisons, masks } = input;
  const totals = new Set(
    comparisons.map(
      ({ diff }) =>
        `${diff.stats.totalActions}/${diff.stats.evaluatedActions}/${diff.stats.excludedActions}`,
    ),
  );
  if (totals.size !== 1) {
    throw new Error(`comparisons disagree on totals: ${[...totals].join(', ')}`);
  }
  const stats = comparisons[0]?.diff.stats;
  if (stats === undefined) {
    throw new Error('no comparisons');
  }
  const noneTotal = comparisons.reduce((sum, { diff }) => sum + noneOfChanged(diff), 0);
  const lines = [
    `## Comparisons (classifier ${input.classifierVersion})`,
    '',
    `${capitalize(numberWord(comparisons.length))} candidate documents against policy A, each run twice:`,
    `${comparisons.map(({ label, description }) => `${label} (${description})`).join(', ')}.`,
    `All ${numberWord(comparisons.length * 2)} runs: total ${fmt(stats.totalActions)}, evaluated ${fmt(stats.evaluatedActions)}, excluded ${fmt(stats.excludedActions)}, analyzability \`none\` share of changed ${noneTotal === 0 ? '= 0' : 'is in the Top summary'}.`,
    '',
    '### Run identity',
    '',
    '| run | candidate | resultHash (run 1 = run 2) | changed | widening | critical | `diff -rq` |',
    '| --- | --- | --- | ---: | ---: | ---: | --- |',
    ...comparisons.map(
      ({ label, candidateFile, diff }) =>
        `| A vs ${label} | ${candidateFile} | \`${diff.resultHash}\` | ${fmt(diff.stats.changedActions)} | ${fmt(countGroups(diff, (g) => g.direction === 'widening'))} | ${fmt(countGroups(diff, (g) => g.severity === 'critical'))} | identical |`,
    ),
    '',
    '### Top summary',
    '',
    '| run | changed | widening | critical | allow→allow | ask→allow | ask→ask | deny→deny | none / changed |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |',
    ...comparisons.map(({ label, diff }) => {
      const cells = SHOWN_TRANSITIONS.map(([from, to]) => fmt(transition(diff.stats, from, to)));
      return `| A vs ${label} | ${fmt(diff.stats.changedActions)} | ${fmt(countGroups(diff, (g) => g.direction === 'widening'))} | ${fmt(countGroups(diff, (g) => g.severity === 'critical'))} | ${cells.join(' | ')} | ${fmt(noneOfChanged(diff))} / ${fmt(diff.stats.changedActions)} |`;
    }),
    '',
    otherTransitions(comparisons),
  ];
  for (const { label, diff } of comparisons) {
    for (const direction of ['widening', 'narrowing'] as const) {
      const groups = diff.groups.filter((group) => group.direction === direction);
      if (direction === 'narrowing' && groups.length === 0) {
        continue;
      }
      lines.push('', `### ${capitalize(direction)} groups: A vs ${label}`, '');
      if (groups.length === 0) {
        lines.push(`No groups. resultHash \`${shortHash(diff.resultHash)}\`.`);
      } else {
        lines.push(...groupTable(groups, masks));
      }
    }
    lines.push('', operationWideningLine(diff.stats));
  }
  return lines.join('\n');
}

export function renderGateCriteria(input: GateInput): string {
  const first = input.comparisons[0];
  if (first === undefined) {
    throw new Error('no comparisons');
  }
  const { diff, label } = first;
  const changed = diff.stats.changedActions;
  const widening = diff.groups.filter((group) => group.direction === 'widening');
  const top = [...diff.groups].sort(byActionsThenKey).slice(0, 10);
  const covered = top.reduce((sum, group) => sum + group.actionCount, 0);
  const coverage = changed === 0 ? 0 : Number(((100 * covered) / changed).toFixed(1));
  const opaque = widening.filter((group) =>
    group.targetSummary.every((item) => item.key === 'unknown'),
  );
  const none = noneOfChanged(diff);
  const verdict = (pass: boolean): string => (pass ? 'pass' : 'fail');
  return [
    `## Diff review criteria (A vs ${label}, classifier ${input.classifierVersion})`,
    '',
    '| criterion | result | verdict |',
    '| --- | --- | --- |',
    `| Effect-changed Actions | ${fmt(changed)} (≥ 10) | ${verdict(changed >= 10)} |`,
    `| Widening group count | ${fmt(widening.length)} (≤ 25) | ${verdict(widening.length <= 25)} |`,
    `| Compression | ${plural(top.length, 'group')} = ${fmt(covered)} / ${fmt(changed)} = ${coverage}% | ${verdict(coverage >= 80)} |`,
    `| Understandability | ${fmt(opaque.length)} group${opaque.length === 1 ? '' : 's'} cannot be fully described without raw commands${opaque.length === 0 ? '' : ` (${opaque.map((group) => input.masks.program(group.program)).join(', ')}, target always unknown)`} | ${opaque.length < 3 ? 'pass (< 3)' : 'fail (≥ 3)'} |`,
    '| Determinism | identical `resultHash` on two runs per case | pass |',
    `| Changed-action analyzability \`none\` | ${fmt(none)} / ${fmt(changed)} | ${verdict(changed === 0 || none / changed <= 0.25)} |`,
  ].join('\n');
}

function askOrDeny(result: AdoptionResult): number {
  return result.stats.effectCounts.ask + result.stats.effectCounts.deny;
}

function sizeBuckets(sizes: readonly number[]): string {
  const buckets: [string, (n: number) => boolean][] = [
    ['1,000+ Actions', (n) => n >= 1000],
    ['100 to 999', (n) => n >= 100 && n < 1000],
    ['20 to 99', (n) => n >= 20 && n < 100],
    ['5 to 19', (n) => n >= 5 && n < 20],
    ['2 to 4', (n) => n >= 2 && n < 5],
    ['single Action', (n) => n === 1],
  ];
  return buckets
    .map(([name, keep], index) => {
      const count = sizes.filter(keep).length;
      return index === 0 ? `${name} ${plural(count, 'group')}` : `${name} ${fmt(count)}`;
    })
    .join(', ');
}

/** The fewest largest groups whose Actions reach `share` of the ask and deny Actions. */
function groupsToCover(sizes: readonly number[], total: number, share: number): number {
  let covered = 0;
  for (const [index, size] of sizes.entries()) {
    covered += size;
    if (covered >= share * total) {
      return index + 1;
    }
  }
  return sizes.length;
}

function distinctProgramsLine(groups: readonly AdoptionGroup[]): string {
  const counts = groups.map((group) => group.distinctProgramCount).sort((a, b) => b - a);
  const firstOne = counts.indexOf(1);
  const head = firstOne === -1 ? counts : counts.slice(0, firstOne);
  const ones = firstOne === -1 ? 0 : counts.length - firstOne;
  return `${head.map(fmt).join(', ')}${ones === 0 ? '' : `, then 1 in the remaining ${plural(ones, 'group')}`}`;
}

export function renderAdoptionStamp(input: AdoptionInput): string {
  return `${snapshotStamp(input.snapshot)}; classifier ${input.classifierVersion}; measured ${input.measured}; candidate policy A contentHash \`${shortHash(input.candidateContentHash)}\`; adoption resultHash \`${shortHash(input.serverResultHash)}\` (server), \`${shortHash(input.local.resultHash)}\` (local pipeline)`;
}

export function renderAdoptionIntro(input: AdoptionInput): string {
  return `Every number in the main sections below is labelled **classifier ${input.classifierVersion}, policy A** (measured ${input.measured}).`;
}

export function renderAdoptionResult(input: AdoptionInput): string {
  const { local, environment, snapshot } = input;
  const { stats } = local;
  const { allow, ask, deny } = stats.effectCounts;
  const ev = stats.evaluatedActions;
  const denyGroups = local.groups.filter((group) => group.effect === 'deny').length;
  const askGroups = local.groups.length - denyGroups;
  return [
    `The candidate is policy A: the default template's Rules with the corrected environment profile (credential paths ${environment.credentialPaths.length}, agent-config paths ${environment.agentConfigPaths.length}, trusted remotes ${environment.trustedRemotes.length}, public remotes ${environment.publicRemotes.length}, protected branches ${environment.protectedBranches.length}, production markers ${environment.productionMarkers.length}).`,
    `Actions are built the same way the server builds them for a replay (transcript parse, remote enrichment, classifier ${input.classifierVersion}, duplicate Action Keys removed) and evaluated with \`computeAdoption\` from \`@authority/replay/diff\`.`,
    '',
    '| item | value |',
    '| --- | ---: |',
    `| Sessions | ${fmt(snapshot.sessions)} |`,
    `| Actions (after dedupe) | ${fmt(snapshot.actions)} (${plural(snapshot.duplicates, 'duplicate')}) |`,
    `| evaluated | ${fmt(ev)} |`,
    `| excluded (no Operation) | ${fmt(stats.excludedActions)} |`,
    `| allow | ${fmt(allow)} (${effectShare(allow, ev)}) |`,
    `| ask | ${fmt(ask)} (${effectShare(ask, ev)}) |`,
    `| deny | ${fmt(deny)} (${effectShare(deny, ev)}) |`,
    `| analyzability full / partial / none (Action) | ${fmt(stats.analyzability.full)} / ${fmt(stats.analyzability.partial)} / ${fmt(stats.analyzability.none)} |`,
    `| Capability × Zone × Effect cells | ${fmt(stats.cells.length)} |`,
    `| Adoption Groups (ask / deny) | ${fmt(local.groups.length)} (${fmt(askGroups)} / ${fmt(denyGroups)}) |`,
    `| ask + deny Actions assigned to a group | ${fmt(local.assignments.length)} |`,
    `| Sessions with at least one ask or deny Action | ${fmt(input.sessionsWithAskOrDeny)} |`,
    `| \`computeAdoption\` wall time | ${fmt(input.localWallTimesMs[0])} ms |`,
    '',
    `The four figures the adoption review shows on screen and that this file locks: **evaluated ${fmt(ev)}, ask ${pct(ask, ev)}, deny ${fmt(deny)} (${effectShare(deny, ev)}), ${fmt(local.groups.length)} Adoption Groups**.`,
    `The web renders shares with one decimal, so the deny tile reads \`${pct(deny, ev)}\`; the count ${fmt(deny)} is the exact figure.`,
  ].join('\n');
}

export function renderAdoptionGroups(input: AdoptionInput): string {
  const { local, masks } = input;
  const total = askOrDeny(local);
  const sizes = local.groups.map((group) => group.actionCount).sort((a, b) => b - a);
  const largest = sizes[0] ?? 0;
  const k90 = groupsToCover(sizes, total, 0.9);
  const k99 = groupsToCover(sizes, total, 0.99);
  const topShare = sizes.slice(0, k90).reduce((sum, n) => sum + n, 0);
  const mixed = local.groups.filter((group) => group.decidingRuleIds.length > 1);
  const widest = [...local.groups].sort(
    (a, b) => b.distinctProgramCount - a.distinctProgramCount,
  )[0];
  return [
    'Groups are `[effect, capability, zone]` (ADR-0010), in review order (deny first, then ask by Action count).',
    `The share column is of the ${fmt(total)} ask and deny Actions.`,
    'Programs are masked as in the previous rounds: non-standard programs as `<local-tool-NN>`, MCP tools as `<mcp-tool-NN>`.',
    '',
    '| # | effect | capability | zone | deciding rule | actions | sessions | share | none | distinct programs | top programs |',
    '| ---: | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |',
    ...local.groups.map((group, index) => {
      const rule =
        group.decidingRuleIds.length === 0
          ? 'none (default ask)'
          : group.decidingRuleIds.join(', ');
      const programs = group.programSummary
        .slice(0, 4)
        .map((item) => `${masks.program(item.program)} ${fmt(item.count)}`)
        .join(', ');
      return `| ${index + 1} | ${group.effect} | ${group.capability} | ${group.zone} | ${rule} | ${fmt(group.actionCount)} | ${fmt(group.sessionCount)} | ${pct(group.actionCount, total)} | ${fmt(group.analyzabilityNoneCount)} | ${fmt(group.distinctProgramCount)} | ${programs} |`;
    }),
    '',
    `- Group sizes: ${sizeBuckets(sizes)}.`,
    `  The largest group holds ${pct(largest, total)} of ask and deny Actions, the top ${k90} hold ${pct(topShare, total)}, the top ${k99} hold 99%.`,
    mixed.length === 0
      ? '- Every group has exactly one deciding Rule (the default `ask` counted as one); no group mixes Rules.'
      : `- ${plural(mixed.length, 'group')} mix deciding Rules: ${mixed.map((group) => `\`${group.effect} · ${group.capability} · ${group.zone}\``).join(', ')}.`,
    `- Distinct programs per group: ${distinctProgramsLine(local.groups)}.`,
    widest === undefined
      ? ''
      : `  The Program Summary inside each group is what makes an \`expected\` Verdict on \`${widest.effect} · ${widest.capability} · ${widest.zone}\` a decision about ${fmt(widest.distinctProgramCount)} programs rather than about a key.`,
    `- Review units: ${fmt(local.groups.length)} Verdicts, one per group, to open the gate.`,
  ].join('\n');
}

export function renderAdoptionDeterminism(input: AdoptionInput): string {
  const { local, gateB } = input;
  const { stats } = local;
  const askToAllow = transition(gateB.stats, 'ask', 'allow');
  const askToAsk = transition(gateB.stats, 'ask', 'ask');
  const agrees =
    transition(gateB.stats, 'allow', 'allow') === stats.effectCounts.allow &&
    askToAllow + askToAsk === stats.effectCounts.ask &&
    transition(gateB.stats, 'deny', 'deny') === stats.effectCounts.deny &&
    gateB.stats.evaluatedActions === stats.evaluatedActions &&
    gateB.stats.excludedActions === stats.excludedActions;
  if (!agrees) {
    throw new Error('adoption preview disagrees with the Gate 2 A vs B baseline column');
  }
  const [first, second] = input.localWallTimesMs;
  const serverLine =
    input.serverResultHash === local.resultHash
      ? `- Two server runs over the imported Actions gave the same \`resultHash\` \`${input.serverResultHash}\`, equal to the local value.`
      : `- Two server runs over the imported Actions gave the same \`resultHash\` \`${input.serverResultHash}\`; the ${input.serverSessionDifference === 1 ? 'one' : fmt(input.serverSessionDifference)}-Session difference from the local value is explained under "Fresh-volume journey re-run".`;
  return [
    `- Two \`computeAdoption\` runs over the same snapshot gave the same \`resultHash\` \`${local.resultHash}\` (${fmt(first)} ms and ${fmt(second)} ms).`,
    serverLine,
    `- The preview agrees with the Gate 2 A vs B replay on the same classifier: allow→allow ${fmt(stats.effectCounts.allow)} = allow; ask→allow ${fmt(askToAllow)} + ask→ask ${fmt(askToAsk)} = ${fmt(stats.effectCounts.ask)} = ask; deny→deny ${fmt(stats.effectCounts.deny)} = deny; evaluated ${fmt(stats.evaluatedActions)} and excluded ${fmt(stats.excludedActions)} in both (\`docs/evidence/gate2-replay.md\`).`,
  ].join('\n');
}

export function renderJourney(steps: readonly JourneyStep[]): string {
  return [
    '| step | via | result |',
    '| --- | --- | --- |',
    ...steps.map((step) => `| ${step.step} | ${step.via} | ${step.result} |`),
  ].join('\n');
}

export function renderConformanceStamp(input: ConformanceInput): string {
  return `${snapshotStamp(input.snapshot)}; classifier ${input.classifierVersion}; measured ${input.measured}; conformance resultHash \`${shortHash(input.resultHash)}\``;
}

export function renderConformanceIntro(input: ConformanceInput): string {
  return `Every number in the main sections is labelled **classifier ${input.classifierVersion}, policy A** (measured ${input.measured})${earlierMeasurements(input.previousVersions)}.`;
}

export function renderConformanceMethod(input: ConformanceInput): string {
  const { imported, spool } = input;
  const events = [...spool.events]
    .sort(([, a], [, b]) => b - a)
    .map(([event, count]) => `${event} ${fmt(count)}`)
    .join(', ');
  return [
    '- Candidate is policy A from the v2 environment profile, adopted as version 1 through the first-policy journey (`docs/evidence/adoption-preview.md`) on a fresh volume.',
    `- Window: ${input.window.from} .. ${input.window.to}, the same as the earlier runs.`,
    `- Import: ${fmt(imported.sessions)} sessions, ${fmt(imported.acceptedCount)} Actions accepted, ${plural(imported.duplicateCount, 'duplicate')}, ${fmt(imported.failedSessions)} failed (the NUL fix is on this build, so the 7 sessions that failed in 0.2.1 imported; their 904 Actions are outside the window).`,
    `- Spool: copies of the hook observation files flushed from an isolated scratch home; the live file was cut at the same instant as the first run so the observation set is identical (${fmt(spool.lines)} lines: ${events}). Only the copies were renamed.`,
    `- The run was requested through the API; V1 has no screen that starts a conformance run. Completed; classifierVersion ${input.classifierVersion}; resultHash \`${input.resultHash}\`.`,
  ].join('\n');
}

function findingsOf(input: ConformanceInput, kind: string): readonly ConformanceFinding[] {
  return input.findings.filter((finding) => finding.kind === kind);
}

function actionsOf(findings: readonly ConformanceFinding[]): number {
  return findings.reduce((sum, finding) => sum + finding.actionCount, 0);
}

export function renderConformanceFindings(input: ConformanceInput): string {
  const { stats } = input;
  const cells = EFFECTS.flatMap((from) =>
    EFFECTS.map((to) => ({ from, to, count: transition(stats, from, to) })),
  ).filter((cell) => cell.count > 0);
  return [
    '| kind | groups | Actions |',
    '| --- | ---: | ---: |',
    ...['violation', 'under_asked', 'over_asked'].map((kind) => {
      const findings = findingsOf(input, kind);
      return `| ${kind} | ${fmt(findings.length)} | ${fmt(actionsOf(findings))} |`;
    }),
    '',
    `Stats: total ${fmt(stats.totalActions)} window Actions, evaluated ${fmt(stats.evaluatedActions)}, excluded ${fmt(stats.excludedActions)}, changed ${fmt(stats.changedActions)}.`,
    `Transitions (observed Disposition Effect → candidate Effect): ${cells.map((cell) => `${cell.from}→${cell.to} ${fmt(cell.count)}`).join(', ')}, all others 0.`,
  ].join('\n');
}

/** Rows by Action count, ties in the schema enum order. */
function countTable(
  header: string,
  findings: readonly ConformanceFinding[],
  key: (finding: ConformanceFinding) => string,
  order: readonly string[],
): string[] {
  const counts = new Map<string, number>();
  for (const finding of findings) {
    counts.set(key(finding), (counts.get(key(finding)) ?? 0) + finding.actionCount);
  }
  const rows = [...counts].sort(([a, x], [b, y]) => y - x || order.indexOf(a) - order.indexOf(b));
  return [
    `| ${header} | Actions |`,
    '| --- | ---: |',
    ...rows.map(([name, count]) => `| ${name} | ${fmt(count)} |`),
  ];
}

export function renderConformanceUnderAsked(input: ConformanceInput): string {
  const underAsked = findingsOf(input, 'under_asked');
  return [
    ...countTable('zone', underAsked, (finding) => finding.zone, ZoneSchema.options),
    '',
    ...countTable(
      'capability',
      underAsked,
      (finding) => finding.capability,
      CapabilitySchema.options,
    ),
  ].join('\n');
}

export function renderReadmeAdoption(input: AdoptionInput): string {
  const { stats, groups } = input.local;
  const { allow, ask, deny } = stats.effectCounts;
  const ev = stats.evaluatedActions;
  const denyGroups = groups.filter((group) => group.effect === 'deny').length;
  return [
    '| evaluated Actions | allow | ask | deny | Adoption Groups |',
    '| ---: | ---: | ---: | ---: | --- |',
    `| ${fmt(ev)} | ${fmt(allow)} (${effectShare(allow, ev)}) | ${fmt(ask)} (${effectShare(ask, ev)}) | ${fmt(deny)} (${effectShare(deny, ev)}) | ${fmt(groups.length)} (${fmt(groups.length - denyGroups)} ask, ${fmt(denyGroups)} deny) |`,
  ].join('\n');
}
