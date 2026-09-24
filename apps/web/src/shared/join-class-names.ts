export function joinClassNames(...parts: ReadonlyArray<unknown>): string {
  return parts.filter((part): part is string => typeof part === 'string' && part !== '').join(' ');
}
