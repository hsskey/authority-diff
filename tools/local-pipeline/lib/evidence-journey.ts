import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { z } from 'zod';
import {
  ActivityOverviewResponseSchema,
  AdoptionGroupSamplesResponseSchema,
  ChangeReviewReportResponseSchema,
  ChangeReviewResponseSchema,
  CreateChangeReviewRequestSchema,
  CreateDecisionRequestSchema,
  CreatePolicyRequestSchema,
  CreatePolicyResponseSchema,
  CreatePolicyVersionRequestSchema,
  CreateReplayRunRequestSchema,
  ListConformanceFindingsResponseSchema,
  ListPoliciesResponseSchema,
  ListReviewAdoptionGroupsResponseSchema,
  ListReviewDiffGroupsResponseSchema,
  PolicyVersionResponseSchema,
  RecordVerdictRequestSchema,
  ReplayRunResponseSchema,
  UpdatePolicyVersionRequestSchema,
  ValidatePolicyVersionResponseSchema,
  VerdictResponseSchema,
  type ChangeReviewResponse,
  type ListConformanceFindingsResponse,
  type ReplayRunResponse,
} from '@authority/contracts/schema';
import type { IsoTimestamp } from '@authority/kernel';
import { canonicalJson } from '@authority/kernel/hash';
import type { PolicyDocument } from '@authority/policy/schema';
import type { AdoptionGroup, AdoptionResult, DiffResult } from '@authority/replay/schema';
import {
  fmt,
  shortHash,
  type ImportSummary,
  type JourneyStep,
  type SpoolSummary,
} from './evidence-render.ts';

const TOKEN = 'local-dev-token';

const count = z.number().int().nonnegative();
const ImportSummarySchema = z.object({
  sessions: count,
  acceptedCount: count,
  duplicateCount: count,
  failedSessions: count,
});
const FlushSummarySchema = z.object({ sentFiles: count, failedFiles: count });
const AuditSchema = z.object({ isIntact: z.boolean(), checkedCount: count });
const SpoolLineSchema = z.object({ event: z.string() });
const REVIEWER = 'evidence-remeasure';
const POLL_MS = 1000;
const POLL_LIMIT = 600;

export interface JourneyInput {
  readonly repoRoot: string;
  readonly runDir: string;
  readonly snapshotDir: string;
  readonly spoolDir: string;
  readonly policyA: PolicyDocument;
  readonly policyB: PolicyDocument;
  readonly policyBp: PolicyDocument;
  readonly policyAContentHash: string;
  /** The first and last Action of the snapshot; every review covers the whole snapshot. */
  readonly reviewWindow: { readonly from: IsoTimestamp; readonly to: IsoTimestamp };
  readonly conformanceWindow: { readonly from: IsoTimestamp; readonly to: IsoTimestamp };
  readonly localAdoption: AdoptionResult;
  readonly localB: DiffResult;
  readonly localBp: DiffResult;
}

export interface JourneyResult {
  readonly imported: ImportSummary;
  readonly spool: SpoolSummary;
  readonly adoptionResultHash: string;
  readonly adoptionGroups: readonly AdoptionGroup[];
  readonly conformanceRun: ReplayRunResponse;
  readonly conformance: ListConformanceFindingsResponse;
  readonly steps: readonly JourneyStep[];
  /** What the steps state, keyed and formatted like an evidence-numbers block. */
  readonly figures: ReadonlyMap<string, string>;
}

interface RouteDef<Res, Req> {
  readonly method: 'GET' | 'POST' | 'PUT';
  readonly path: string;
  readonly request: z.ZodType<Req> | null;
  readonly response: z.ZodType<Res>;
}

const API = '/api/v1';
const get = <Res>(path: string, response: z.ZodType<Res>): RouteDef<Res, never> => ({
  method: 'GET',
  path,
  request: null,
  response,
});
const send =
  (method: 'POST' | 'PUT') =>
  <Req, Res>(
    path: string,
    request: z.ZodType<Req> | null,
    response: z.ZodType<Res>,
  ): RouteDef<Res, Req> => ({ method, path, request, response });
const post = send('POST');
const put = send('PUT');

// Local copies of the V1 HTTP routes: tools may import contract schemas but not the route table.
const routes = {
  listPolicies: get(`${API}/policies`, ListPoliciesResponseSchema),
  createPolicy: post(`${API}/policies`, CreatePolicyRequestSchema, CreatePolicyResponseSchema),
  createPolicyVersion: post(
    `${API}/policies/:policyId/versions`,
    CreatePolicyVersionRequestSchema,
    PolicyVersionResponseSchema,
  ),
  getPolicyVersion: get(`${API}/policy-versions/:id`, PolicyVersionResponseSchema),
  updatePolicyVersion: put(
    `${API}/policy-versions/:id`,
    UpdatePolicyVersionRequestSchema,
    PolicyVersionResponseSchema,
  ),
  validatePolicyVersion: post<never, z.infer<typeof ValidatePolicyVersionResponseSchema>>(
    `${API}/policy-versions/:id/validations`,
    null,
    ValidatePolicyVersionResponseSchema,
  ),
  createReplayRun: post(
    `${API}/replay-runs`,
    CreateReplayRunRequestSchema,
    ReplayRunResponseSchema,
  ),
  getReplayRun: get(`${API}/replay-runs/:id`, ReplayRunResponseSchema),
  getAdoptionGroupSamples: get(
    `${API}/adoption-groups/:runId/:groupKey/samples`,
    AdoptionGroupSamplesResponseSchema,
  ),
  getActivityOverview: get(`${API}/activity-overview`, ActivityOverviewResponseSchema),
  listConformanceFindings: get(
    `${API}/conformance-findings`,
    ListConformanceFindingsResponseSchema,
  ),
  createChangeReview: post(
    `${API}/change-reviews`,
    CreateChangeReviewRequestSchema,
    ChangeReviewResponseSchema,
  ),
  getChangeReview: get(`${API}/change-reviews/:id`, ChangeReviewResponseSchema),
  listReviewDiffGroups: get(
    `${API}/change-reviews/:id/diff-groups`,
    ListReviewDiffGroupsResponseSchema,
  ),
  listReviewAdoptionGroups: get(
    `${API}/change-reviews/:id/adoption-groups`,
    ListReviewAdoptionGroupsResponseSchema,
  ),
  recordVerdict: put(
    `${API}/change-reviews/:id/verdicts/:groupKey`,
    RecordVerdictRequestSchema,
    VerdictResponseSchema,
  ),
  decideChangeReview: post(
    `${API}/change-reviews/:id/decisions`,
    CreateDecisionRequestSchema,
    ChangeReviewResponseSchema,
  ),
  getChangeReviewReport: get(`${API}/change-reviews/:id/report`, ChangeReviewReportResponseSchema),
};

interface CallOptions<Req> {
  readonly params?: Readonly<Record<string, string>>;
  readonly query?: Readonly<Record<string, string | number>>;
  readonly body?: Req;
  readonly headers?: Readonly<Record<string, string>>;
}

class Api {
  constructor(readonly base: string) {}

  async send<Res, Req>(
    route: RouteDef<Res, Req>,
    options: CallOptions<Req> = {},
  ): Promise<{ status: number; body: unknown }> {
    const path = route.path.replace(/:([A-Za-z]+)/g, (_match, name: string) =>
      encodeURIComponent(options.params?.[name] ?? ''),
    );
    const query = new URLSearchParams(
      Object.entries(options.query ?? {}).map(([key, value]) => [key, String(value)]),
    ).toString();
    const response = await fetch(`${this.base}${path}${query === '' ? '' : `?${query}`}`, {
      method: route.method,
      headers: {
        authorization: `Bearer ${TOKEN}`,
        ...options.headers,
        ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    });
    const text = await response.text();
    const isJson = response.headers.get('content-type')?.includes('application/json') === true;
    return { status: response.status, body: isJson ? JSON.parse(text) : text };
  }

  async call<Res, Req>(route: RouteDef<Res, Req>, options: CallOptions<Req> = {}): Promise<Res> {
    const { status, body } = await this.send(route, options);
    if (status < 200 || status >= 300) {
      throw new Error(`${route.method} ${route.path} → HTTP ${status}: ${JSON.stringify(body)}`);
    }
    return route.response.parse(body);
  }

  async all<Item>(
    route: RouteDef<{ items: Item[]; nextCursor: string | null }, never>,
    params: Readonly<Record<string, string>>,
  ): Promise<Item[]> {
    const items: Item[] = [];
    let cursor: string | null = null;
    do {
      const page: { items: Item[]; nextCursor: string | null } = await this.call(route, {
        params,
        query: { limit: 200, ...(cursor === null ? {} : { cursor }) },
      });
      items.push(...page.items);
      cursor = page.nextCursor;
    } while (cursor !== null);
    return items;
  }
}

function check(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`journey check failed: ${message}`);
  }
}

/** `env` adds variables on top of the inherited environment through env(1). */
function run(
  command: string,
  args: readonly string[],
  options: { cwd: string; env?: Readonly<Record<string, string>> },
): string {
  const assignments = Object.entries(options.env ?? {}).map(([key, value]) => `${key}=${value}`);
  return execFileSync('env', [...assignments, command, ...args], {
    cwd: options.cwd,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'inherit'],
  });
}

function composeFile(project: string, repoRoot: string): string {
  return `name: ${project}

services:
  db:
    image: postgres:16
    environment:
      POSTGRES_USER: authority
      POSTGRES_PASSWORD: authority
      POSTGRES_DB: authority
    volumes:
      - db-data:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U authority -d authority']
      interval: 2s
      timeout: 3s
      retries: 15

  server:
    build:
      context: ${JSON.stringify(repoRoot)}
      dockerfile: apps/server/Dockerfile
    environment:
      AUTHORITY_DB_URL: postgres://authority:authority@db:5432/authority
      AUTHORITY_AUTH_TOKEN: ${TOKEN}
      AUTHORITY_SERVER_PORT: '8787'
      AUTHORITY_LOG_LEVEL: warn
    command: sh -c "pnpm db:migrate && pnpm --filter @authority/server start"
    ports:
      - '127.0.0.1::8787'
    depends_on:
      db:
        condition: service_healthy
    healthcheck:
      test:
        - CMD
        - node
        - -e
        - "fetch('http://localhost:8787/readyz').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
      interval: 2s
      timeout: 3s
      retries: 60

volumes:
  db-data:
`;
}

/** Counts the spool lines by hook event, the observation set the conformance run reads. */
export function summarizeSpool(spoolDir: string): SpoolSummary {
  const events = new Map<string, number>();
  let lines = 0;
  for (const name of readdirSync(spoolDir)
    .filter((file) => file.endsWith('.jsonl'))
    .sort()) {
    for (const line of readFileSync(join(spoolDir, name), 'utf8').split('\n')) {
      if (line.trim() === '') {
        continue;
      }
      lines++;
      const { event } = SpoolLineSchema.parse(JSON.parse(line));
      events.set(event, (events.get(event) ?? 0) + 1);
    }
  }
  return { lines, events };
}

async function waitForReview(api: Api, id: string): Promise<ChangeReviewResponse> {
  for (let attempt = 0; attempt < POLL_LIMIT; attempt++) {
    const review = await api.call(routes.getChangeReview, { params: { id } });
    if (review.status !== 'computing') {
      check(review.status === 'ready', `review ${id} ended ${review.status}`);
      return review;
    }
    await sleep(POLL_MS);
  }
  throw new Error(`review ${id} still computing`);
}

async function waitForRun(api: Api, id: string): Promise<ReplayRunResponse> {
  for (let attempt = 0; attempt < POLL_LIMIT; attempt++) {
    const replayRun = await api.call(routes.getReplayRun, { params: { id } });
    if (replayRun.status === 'completed') {
      return replayRun;
    }
    check(replayRun.status !== 'failed', `replay run ${id} failed: ${replayRun.errorCode ?? '-'}`);
    await sleep(POLL_MS);
  }
  throw new Error(`replay run ${id} did not complete`);
}

async function draftWith(
  api: Api,
  version: { readonly id: string; readonly contentHash: string },
  document: PolicyDocument,
): Promise<{ contentHash: string; isValid: boolean }> {
  const saved = await api.call(routes.updatePolicyVersion, {
    params: { id: version.id },
    headers: { 'If-Match': version.contentHash },
    body: { document },
  });
  const validation = await api.call(routes.validatePolicyVersion, { params: { id: version.id } });
  return { contentHash: saved.contentHash, isValid: validation.isValid };
}

async function judgeAll(
  api: Api,
  reviewId: string,
  groupKeys: readonly string[],
  verdictOf: (groupKey: string) => 'expected' | 'unexpected',
): Promise<void> {
  for (const groupKey of groupKeys) {
    await api.call(routes.recordVerdict, {
      params: { id: reviewId, groupKey },
      body: { verdict: verdictOf(groupKey), note: '' },
    });
  }
}

function sameKeys(a: readonly { groupKey: string }[], b: readonly { groupKey: string }[]): boolean {
  const left = a.map((group) => group.groupKey).sort();
  const right = b.map((group) => group.groupKey).sort();
  return left.length === right.length && left.every((key, index) => key === right[index]);
}

async function journey(api: Api, input: JourneyInput, scratchHome: string): Promise<JourneyResult> {
  const steps: JourneyStep[] = [];
  const figures = new Map<string, string>();
  const record = (entries: Readonly<Record<string, number | string>>): void => {
    for (const [key, value] of Object.entries(entries)) {
      figures.set(key, typeof value === 'number' ? fmt(value) : value);
    }
  };
  const cli = (args: readonly string[], home?: string): string =>
    run('pnpm', ['--silent', 'authority', ...args], {
      cwd: input.repoRoot,
      env: {
        AUTHORITY_CLI_SERVER_URL: api.base,
        AUTHORITY_CLI_TOKEN: TOKEN,
        ...(home === undefined ? {} : { HOME: home }),
      },
    });
  const { localAdoption, reviewWindow } = input;
  const window = { windowFrom: reviewWindow.from, windowTo: reviewWindow.to };

  const imported: ImportSummary = ImportSummarySchema.parse(
    JSON.parse(cli(['import', input.snapshotDir])),
  );
  check(imported.failedSessions === 0, `${imported.failedSessions} sessions failed import`);
  check(
    imported.acceptedCount === localAdoption.stats.totalActions,
    'imported Actions differ from the snapshot',
  );
  record({
    'snapshot.sessions': imported.sessions,
    'snapshot.actions': imported.acceptedCount,
    'snapshot.duplicates': imported.duplicateCount,
    'snapshot.failed': imported.failedSessions,
  });
  steps.push({
    step: '1 import',
    via: '`authority import`',
    result: `${fmt(imported.sessions)} sessions, ${fmt(imported.acceptedCount)} accepted, ${fmt(imported.duplicateCount)} duplicates, ${fmt(imported.failedSessions)} failed`,
  });

  const policies = await api.call(routes.listPolicies, { query: { limit: 200 } });
  check(policies.items.length === 0, 'a fresh volume holds no Policy');
  const overview = await api.call(routes.getActivityOverview, { query: { windowDays: 365 } });
  // The overview window ends now, so it covers the whole snapshot only for a year.
  if (overview.windowFrom <= reviewWindow.from) {
    check(
      overview.actionCount === localAdoption.stats.totalActions &&
        overview.evaluableActionCount === localAdoption.stats.evaluatedActions &&
        canonicalJson(overview.analyzability) === canonicalJson(localAdoption.stats.analyzability),
      'the Activity Overview differs from the local computation',
    );
  }
  const { full, partial, none } = localAdoption.stats.analyzability;
  record({
    'analyzability.full': full,
    'analyzability.partial': partial,
    'analyzability.none': none,
  });
  steps.push({
    step: '2 overview, no Policy',
    via: 'activity overview',
    result: `no Policy; Action ${fmt(overview.actionCount)}, evaluable ${fmt(overview.evaluableActionCount)}; analyzability ${fmt(full)} / ${fmt(partial)} / ${fmt(none)}`,
  });

  const created = await api.call(routes.createPolicy, {
    body: { name: 'org-default', template: 'default' },
  });
  const v1 = created.initialVersion;
  check(v1.status === 'draft' && v1.versionNumber === 1, 'the first Policy opens draft version 1');
  const savedA = await draftWith(api, v1, input.policyA);
  check(savedA.contentHash === input.policyAContentHash, 'server content hash of policy A differs');
  check(savedA.isValid, 'policy A does not validate');
  record({ 'policy-a.contentHash': shortHash(savedA.contentHash) });
  steps.push({
    step: '3 first Policy',
    via: 'policy version',
    result: `draft version 1 from the default template replaced with policy A (content hash \`${shortHash(savedA.contentHash)}\`), validation passed`,
  });

  const adoptionReview = await waitForReview(
    api,
    (await api.call(routes.createChangeReview, { body: { candidateVersionId: v1.id, ...window } }))
      .id,
  );
  check(
    adoptionReview.kind === 'adoption' && adoptionReview.baselineVersionId === null,
    'the first review is an adoption review',
  );
  const adoptionRun = await api.call(routes.getReplayRun, {
    params: { id: adoptionReview.replaySummary.replayRunId ?? '' },
  });
  check(adoptionRun.kind === 'adoption', 'the adoption review runs an adoption replay');
  check(
    canonicalJson(adoptionRun.stats) === canonicalJson(localAdoption.stats),
    'server adoption stats differ from the local computation',
  );
  const adoptionGroups = await api.all(routes.listReviewAdoptionGroups, { id: adoptionReview.id });
  check(
    sameKeys(adoptionGroups, localAdoption.groups),
    'server Adoption Group keys differ from the local computation',
  );
  const adoptionResultHash = adoptionReview.replaySummary.resultHash ?? '';
  const rerun = await waitForRun(
    api,
    (
      await api.call(routes.createReplayRun, {
        body: { kind: 'adoption', candidateVersionId: v1.id, ...window },
      })
    ).id,
  );
  check(
    rerun.resultHash === adoptionResultHash,
    'a second server adoption run gave a different resultHash',
  );
  const { allow, ask, deny } = localAdoption.stats.effectCounts;
  const denyGroups = adoptionGroups.filter((group) => group.effect === 'deny').length;
  record({
    'snapshot.evaluated': localAdoption.stats.evaluatedActions,
    'policy-a.allow': allow,
    'policy-a.ask': ask,
    'policy-a.deny': deny,
    'adoption.ask-groups': adoptionGroups.length - denyGroups,
    'adoption.deny-groups': denyGroups,
    'adoption.resultHash': shortHash(adoptionResultHash),
  });
  steps.push({
    step: '4 adoption preview',
    via: 'change review, replay run',
    result: `kind \`adoption\`, no baseline; evaluated ${fmt(localAdoption.stats.evaluatedActions)}; allow ${fmt(allow)}, ask ${fmt(ask)}, deny ${fmt(deny)}; ${fmt(adoptionGroups.length - denyGroups)} ask and ${fmt(denyGroups)} deny groups; stats and group keys equal the local computation; resultHash \`${shortHash(adoptionResultHash)}\` on two runs`,
  });

  const detailed = [
    adoptionGroups.find((group) => group.effect === 'deny'),
    adoptionGroups.find((group) => group.effect === 'ask'),
  ];
  for (const group of detailed) {
    check(group !== undefined, 'the preview has a deny and an ask group');
    const samples = await api.call(routes.getAdoptionGroupSamples, {
      params: { runId: adoptionRun.id, groupKey: group?.groupKey ?? '' },
    });
    check(
      samples.items.length > 0 && (group?.headline ?? '') !== '',
      'a group has a Headline and samples',
    );
  }
  steps.push({
    step: '5 group detail',
    via: 'adoption group samples',
    result:
      detailed
        .map(
          (group) =>
            `\`${group?.effect ?? ''} · ${group?.capability ?? ''} · ${group?.zone ?? ''}\``,
        )
        .join(' and ') + ' return a Headline and samples',
  });

  const [lastGroup, ...others] = [...adoptionGroups].reverse();
  await judgeAll(
    api,
    adoptionReview.id,
    others.map((group) => group.groupKey),
    () => 'expected',
  );
  const beforeLast = await api.call(routes.getChangeReview, { params: { id: adoptionReview.id } });
  check(
    !beforeLast.gate.isOpen &&
      beforeLast.gate.blockers.some(
        (blocker) => blocker.code === 'adoption_unreviewed' && blocker.count === 1,
      ),
    'the gate stays closed until the last group is judged',
  );
  await judgeAll(api, adoptionReview.id, [lastGroup?.groupKey ?? ''], () => 'expected');
  const opened = await api.call(routes.getChangeReview, { params: { id: adoptionReview.id } });
  check(opened.gate.isOpen, 'the gate opens once every group is judged');
  record({ 'adoption.groups': adoptionGroups.length });
  steps.push({
    step: '6 verdicts',
    via: 'verdicts',
    result: `${fmt(adoptionGroups.length)} groups set to \`expected\`; \`adoption_unreviewed\` blocks the gate until the last one, then the gate opens`,
  });

  const adopted = await api.call(routes.decideChangeReview, {
    params: { id: adoptionReview.id },
    body: { decision: 'accept', note: '', reviewerName: REVIEWER },
  });
  const v1After = await api.call(routes.getPolicyVersion, { params: { id: v1.id } });
  check(
    adopted.status === 'accepted' && v1After.status === 'accepted',
    'adopting accepts version 1',
  );
  steps.push({
    step: '7 adopt',
    via: 'decision',
    result: 'review `accepted`, version 1 `accepted`',
  });

  const report = await api.call(routes.getChangeReviewReport, {
    params: { id: adoptionReview.id },
  });
  writeFileSync(join(input.runDir, 'adoption-report.md'), report);
  check(report.includes(adoptionResultHash), 'the adoption Evidence Report carries the resultHash');
  steps.push({
    step: '8 report',
    via: 'Evidence Report',
    result: `adoption Evidence Report carries resultHash \`${shortHash(adoptionResultHash)}\``,
  });

  const spoolTarget = join(scratchHome, '.authority', 'spool');
  mkdirSync(spoolTarget, { recursive: true });
  for (const name of readdirSync(input.spoolDir).filter((file) => file.endsWith('.jsonl'))) {
    cpSync(join(input.spoolDir, name), join(spoolTarget, name));
  }
  const flushed = FlushSummarySchema.parse(JSON.parse(cli(['spool-flush'], scratchHome)));
  check(flushed.failedFiles === 0 && flushed.sentFiles > 0, 'spool-flush sends every copy');
  const conformanceRun = await waitForRun(
    api,
    (
      await api.call(routes.createReplayRun, {
        body: {
          kind: 'conformance',
          candidateVersionId: v1.id,
          windowFrom: input.conformanceWindow.from,
          windowTo: input.conformanceWindow.to,
        },
      })
    ).id,
  );
  const conformance = await api.call(routes.listConformanceFindings);
  check(
    conformance.run?.replayRunId === conformanceRun.id,
    'the findings belong to the conformance run',
  );
  record({
    'conformance.spool-files': flushed.sentFiles,
    'conformance.findings': conformance.items.length,
    'conformance.resultHash': shortHash(conformanceRun.resultHash ?? ''),
  });
  steps.push({
    step: '9 conformance',
    via: '`authority spool-flush`, replay run',
    result: `${fmt(flushed.sentFiles)} spool copies sent; conformance run for version 1 completed with ${fmt(conformance.items.length)} findings, resultHash \`${shortHash(conformanceRun.resultHash ?? '')}\``,
  });

  const v2 = await api.call(routes.createPolicyVersion, {
    params: { policyId: created.policy.id },
    body: { baseVersionId: v1.id },
  });
  const savedBp = await draftWith(api, v2, input.policyBp);
  check(savedBp.isValid, "policy B' does not validate");
  const reviewBp = await waitForReview(
    api,
    (await api.call(routes.createChangeReview, { body: { candidateVersionId: v2.id, ...window } }))
      .id,
  );
  check(
    reviewBp.kind === 'change' && reviewBp.baselineVersionId === v1.id,
    "B' gets a change review against version 1",
  );
  check(
    reviewBp.replaySummary.resultHash === input.localBp.resultHash,
    "server B' resultHash differs from the local Gate 2 run",
  );
  const groupsBp = (await api.all(routes.listReviewDiffGroups, { id: reviewBp.id })).filter(
    (group) => group.direction === 'widening',
  );
  const keysB = new Set(input.localB.groups.map((group) => group.groupKey));
  const unexpected = groupsBp.filter((group) => !keysB.has(group.groupKey));
  record({
    'change-bp.contentHash': shortHash(savedBp.contentHash),
    'change-bp.changed': reviewBp.replaySummary.stats?.changedActions ?? 0,
    'change-bp.widening-groups': groupsBp.length,
    'change-bp.unexpected-groups': unexpected.length,
    'change-bp.resultHash': shortHash(reviewBp.replaySummary.resultHash ?? ''),
  });
  steps.push({
    step: "10 change review B'",
    via: 'policy version, change review',
    result: `draft version 2 with B' (\`${shortHash(savedBp.contentHash)}\`), kind \`change\`, baseline version 1; changed ${fmt(reviewBp.replaySummary.stats?.changedActions ?? 0)}, Widening group ${fmt(groupsBp.length)}; resultHash \`${shortHash(input.localBp.resultHash)}\` equals the local Gate 2 run`,
  });

  await judgeAll(
    api,
    reviewBp.id,
    groupsBp.map((group) => group.groupKey),
    (key) => (keysB.has(key) ? 'expected' : 'unexpected'),
  );
  const locked = await api.call(routes.getChangeReview, { params: { id: reviewBp.id } });
  check(
    !locked.gate.isOpen &&
      locked.gate.blockers.some((blocker) => blocker.code === 'widening_unexpected'),
    'an unexpected group locks the gate',
  );
  const refused = await api.send(routes.decideChangeReview, {
    params: { id: reviewBp.id },
    body: { decision: 'accept', note: '', reviewerName: REVIEWER },
  });
  check(refused.status >= 400, 'accept is refused while the gate is closed');
  const rejected = await api.call(routes.decideChangeReview, {
    params: { id: reviewBp.id },
    body: {
      decision: 'reject',
      note: 'repository outside both remote lists becomes trusted',
      reviewerName: REVIEWER,
    },
  });
  check(rejected.status === 'rejected', "the B' review is rejected");
  const v3 = await api.call(routes.createPolicyVersion, {
    params: { policyId: created.policy.id },
    body: { baseVersionId: v2.id },
  });
  const savedB = await draftWith(api, v3, input.policyB);
  check(savedB.isValid, 'policy B does not validate');
  const reviewB = await waitForReview(
    api,
    (await api.call(routes.createChangeReview, { body: { candidateVersionId: v3.id, ...window } }))
      .id,
  );
  check(
    reviewB.replaySummary.resultHash === input.localB.resultHash,
    'server B resultHash differs from the local Gate 2 run',
  );
  const groupsB = (await api.all(routes.listReviewDiffGroups, { id: reviewB.id })).filter(
    (group) => group.direction === 'widening',
  );
  await judgeAll(
    api,
    reviewB.id,
    groupsB.map((group) => group.groupKey),
    () => 'expected',
  );
  const acceptedB = await api.call(routes.decideChangeReview, {
    params: { id: reviewB.id },
    body: { decision: 'accept', note: '', reviewerName: REVIEWER },
  });
  check(acceptedB.status === 'accepted', 'the B review is accepted');
  record({
    'change-b.contentHash': shortHash(savedB.contentHash),
    'change-b.changed': reviewB.replaySummary.stats?.changedActions ?? 0,
    'change-b.widening-groups': groupsB.length,
    'change-b.resultHash': shortHash(reviewB.replaySummary.resultHash ?? ''),
  });
  steps.push({
    step: '11 unexpected, reject, B, accept',
    via: 'verdicts, decisions',
    result: `${fmt(groupsBp.length - unexpected.length)} groups \`expected\`, ${fmt(unexpected.length)} \`unexpected\` → \`widening_unexpected\` blocks and accept is refused; rejected; draft version 3 with B (\`${shortHash(savedB.contentHash)}\`): changed ${fmt(reviewB.replaySummary.stats?.changedActions ?? 0)}, Widening group ${fmt(groupsB.length)}, resultHash \`${shortHash(input.localB.resultHash)}\` equals the local Gate 2 run; all \`expected\` → accepted`,
  });

  const audit = AuditSchema.parse(JSON.parse(cli(['verify-audit'])));
  check(
    audit.isIntact && audit.checkedCount === 3,
    'the decision chain is intact with three records',
  );
  record({ 'audit.checked': audit.checkedCount });
  steps.push({
    step: '12 audit',
    via: '`authority verify-audit`',
    result: `intact, ${fmt(audit.checkedCount)} decision records`,
  });

  return {
    imported,
    spool: summarizeSpool(input.spoolDir),
    adoptionResultHash,
    adoptionGroups,
    conformanceRun,
    conformance,
    steps,
    figures,
  };
}

/**
 * Runs the first-policy and change-review journey against the API of a running
 * server whose volume holds no data yet.
 */
export function runJourneyAt(serverUrl: string, input: JourneyInput): Promise<JourneyResult> {
  return journey(new Api(serverUrl), input, join(input.runDir, 'scratch-home'));
}

/**
 * Runs the first-policy and change-review journey against the API of a compose
 * project of its own, with an empty volume and a server built from the working
 * tree, and removes the project and its volume afterwards.
 */
export async function runJourney(input: JourneyInput): Promise<JourneyResult> {
  const project = `authority-remeasure-${Date.now()}`;
  const composePath = join(input.runDir, 'compose.yml');
  writeFileSync(composePath, composeFile(project, input.repoRoot));
  const compose = (...args: string[]): string =>
    run('docker', ['compose', '-f', composePath, ...args], { cwd: input.runDir });
  try {
    compose('up', '-d', '--build', '--wait');
    const address = compose('port', 'server', '8787').trim();
    return await runJourneyAt(`http://${address}`, input);
  } finally {
    compose('down', '-v');
  }
}
