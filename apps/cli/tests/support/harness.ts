import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { testPath } from './run-env.config.ts';

const REPO_ROOT = resolve(import.meta.dirname, '../../../..');
const CLI_ENTRY = join(REPO_ROOT, 'apps/cli/src/main.ts');
const TSX_BIN = join(REPO_ROOT, 'node_modules', '.bin', 'tsx');

export interface HookRunResult {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly durationMs: number;
}

export function makeTempHome(): string {
  return mkdtempSync(join(tmpdir(), 'authority-cli-'));
}

export function runAuthority(
  args: readonly string[],
  options: {
    readonly home: string;
    readonly input?: string;
    readonly env?: Record<string, string>;
  },
): HookRunResult {
  const started = Date.now();
  try {
    const stdout = execFileSync(TSX_BIN, [CLI_ENTRY, ...args], {
      cwd: REPO_ROOT,
      input: options.input ?? '',
      env: {
        PATH: testPath,
        HOME: options.home,
        ...options.env,
      },
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return {
      status: 0,
      stdout,
      stderr: '',
      durationMs: Date.now() - started,
    };
  } catch (error: unknown) {
    const durationMs = Date.now() - started;
    if (
      typeof error === 'object' &&
      error !== null &&
      'status' in error &&
      'stdout' in error &&
      'stderr' in error
    ) {
      const status = typeof error.status === 'number' ? error.status : null;
      const stdout =
        typeof error.stdout === 'string'
          ? error.stdout
          : Buffer.isBuffer(error.stdout)
            ? error.stdout.toString('utf8')
            : '';
      const stderr =
        typeof error.stderr === 'string'
          ? error.stderr
          : Buffer.isBuffer(error.stderr)
            ? error.stderr.toString('utf8')
            : '';
      return { status, stdout, stderr, durationMs };
    }
    throw error;
  }
}

export function readSpoolLines(home: string): string[] {
  const directory = join(home, '.authority', 'spool');
  const today = new Date();
  const year = String(today.getUTCFullYear());
  const month = String(today.getUTCMonth() + 1).padStart(2, '0');
  const day = String(today.getUTCDate()).padStart(2, '0');
  const filePath = join(directory, `${year}-${month}-${day}.jsonl`);
  const raw = readFileSync(filePath, 'utf8');
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}
