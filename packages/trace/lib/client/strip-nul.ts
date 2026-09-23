/** Removes U+0000 so values can be stored in Postgres jsonb. */
export function stripNul(text: string): string {
  return text.includes('\0') ? text.replaceAll('\0', '') : text;
}

/** Recursively strips NUL from every string in a parsed transcript value. */
export function stripNulDeep(value: unknown): unknown {
  if (typeof value === 'string') {
    return stripNul(value);
  }
  if (Array.isArray(value)) {
    return value.map(stripNulDeep);
  }
  if (typeof value === 'object' && value !== null) {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      out[key] = stripNulDeep(child);
    }
    return out;
  }
  return value;
}
