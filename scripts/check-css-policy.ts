import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ALLOWED_CSS_FILE = 'styles/app.css';
export const ALLOWED_CSS_IMPORTER = 'main.tsx';

const TAILWIND_IMPORT = 'tailwindcss';

export type CssPolicyInput = {
  readonly cssFiles: readonly string[];
  readonly appCss?: string;
  readonly sourceFiles: readonly { readonly path: string; readonly source: string }[];
};

export type CssPolicyResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly failures: readonly string[] };

const CSS_IMPORT = /(?:^|\n)\s*import\s+(?:[^'"\n]+from\s+)?['"]([^'"]+\.css)['"]/g;
const DYNAMIC_CSS_IMPORT = /(?:^|\n)\s*import\s*\(\s*['"]([^'"]+\.css)['"]/g;

function posixPath(path: string): string {
  return path.replaceAll('\\', '/');
}

function stripCssComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '');
}

function skipWhitespace(source: string, index: number): number {
  let i = index;
  while (i < source.length && /\s/.test(source[i] ?? '')) {
    i += 1;
  }
  return i;
}

function readQuoted(
  source: string,
  index: number,
): { readonly value: string; readonly end: number } | null {
  const quote = source[index];
  if (quote !== '"' && quote !== "'") {
    return null;
  }
  let i = index + 1;
  while (i < source.length) {
    const ch = source[i];
    if (ch === '\\') {
      i += 2;
      continue;
    }
    if (ch === quote) {
      return { value: source.slice(index + 1, i), end: i + 1 };
    }
    i += 1;
  }
  return null;
}

function skipString(source: string, index: number): number {
  const quoted = readQuoted(source, index);
  return quoted?.end ?? index + 1;
}

function readBalancedBlock(source: string, openIndex: number): number | null {
  if (source[openIndex] !== '{') {
    return null;
  }
  let depth = 0;
  let i = openIndex;
  while (i < source.length) {
    const ch = source[i];
    if (ch === '"' || ch === "'") {
      i = skipString(source, i);
      continue;
    }
    if (ch === '{') {
      depth += 1;
    } else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        return i + 1;
      }
    }
    i += 1;
  }
  return null;
}

function normalizeImportHref(href: string): string {
  return href.replace(/\.css$/u, '');
}

function parseImportStatement(
  statement: string,
): { readonly href: string; readonly conditions: string } | null {
  const trimmed = statement.trim().replace(/;$/u, '').trim();
  if (!trimmed.startsWith('@import')) {
    return null;
  }
  let rest = trimmed.slice('@import'.length).trim();
  if (rest.startsWith('url(')) {
    rest = rest.slice('url('.length).trim();
    const quoted = rest[0] === '"' || rest[0] === "'" ? rest : null;
    if (quoted === null) {
      return null;
    }
  }
  const quote = rest[0];
  if (quote !== '"' && quote !== "'") {
    return null;
  }
  const end = rest.indexOf(quote, 1);
  if (end < 0) {
    return null;
  }
  const href = rest.slice(1, end);
  const conditions = rest
    .slice(end + 1)
    .replace(/^\)/u, '')
    .trim();
  return { href, conditions };
}

function checkAppCss(source: string, failures: string[]): void {
  if (/(?:^|[^a-zA-Z-])@apply(?:$|[^a-zA-Z-])/u.test(source)) {
    failures.push('styles/app.css must not contain @apply');
  }

  const stripped = stripCssComments(source);
  let i = 0;
  while (i < stripped.length) {
    i = skipWhitespace(stripped, i);
    if (i >= stripped.length) {
      break;
    }
    if (stripped.startsWith('@import', i)) {
      const end = stripped.indexOf(';', i);
      if (end < 0) {
        failures.push('styles/app.css has an unterminated @import');
        return;
      }
      const statement = stripped.slice(i, end + 1);
      const parsed = parseImportStatement(statement);
      if (parsed === null) {
        failures.push(`styles/app.css has an invalid @import: ${statement.trim()}`);
        i = end + 1;
        continue;
      }
      if (normalizeImportHref(parsed.href) !== TAILWIND_IMPORT || parsed.conditions !== '') {
        failures.push(
          `styles/app.css @import must be "${TAILWIND_IMPORT}" with no layer or condition, so Preflight stays on; got ${statement.trim()}`,
        );
      }
      i = end + 1;
      continue;
    }
    if (stripped.startsWith('@theme', i)) {
      const afterAt = skipWhitespace(stripped, i + '@theme'.length);
      if (stripped[afterAt] !== '{') {
        failures.push('styles/app.css @theme must be a block');
        return;
      }
      const end = readBalancedBlock(stripped, afterAt);
      if (end === null) {
        failures.push('styles/app.css has an unterminated @theme block');
        return;
      }
      i = end;
      continue;
    }
    if (stripped.startsWith('@layer', i)) {
      const afterAt = skipWhitespace(stripped, i + '@layer'.length);
      const nameMatch = /^([A-Za-z][\w-]*)/u.exec(stripped.slice(afterAt));
      const name = nameMatch?.[1];
      const afterName = skipWhitespace(stripped, afterAt + (name?.length ?? 0));
      if (name !== 'base' || stripped[afterName] !== '{') {
        failures.push(
          `styles/app.css may contain only @layer base at the top level; got @layer ${name ?? 'unknown'}`,
        );
        if (stripped[afterName] === '{') {
          i = readBalancedBlock(stripped, afterName) ?? stripped.length;
        } else {
          const nextSemi = stripped.indexOf(';', afterAt);
          i = nextSemi >= 0 ? nextSemi + 1 : stripped.length;
        }
        continue;
      }
      const end = readBalancedBlock(stripped, afterName);
      if (end === null) {
        failures.push('styles/app.css has an unterminated @layer base block');
        return;
      }
      i = end;
      continue;
    }
    const remainder = stripped.slice(i).trimStart();
    const preview = remainder.slice(0, 40).replaceAll('\n', ' ');
    failures.push(
      `styles/app.css may contain only @import, @theme, and @layer base; found other selector: ${preview}`,
    );
    return;
  }
}

function checkCssImports(sourceFiles: CssPolicyInput['sourceFiles'], failures: string[]): void {
  for (const file of sourceFiles) {
    const path = posixPath(file.path);
    const matches = [
      ...file.source.matchAll(CSS_IMPORT),
      ...file.source.matchAll(DYNAMIC_CSS_IMPORT),
    ];
    if (matches.length === 0) {
      continue;
    }
    if (path !== ALLOWED_CSS_IMPORTER) {
      failures.push(
        `.css may be imported only from ${ALLOWED_CSS_IMPORTER}; found import in ${path}`,
      );
    }
  }
}

export function checkCssPolicy(input: CssPolicyInput): CssPolicyResult {
  const failures: string[] = [];
  const cssFiles = input.cssFiles.map(posixPath);

  if (!cssFiles.includes(ALLOWED_CSS_FILE)) {
    failures.push(`apps/web/src/**/*.css may only be ${ALLOWED_CSS_FILE}`);
  }
  for (const file of cssFiles) {
    if (file !== ALLOWED_CSS_FILE) {
      failures.push(`apps/web/src/**/*.css may only be ${ALLOWED_CSS_FILE}; found ${file}`);
    }
  }

  if (cssFiles.includes(ALLOWED_CSS_FILE)) {
    if (input.appCss === undefined) {
      failures.push(`${ALLOWED_CSS_FILE} could not be read`);
    } else {
      checkAppCss(input.appCss, failures);
    }
  }

  checkCssImports(input.sourceFiles, failures);

  if (failures.length === 0) {
    return { ok: true };
  }
  return { ok: false, failures };
}

function collectFiles(dir: string, suffix: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true, recursive: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }
    const parent = 'parentPath' in entry ? String(entry.parentPath) : dir;
    const abs = join(parent, entry.name);
    if (!abs.endsWith(suffix)) {
      continue;
    }
    files.push(posixPath(relative(dir, abs)));
  }
  return files.sort();
}

function main(): void {
  const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
  const webSrc = join(root, 'apps/web/src');
  const cssFiles = collectFiles(webSrc, '.css');
  const sourcePaths = [
    ...collectFiles(webSrc, '.ts'),
    ...collectFiles(webSrc, '.tsx'),
    ...collectFiles(webSrc, '.js'),
    ...collectFiles(webSrc, '.jsx'),
  ];
  const sourceFiles = sourcePaths.map((path) => ({
    path,
    source: readFileSync(join(webSrc, path), 'utf8'),
  }));
  const result = checkCssPolicy({
    cssFiles,
    sourceFiles,
    ...(cssFiles.includes(ALLOWED_CSS_FILE)
      ? { appCss: readFileSync(join(webSrc, ALLOWED_CSS_FILE), 'utf8') }
      : {}),
  });
  if (result.ok) {
    return;
  }
  for (const failure of result.failures) {
    process.stderr.write(`${failure}\n`);
  }
  process.exit(1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
