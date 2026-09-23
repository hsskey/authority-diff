import { readFileSync, statSync } from 'node:fs';
import { runImport } from '../apps/cli/src/commands/import.command.ts';
import {
  createDatabase,
  createSystemClock,
  createUlidGenerator,
  loadConfig,
} from '../packages/platform/index.ts';
import { createPolicyRepository } from '../packages/policy/index.ts';
import { validatePolicyDocument } from '../packages/policy/evaluate.ts';
import { PolicyDocumentSchema } from '../packages/policy/schema.ts';
import { recordSeedOnlyAcceptance } from '../packages/review/index.ts';
import { ChangeReviewIdSchema } from '../packages/review/schema.ts';

const USAGE = 'usage: pnpm seed:demo --snapshot <dir> --policy <file>';
const ORG_DEFAULT_POLICY_NAME = 'org-default';
const DEFAULT_SERVER_URL = 'http://localhost:8787';

function fail(message: string): never {
  console.error(message);
  process.exit(2);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function parseArgs(argv: readonly string[]): { snapshot: string; policy: string } {
  const flags = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === undefined || !arg.startsWith('--')) {
      continue;
    }
    const body = arg.slice(2);
    const eq = body.indexOf('=');
    if (eq !== -1) {
      flags.set(body.slice(0, eq), body.slice(eq + 1));
      continue;
    }
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--')) {
      flags.set(body, next);
      i++;
    } else {
      flags.set(body, '');
    }
  }
  const snapshot = flags.get('snapshot');
  const policy = flags.get('policy');
  if (
    snapshot === undefined ||
    snapshot.length === 0 ||
    policy === undefined ||
    policy.length === 0
  ) {
    fail(USAGE);
  }
  return { snapshot, policy };
}

function requireDirectory(path: string, label: string): void {
  try {
    if (!statSync(path).isDirectory()) {
      fail(`${label} is not a directory: ${path}`);
    }
  } catch {
    fail(`cannot read ${label}: ${path}`);
  }
}

function loadPolicyDocument(path: string) {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    fail(`cannot read policy document ${path}: ${errorMessage(error)}`);
  }
  const parsed = PolicyDocumentSchema.safeParse(raw);
  if (!parsed.success) {
    fail(`policy document ${path} is structurally invalid:\n${parsed.error.message}`);
  }
  const issues = validatePolicyDocument(parsed.data);
  if (issues.length > 0) {
    for (const issue of issues) {
      console.error(`policy: [${issue.code}] ${issue.ruleId ?? '-'} ${issue.message}`);
    }
    process.exit(1);
  }
  return parsed.data;
}

async function main(): Promise<void> {
  const { snapshot, policy } = parseArgs(process.argv.slice(2));
  requireDirectory(snapshot, 'snapshot directory');

  const config = loadConfig();
  const token = config.auth.token.reveal();
  process.env.AUTHORITY_CLI_TOKEN = token;
  process.env.AUTHORITY_CLI_SERVER_URL ??= DEFAULT_SERVER_URL;

  const importSummary = await runImport(snapshot);
  if (importSummary.failedSessionIds.length > 0) {
    console.error(JSON.stringify({ failedSessionIds: importSummary.failedSessionIds }, null, 2));
  }

  const document = loadPolicyDocument(policy);
  const clock = createSystemClock();
  const idGenerator = createUlidGenerator();
  const database = createDatabase(config);
  const repository = createPolicyRepository({ db: database.db, clock, idGenerator });

  const seeded = await repository.seedAcceptedPolicy({ name: ORG_DEFAULT_POLICY_NAME, document });
  if (!seeded.ok) {
    console.error(seeded.error.message);
    await database.close();
    process.exit(1);
  }

  if (seeded.value.created) {
    await recordSeedOnlyAcceptance(database, {
      changeReviewId: ChangeReviewIdSchema.parse(idGenerator.next('rev')),
      contentHash: seeded.value.version.contentHash,
      decidedAt: clock.now(),
    });
  }

  console.log(
    JSON.stringify(
      {
        policyId: seeded.value.policy.id,
        versionId: seeded.value.version.id,
        import: {
          sessions: importSummary.sessions,
          acceptedCount: importSummary.acceptedCount,
          duplicateCount: importSummary.duplicateCount,
          rejectedCount: importSummary.rejectedCount,
          failedSessions: importSummary.failedSessions,
          failedSessionIds: importSummary.failedSessionIds,
        },
      },
      null,
      2,
    ),
  );
  await database.close();
}

await main();
