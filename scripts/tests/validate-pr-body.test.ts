import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { validatePullRequest } from '../validate-pr-body.ts';

const templateBody = readFileSync(
  join(import.meta.dirname, '../../.github/PULL_REQUEST_TEMPLATE.md'),
  'utf8',
);

const validBody = `## Summary

Add pull request template conformance validation for contributor PR bodies.

## Changes

- Add \`.github/PULL_REQUEST_TEMPLATE.md\` with Summary, Changes, Testing, and Checklist sections.
- Add \`scripts/validate-pr-body.ts\` and vitest coverage.

## Testing

- \`pnpm test\` — validate-pr-body fixtures pass and fail as expected.
- \`pnpm check\` — exit 0.

## Checklist

- [x] \`pnpm check\` and \`pnpm lint:boundaries:prove\` pass locally
- [x] Glossary, ADR, or ACR updated, or no update needed
- [x] No internal ticket labels, orchestration context, or author tooling labels in title or body
`;

describe('validatePullRequest', () => {
  it('rejects the untouched template with all four required section names', () => {
    const result = validatePullRequest({
      title: 'chore: add pull request template',
      body: templateBody,
    });
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    for (const section of ['Summary', 'Changes', 'Testing', 'Checklist']) {
      expect(result.failures.some((failure) => failure.includes(section))).toBe(true);
    }
  });

  it('accepts filled required sections with every checklist item checked', () => {
    const result = validatePullRequest({
      title: 'chore: add pull request template',
      body: validBody,
    });
    expect(result.ok).toBe(true);
  });

  it('rejects Testing section that contains only an HTML comment', () => {
    const body = validBody.replace(
      '- `pnpm test` — validate-pr-body fixtures pass and fail as expected.\n- `pnpm check` — exit 0.',
      '<!-- ran tests -->',
    );
    const result = validatePullRequest({ title: 'chore: example', body });
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.failures.some((failure) => failure.includes('Testing'))).toBe(true);
  });

  it('rejects a missing Changes heading', () => {
    const body = validBody.replace('## Changes', '## Notes');
    const result = validatePullRequest({ title: 'chore: example', body });
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.failures.some((failure) => failure.includes('Changes'))).toBe(true);
  });

  it('rejects a checklist with one unchecked item (rule 3)', () => {
    const body = validBody.replace(
      '- [x] `pnpm check` and `pnpm lint:boundaries:prove` pass locally',
      '- [ ] `pnpm check` and `pnpm lint:boundaries:prove` pass locally',
    );
    const result = validatePullRequest({ title: 'chore: example', body });
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.failures.some((failure) => failure.includes('rule 3'))).toBe(true);
  });

  it('rejects forbidden ticket labels in the title (rule 4)', () => {
    const result = validatePullRequest({ title: 'M01 scaffold', body: validBody });
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.failures.some((failure) => failure.includes('rule 4'))).toBe(true);
  });

  it('allows Claude Code product wording in the body', () => {
    const body = `${validBody}\n\nUses Claude Code transcript parsing in a later change.`;
    const result = validatePullRequest({ title: 'feat: trace import', body });
    expect(result.ok).toBe(true);
  });

  it('allows an empty optional Reviewer notes section', () => {
    const body = `${validBody}\n\n## Reviewer notes\n\n<!-- none -->`;
    const result = validatePullRequest({ title: 'chore: example', body });
    expect(result.ok).toBe(true);
  });
});
