import { fileURLToPath } from 'node:url';
import { en } from '../apps/web/src/shared/i18n/en.ts';
import { ko } from '../apps/web/src/shared/i18n/ko.ts';

type Entry = 'text' | 'template';

function entries(value: unknown, path: string, into: Map<string, Entry | 'invalid'>): void {
  if (typeof value === 'string') {
    into.set(path, value.length > 0 ? 'text' : 'invalid');
  } else if (typeof value === 'function') {
    into.set(path, 'template');
  } else if (typeof value === 'object' && value !== null) {
    for (const [key, child] of Object.entries(value)) {
      entries(child, path === '' ? key : `${path}.${key}`, into);
    }
  } else {
    into.set(path, 'invalid');
  }
}

/**
 * Every message key that one language's catalog lacks, holds as a different
 * kind (text versus template), or leaves empty, compared across all catalogs.
 */
export function catalogKeyFailures(catalogs: Readonly<Record<string, unknown>>): string[] {
  const byLanguage = Object.entries(catalogs).map(([language, catalog]) => {
    const found = new Map<string, Entry | 'invalid'>();
    entries(catalog, '', found);
    return { language, found };
  });
  const kinds = new Map<string, Set<Entry>>();
  for (const { found } of byLanguage) {
    for (const [path, kind] of found) {
      const seen = kinds.get(path) ?? new Set();
      kinds.set(path, kind === 'invalid' ? seen : seen.add(kind));
    }
  }
  return [...kinds.keys()].sort().flatMap((path) =>
    byLanguage.flatMap(({ language, found }) => {
      const kind = found.get(path);
      if (kind === undefined) {
        return [`${language}: missing ${path}`];
      }
      if (kind === 'invalid') {
        return [`${language}: ${path} is empty or not a message`];
      }
      if ((kinds.get(path)?.size ?? 0) > 1) {
        return [`${language}: ${path} is a ${kind}, not the same kind in every language`];
      }
      return [];
    }),
  );
}

function main(): void {
  const failures = catalogKeyFailures({ en, ko });
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
