/**
 * Rewrites a home-directory prefix (`/Users/<name>`, `/home/<name>`, `/root`)
 * to `~`. The trace parser records every workspace root in this form, and the
 * classifier applies the same rewrite to absolute paths before comparing them
 * with a recorded root.
 */
export function homeToTilde(path: string): string {
  return path.replace(/^\/(?:Users|home)\/[^/]+/, '~').replace(/^\/root(?=\/|$)/, '~');
}

const HOME_AT_START = /^\/?(?:Users|home)\/[^/\s"'`),]+/;
const HOME_IN_TEXT = /(?<=[\s"'`(=:,])\/(?:Users|home)\/[^/\s"'`),]+/g;

/**
 * Folds `/Users/<name>` and `/home/<name>` to `~` wherever they appear in text
 * shown to a reader, so a screen or Evidence Report never shows an OS user
 * name. A Target key keeps the first two path segments without the leading
 * slash (`Users/<name>`), so that form is folded at the start of the text too.
 * Display only: stored values, Target keys, and hashes never pass through it.
 */
export function foldHomePaths(text: string): string {
  return text.replace(HOME_AT_START, '~').replace(HOME_IN_TEXT, '~');
}
