import type { RedactText } from '../../schema.ts';

interface RedactionRule {
  readonly kind: string;
  readonly pattern: RegExp;
  readonly replacement: string;
}

// Order is significant. More specific or self-contained secrets run before
// broader ones, so an overlapping prefix (sk-ant- before sk-) or an embedded
// token (a JWT inside a Bearer header, a userinfo inside an assignment value)
// is attributed to the narrower kind. Every replacement token is made of
// uppercase, digits and underscores only, and no rule matches its own output:
// prefix rules cannot match an uppercase token, and the three value-capturing
// rules carry a `(?!__REDACTED_)` guard. redactText is therefore idempotent in
// both text and counts.
const RULES: readonly RedactionRule[] = [
  {
    kind: 'private_key_block',
    pattern: /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g,
    replacement: '__REDACTED_PRIVATE_KEY_BLOCK__',
  },
  {
    kind: 'jwt',
    pattern: /\beyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
    replacement: '__REDACTED_JWT__',
  },
  {
    kind: 'github_token',
    pattern: /\b(?:gh[opusr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g,
    replacement: '__REDACTED_GITHUB_TOKEN__',
  },
  {
    kind: 'anthropic_key',
    pattern: /\bsk-ant-[A-Za-z0-9_-]{16,}/g,
    replacement: '__REDACTED_ANTHROPIC_KEY__',
  },
  {
    kind: 'openai_key',
    pattern: /\bsk-(?:proj-)?[A-Za-z0-9]{20,}/g,
    replacement: '__REDACTED_OPENAI_KEY__',
  },
  {
    kind: 'aws_access_key',
    pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g,
    replacement: '__REDACTED_AWS_ACCESS_KEY__',
  },
  {
    kind: 'slack_token',
    pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}/g,
    replacement: '__REDACTED_SLACK_TOKEN__',
  },
  {
    kind: 'gitlab_token',
    pattern: /\bglpat-[A-Za-z0-9_-]{20,}/g,
    replacement: '__REDACTED_GITLAB_TOKEN__',
  },
  {
    kind: 'npm_token',
    pattern: /\bnpm_[A-Za-z0-9]{30,}/g,
    replacement: '__REDACTED_NPM_TOKEN__',
  },
  {
    kind: 'bearer_header',
    pattern: /([Bb]earer)\s+(?!__REDACTED_)[A-Za-z0-9._~+/=-]{8,}/g,
    replacement: '$1 __REDACTED_BEARER_HEADER__',
  },
  {
    kind: 'url_userinfo',
    pattern: /([A-Za-z][A-Za-z0-9+.-]{0,63}:\/\/)(?!__REDACTED_)[^\s/@:]+(?::[^\s/@]*)?@/g,
    replacement: '$1__REDACTED_URL_USERINFO__@',
  },
  {
    kind: 'secret_assignment',
    pattern:
      /\b(?=[A-Za-z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD))([A-Za-z0-9_]+)(["']?\s*[:=]\s*)(?!["']?__REDACTED_)(?:"[^"]*"|'[^']*'|[^\s"']+)/gi,
    replacement: '$1$2__REDACTED_SECRET_ASSIGNMENT__',
  },
];

function countMatches(text: string, pattern: RegExp): number {
  const matches = text.match(pattern);
  return matches === null ? 0 : matches.length;
}

/**
 * Replaces only literal secret text; it never removes a line or Action and is
 * idempotent.
 */
export const redactText: RedactText = (text) => {
  let current = text;
  const counts = new Map<string, number>();
  for (const rule of RULES) {
    const count = countMatches(current, rule.pattern);
    if (count === 0) {
      continue;
    }
    current = current.replace(rule.pattern, rule.replacement);
    counts.set(rule.kind, (counts.get(rule.kind) ?? 0) + count);
  }
  const redactions = [...counts.entries()]
    .map(([kind, count]) => ({ kind, count }))
    .sort((a, b) => (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0));
  return { text: current, redactions };
};
