// Translate a whole-value glob to an anchored RegExp so lib/domain stays free of a glob library and a compiled pattern can be reused (see createEvaluator).

const REGEXP_META: ReadonlySet<string> = new Set([
  '.',
  '+',
  '^',
  '$',
  '{',
  '}',
  '(',
  ')',
  '|',
  '[',
  ']',
  '\\',
]);

function escapeLiteral(char: string): string {
  return REGEXP_META.has(char) ? `\\${char}` : char;
}

/** Translates one glob pattern into an anchored, whole-value RegExp. */
export function compileGlob(pattern: string): RegExp {
  let source = '^';
  let i = 0;
  while (i < pattern.length) {
    const char = pattern.charAt(i);
    if (char === '*' && pattern.charAt(i + 1) === '*') {
      source += '.*';
      i += 2;
    } else if (char === '*') {
      source += '[^/]*';
      i += 1;
    } else if (char === '?') {
      source += '[^/]';
      i += 1;
    } else {
      source += escapeLiteral(char);
      i += 1;
    }
  }
  source += '$';
  return new RegExp(source);
}

/** True when any compiled pattern matches the whole value. */
export function matchesAny(patterns: readonly RegExp[], value: string): boolean {
  return patterns.some((pattern) => pattern.test(value));
}
