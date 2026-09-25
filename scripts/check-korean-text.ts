import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export type TrackedFile = { readonly path: string; readonly content: string };

/**
 * Korean text is allowed only in these places:
 * - the files in `KOREAN_FILES`: the Korean README, the web Korean message catalog, and its tests;
 * - the web e2e specs matched by `KOREAN_E2E_SPEC_RE`, which are the specs of the `chromium`
 *   project in `playwright.config.ts`: that project runs in the ko-KR locale and its specs assert
 *   the Korean UI literally, because expected values must be hand-checked literals rather than
 *   labels read back from the catalog. `visual.spec.ts` runs in the en-US `visual` project and
 *   stays English;
 * - a quotation of product output marked with `PRODUCT_OUTPUT_MARKER`: a marker directly before
 *   a double quote covers the quoted text, and any other marker covers the text after it up to
 *   the next Latin letter, digit, or `<`, so each Korean run in unquoted text needs its own marker;
 * - parentheses inside a glossary `_Avoid_:` line of `GLOSSARY_FILE`.
 */
export const KOREAN_FILES: ReadonlySet<string> = new Set([
  'README.ko.md',
  'apps/web/src/shared/i18n/ko.ts',
  'scripts/tests/check-i18n-keys.test.ts',
]);
export const KOREAN_E2E_SPEC_RE = /^apps\/web\/tests\/e2e\/(?!visual\.spec\.ts$)[^/]+\.spec\.ts$/;
export const PRODUCT_OUTPUT_MARKER = '<!-- ko-product-output -->';
export const GLOSSARY_FILE = 'CONTEXT.md';

const KOREAN_RE = /\p{Script=Hangul}/u;
const MARKED_RE = new RegExp(`${PRODUCT_OUTPUT_MARKER}(?:"[^"]*"|[^A-Za-z0-9<]*)`, 'g');
const PARENTHESES_RE = /\([^)]*\)/g;

function allowedRemoved(path: string, line: string): string {
  const unmarked = line.replaceAll(MARKED_RE, '');
  return path === GLOSSARY_FILE && unmarked.startsWith('_Avoid_:')
    ? unmarked.replaceAll(PARENTHESES_RE, '')
    : unmarked;
}

/** Every `path:line` that holds Korean text outside the allowlist. */
export function koreanTextFailures(files: readonly TrackedFile[]): string[] {
  return files
    .filter(({ path }) => !KOREAN_FILES.has(path) && !KOREAN_E2E_SPEC_RE.test(path))
    .flatMap(({ path, content }) =>
      content
        .split('\n')
        .flatMap((line, index) =>
          KOREAN_RE.test(allowedRemoved(path, line))
            ? [`${path}:${index + 1}: Korean text outside the allowlist`]
            : [],
        ),
    );
}

function trackedTextFiles(root: string): TrackedFile[] {
  return execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' })
    .split('\0')
    .filter((path) => path !== '')
    .map((path) => ({ path, content: readFileSync(join(root, path), 'utf8') }))
    .filter(({ content }) => !content.includes('\0'));
}

function main(): void {
  const failures = koreanTextFailures(
    trackedTextFiles(join(fileURLToPath(import.meta.url), '../..')),
  );
  for (const failure of failures) {
    process.stderr.write(`${failure}\n`);
  }
  if (failures.length > 0) {
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
