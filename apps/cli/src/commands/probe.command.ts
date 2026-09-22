import { spawn } from 'node:child_process';
import { execArgv, execPath } from 'node:process';
import { fileURLToPath } from 'node:url';

export async function runProbeCommand(args: readonly string[]): Promise<void> {
  const runner = fileURLToPath(new URL('../../../../packages/probe/cli.ts', import.meta.url));
  const child = spawn(execPath, [...execArgv, runner, ...args], {
    stdio: 'inherit',
  });
  const status = await new Promise<number>((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code) => resolve(code ?? 1));
  });
  if (status !== 0) {
    process.exitCode = status;
  }
}
