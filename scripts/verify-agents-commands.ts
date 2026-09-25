import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export type CommandRun = { readonly command: string; readonly exitCode: number };

const FENCE_RE = /^```(\S*)\s*$/;

export function extractCommands(markdown: string): readonly string[] {
  const commands: string[] = [];
  let inShell = false;
  let inFence = false;
  for (const line of markdown.split('\n')) {
    const fence = FENCE_RE.exec(line);
    if (fence !== null) {
      inShell = !inFence && fence[1] === 'sh';
      inFence = !inFence;
      continue;
    }
    if (inShell && line.trim() !== '') {
      commands.push(line.trim());
    }
  }
  return commands;
}

function runCommand(command: string, cwd: string): CommandRun {
  console.log(`\n$ ${command}`);
  const result = spawnSync(command, { cwd, shell: true, stdio: 'inherit' });
  return { command, exitCode: result.status ?? 1 };
}

function main(): void {
  const root = join(fileURLToPath(import.meta.url), '../..');
  const commands = extractCommands(readFileSync(join(root, 'AGENTS.md'), 'utf8'));
  const runs = commands.map((command) => runCommand(command, root));
  console.log('\nexit  command');
  for (const run of runs) {
    console.log(`${String(run.exitCode).padEnd(4)}  ${run.command}`);
  }
  if (commands.length === 0 || runs.some((run) => run.exitCode !== 0)) {
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
