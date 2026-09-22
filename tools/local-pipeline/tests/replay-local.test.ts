import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { afterAll, describe, expect, it } from 'vitest';
import { EnvironmentProfileSchema, PolicyDocumentSchema } from '@authority/policy/schema';
import { DiffResultSchema } from '@authority/replay/schema';

const GroupSampleSchema = z.array(
  z.object({
    toolName: z.string(),
    baselineDecision: z.object({ effect: z.string() }).nullable(),
    candidateDecision: z.object({ effect: z.string() }).nullable(),
  }),
);

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'));
}

const repoRoot = join(import.meta.dirname, '..', '..', '..');
const tsx = join(repoRoot, 'node_modules', '.bin', 'tsx');
const script = join(repoRoot, 'tools', 'local-pipeline', 'replay-local.ts');
const fixtures = join(import.meta.dirname, 'replay');
const transcripts = join(fixtures, 'transcripts');
const baseline = join(fixtures, 'policy-baseline.json');
const candidate = join(fixtures, 'policy-candidate.json');

const tempDirs: string[] = [];
function outDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'replay-local-'));
  tempDirs.push(dir);
  return dir;
}

interface RunResult {
  readonly status: number;
  readonly stdout: string;
  readonly stderr: string;
}

function field(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null ? Reflect.get(value, key) : undefined;
}

function stringField(value: unknown, key: string): string {
  const found = field(value, key);
  return typeof found === 'string' ? found : '';
}

function numberField(value: unknown, key: string, fallback: number): number {
  const found = field(value, key);
  return typeof found === 'number' ? found : fallback;
}

function run(args: readonly string[]): RunResult {
  try {
    const stdout = execFileSync(tsx, [script, ...args], { cwd: repoRoot, encoding: 'utf8' });
    return { status: 0, stdout, stderr: '' };
  } catch (error) {
    return {
      status: numberField(error, 'status', 1),
      stdout: stringField(error, 'stdout'),
      stderr: stringField(error, 'stderr'),
    };
  }
}

afterAll(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('replay-local', () => {
  it('produces one widening critical group with a stable resultHash across runs', () => {
    const out1 = outDir();
    const out2 = outDir();
    const args = (out: string): string[] => [
      '--transcripts',
      transcripts,
      '--baseline',
      baseline,
      '--candidate',
      candidate,
      '--out',
      out,
    ];

    const first = run(args(out1));
    const second = run(args(out2));
    expect(first.status).toBe(0);
    expect(second.status).toBe(0);

    const diff1 = DiffResultSchema.parse(readJson(join(out1, 'replay.json')));
    const diff2 = DiffResultSchema.parse(readJson(join(out2, 'replay.json')));
    expect(diff1.resultHash).toBe(diff2.resultHash);
    expect(diff1.stats.changedActions).toBe(1);
    expect(diff1.groups).toHaveLength(1);
    const group = diff1.groups[0];
    expect(group?.direction).toBe('widening');
    expect(group?.severity).toBe('critical');

    // stdout last line carries resultHash, changed, widening, critical counts.
    const lastLine = first.stdout.trim().split('\n').at(-1) ?? '';
    expect(lastLine).toBe(`resultHash ${diff1.resultHash} changed 1 widening 1 critical 1`);

    // One group sample file per group, named by full groupKey.
    const groupFiles = readdirSync(join(out1, 'groups'));
    const groupFile = `${group?.groupKey ?? ''}.json`;
    expect(groupFiles).toEqual([groupFile]);
    const sample = GroupSampleSchema.parse(readJson(join(out1, 'groups', groupFile)));
    expect(sample[0]?.baselineDecision?.effect).toBe('deny');
    expect(sample[0]?.candidateDecision?.effect).toBe('allow');
    expect(sample[0]?.toolName).toBe('Read');
  });

  it('replaces both documents environment when --env is given', () => {
    const out = outDir();
    const env = join(fixtures, 'env-profile.json');
    const result = run([
      '--transcripts',
      transcripts,
      '--baseline',
      baseline,
      '--candidate',
      candidate,
      '--env',
      env,
      '--out',
      out,
    ]);
    expect(result.status).toBe(0);

    const profile = EnvironmentProfileSchema.parse(readJson(env));
    const resolvedBaseline = PolicyDocumentSchema.parse(
      readJson(join(out, 'policy-baseline.resolved.json')),
    );
    const resolvedCandidate = PolicyDocumentSchema.parse(
      readJson(join(out, 'policy-candidate.resolved.json')),
    );
    expect(resolvedBaseline.environment).toEqual(profile);
    expect(resolvedCandidate.environment).toEqual(profile);
  });

  it('exits 1 when a policy document fails validation', () => {
    const out = outDir();
    const result = run([
      '--transcripts',
      transcripts,
      '--baseline',
      join(fixtures, 'policy-invalid.json'),
      '--candidate',
      candidate,
      '--out',
      out,
    ]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('duplicate_rule_id');
  });
});
