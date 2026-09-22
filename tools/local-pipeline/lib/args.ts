export interface ParsedArgs {
  readonly positionals: readonly string[];
  readonly flags: ReadonlyMap<string, string>;
}

/**
 * Minimal `--flag value` and `--flag=value` parser. A bare `--flag` with no
 * following value or `=` is treated as an empty-string value.
 */
export function parseArgs(argv: readonly string[]): ParsedArgs {
  const positionals: string[] = [];
  const flags = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === undefined || !arg.startsWith('--')) {
      if (arg !== undefined) {
        positionals.push(arg);
      }
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
  return { positionals, flags };
}
