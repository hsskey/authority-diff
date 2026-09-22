// Whole-value glob matcher for Environment Profile patterns.
//
// Syntax (packages/policy/schema.ts ResolveZone TSDoc): `**` matches any string
// including `/`; `*` matches any string except `/`; `?` matches one character
// except `/`; every other character is literal; the whole value must match.
//
// Implemented directly by translating a pattern to an anchored RegExp. No glob
// library is used; RegExp is a language builtin, so lib/domain stays pure and a
// compiled pattern can be reused across many values (see createEvaluator).

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
