/**
 * A normalized simple command handed to the per-program classifiers.
 *
 * `bash.ts` strips transparent wrappers (sudo, env, timeout, xargs, ...) and
 * tracks the working directory, then passes this shape to `programs.ts`,
 * `git.ts`, and `gh.ts`. Kept in its own module so those classifiers and
 * `bash.ts` do not import each other cyclically.
 */
import type { ShellWord } from '../shell/ast.ts';

export interface NormalizedCommand {
  /** Program basename after wrapper stripping (for example `rm`, `git`). */
  readonly program: string;
  /** Arguments after the program, with any wrapper prefix removed. */
  readonly args: readonly ShellWord[];
  /** Command source text for the Operation fragment. */
  readonly raw: string;
  /** Working directory for this command, tracked across `cd`. */
  readonly cwd: string | null;
  /** Workspace root from the ToolCall, used for `isInsideWorkspace`. */
  readonly workspaceRoot: string | null;
  /** Raw remote name-to-URL map from the ToolCall, for VCS remote resolution. */
  readonly repoRemotes: Readonly<Record<string, string>> | null;
  /** Current git branch from the ToolCall. */
  readonly gitBranch: string | null;
  /** Heredoc bodies attached to this command, treated as inline code for interpreters. */
  readonly heredocBodies: readonly string[];
}

/**
 * Non-flag argument words. A lone `-` counts as a value, not a flag; a word
 * whose text is empty because it is purely an expansion (for example `"$DIR"`)
 * is kept so the target can be marked unknown.
 */
export function nonFlagArgs(args: readonly ShellWord[]): ShellWord[] {
  return args.filter(
    (a) => (a.hasExpansion || a.text.length > 0) && !(a.text.startsWith('-') && a.text.length > 1),
  );
}

/** True when any argument equals one of the given flags. */
export function hasFlag(args: readonly ShellWord[], ...flags: readonly string[]): boolean {
  const set = new Set(flags);
  return args.some((a) => set.has(a.text));
}
