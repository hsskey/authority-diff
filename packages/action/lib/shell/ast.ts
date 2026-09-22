/**
 * Minimal shell AST owned by this package.
 *
 * `lib/shell` adapts tree-sitter-bash nodes into these types so that
 * `lib/domain` classifies without importing any third-party parser. The AST
 * keeps only what classification needs: flattened simple commands, their words
 * (with an expansion flag), and their redirections.
 */

/** A single word (command name or argument). */
export interface ShellWord {
  /**
   * Literal text of the word with surrounding quotes removed. Literal portions
   * around an expansion are concatenated; the expansion itself is marked by
   * `hasExpansion` rather than reproduced.
   */
  readonly text: string;
  /**
   * True when the word contains a parameter, command, arithmetic, or other
   * expansion whose value is not statically known (`$VAR`, `${x}`, `$(...)`,
   * backticks, `$((...))`). A Target derived from such a word is `unknown` with
   * analyzability `partial`.
   */
  readonly hasExpansion: boolean;
}

/** A redirection attached to a simple command. */
export interface ShellRedirect {
  /** `write` for `>`, `append` for `>>`, `read` for `<`, `heredoc` for `<<`. */
  readonly kind: 'write' | 'append' | 'read' | 'heredoc';
  /** Redirect target word, or null for a heredoc (whose payload is the body). */
  readonly target: ShellWord | null;
  /** Heredoc body text, present only when `kind` is `heredoc`. */
  readonly heredocBody: string | null;
}

/**
 * One simple command, already flattened out of pipelines, `&&`/`||`/`;` lists,
 * subshells, command substitutions, and process substitutions.
 */
export interface ShellCommand {
  /** Program word (first word), or null when the command has no name. */
  readonly name: ShellWord | null;
  /** Remaining words in order. */
  readonly args: readonly ShellWord[];
  /** Redirections attached to this command. */
  readonly redirects: readonly ShellRedirect[];
  /** The command's source text, for the Operation display fragment. */
  readonly raw: string;
  /**
   * Nesting depth. Top-level commands are depth 0; commands recovered by
   * re-parsing a `bash -c`/`sh -c` string are one deeper.
   */
  readonly depth: number;
}

/** Result of parsing one Bash command string. */
export interface ShellParse {
  /**
   * All simple commands in source order, flattened across pipelines, lists,
   * subshells, command and process substitutions, and `bash -c`/`sh -c` string
   * bodies re-parsed up to a nesting depth of 3.
   */
  readonly commands: readonly ShellCommand[];
  /** True when tree-sitter reported a syntax error anywhere in the input. */
  readonly hasError: boolean;
}
