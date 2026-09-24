import { readFileSync, writeFileSync } from 'node:fs';
import { z } from 'zod';

/**
 * Evidence documents never carry a local program name, repository, path, or
 * private host. The legend that maps those to labels lives under `.local/`
 * because its keys are real names; a name the legend lacks gets the next label
 * of its kind, so an unseen name is masked rather than published.
 */
const LegendSchema = z.object({
  programs: z.record(z.string(), z.string()).default({}),
  targets: z.record(z.string(), z.string()).default({}),
});
type Legend = z.infer<typeof LegendSchema>;

// Standard tool names stay unmasked; extend this set when a public program is masked by mistake.
const PUBLIC_PROGRAMS = new Set(
  [
    'git gh curl wget WebFetch WebSearch ssh scp rsync nc http dig ping',
    'npm pnpm npx yarn pip pip3 corepack brew cargo uv uvx bun bunx go pipx playwright',
    'Read Edit Write MultiEdit NotebookEdit Glob Grep LS cd cat ls grep rg sed tail head mkdir rm cp mv echo printf tee touch find wc diff awk strings chmod ln stat sort uniq cut tr jq xargs realpath basename dirname test readlink file du df tree cmp shasum md5 sha256sum rmdir less od xxd base64 date pwd true false sleep export source set unset env which type command',
    'python3 python node bash sh zsh perl tsx deno ruby osascript',
    'StructuredOutput Monitor Agent Task TodoWrite Skill ToolSearch ScheduleWakeup SendMessage AskUserQuestion ExitPlanMode EnterPlanMode TaskStop TaskOutput KillShell BashOutput ListMcpResourcesTool ReadMcpResourceTool CronCreate Artifact Workflow ArtifactComments ArtifactData EnterWorktree ExitWorktree PushNotification RemoteTrigger DesignSync ReportFindings ListAgents SendFeedback',
    'tmux sqlite3 lsof claude docker make kill pkill open ps timeout tar unzip gzip codex tsc vitest eslint prettier biome psql',
  ].flatMap((line) => line.split(' ')),
);

export interface Masks {
  program(name: string | null): string;
  target(key: string): string;
}

function nextLabel(
  existing: Record<string, string>,
  pattern: (n: number) => string,
  prefix: string,
): string {
  const highest = Object.values(existing)
    .filter((label) => label.startsWith(prefix))
    .map((label) => Number.parseInt(label.slice(prefix.length), 10))
    .reduce((max, n) => (Number.isNaN(n) ? max : Math.max(max, n)), 0);
  return pattern(highest + 1);
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function targetKind(key: string): { prefix: string; label: (n: number) => string } {
  if (!/[./:~]/.test(key)) {
    return { prefix: 'named-remote-', label: (n) => `named-remote-${pad(n)} (unresolved)` };
  }
  if (key.startsWith('/') || key.startsWith('~')) {
    return { prefix: 'local-path-', label: (n) => `local-path-${pad(n)}` };
  }
  if (key.includes('/')) {
    return { prefix: 'repo-', label: (n) => `repo-${pad(n)}` };
  }
  if (key.includes(':')) {
    return { prefix: 'target-', label: (n) => `target-${pad(n)}` };
  }
  return { prefix: 'host-', label: (n) => `host-${pad(n)}` };
}

export function createMasks(legend: Legend): Masks & { readonly legend: Legend } {
  return {
    legend,
    program(name) {
      if (name === null || name === '') {
        return '(none)';
      }
      if (PUBLIC_PROGRAMS.has(name)) {
        return name;
      }
      const known = legend.programs[name];
      if (known !== undefined) {
        return known;
      }
      const isMcp = name.startsWith('mcp__');
      const prefix = isMcp ? '<mcp-tool-' : '<local-tool-';
      const label = nextLabel(legend.programs, (n) => `${prefix}${pad(n)}>`, prefix);
      legend.programs[name] = label;
      return label;
    },
    target(key) {
      if (key === 'unknown' || key === 'workspace') {
        return key;
      }
      if (key === 'origin') {
        return 'origin (unresolved)';
      }
      const known = legend.targets[key];
      if (known !== undefined) {
        return known;
      }
      const kind = targetKind(key);
      const label = nextLabel(legend.targets, kind.label, kind.prefix);
      legend.targets[key] = label;
      return label;
    },
  };
}

export function readLegend(path: string): Legend {
  return LegendSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
}

export function writeLegend(path: string, legend: Legend): void {
  writeFileSync(path, `${JSON.stringify(legend, null, 1)}\n`);
}
