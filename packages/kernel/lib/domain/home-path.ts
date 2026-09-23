/**
 * Rewrites a home-directory prefix (`/Users/<name>`, `/home/<name>`, `/root`)
 * to `~`. The trace parser records every workspace root in this form, and the
 * classifier applies the same rewrite to absolute paths before comparing them
 * with a recorded root.
 */
export function homeToTilde(path: string): string {
  return path.replace(/^\/(?:Users|home)\/[^/]+/, '~').replace(/^\/root(?=\/|$)/, '~');
}
