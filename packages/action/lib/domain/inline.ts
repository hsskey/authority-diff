/**
 * Scans opaque inline-code bodies (interpreter `-c`/`-e` strings, heredocs) for
 * credential path literals and URL literals.
 *
 * The classifier cannot analyze another language's semantics, but a credential
 * path or an outbound URL that appears literally in the body is still evidence
 * of a likely `read` or `send`, added with analyzability `partial`.
 */

/** Literals found inside an inline-code body. */
export interface InlineFindings {
  readonly credentialPaths: readonly string[];
  readonly urls: readonly string[];
}

/**
 * Markers that identify a credential file regardless of surrounding directory.
 * Matching is substring-based on a path-like token, so `~/.aws/credentials` and
 * `/home/x/.aws/credentials` both match `.aws/credentials`.
 */
const CREDENTIAL_MARKERS: readonly string[] = [
  '.aws/credentials',
  '.aws/config',
  '.ssh/id_',
  '.ssh/id_rsa',
  '.ssh/id_ed25519',
  'id_rsa',
  'id_ed25519',
  'id_dsa',
  'id_ecdsa',
  '.netrc',
  '.npmrc',
  '.pypirc',
  '.git-credentials',
  '.docker/config.json',
  '.kube/config',
  '.config/gh/hosts.yml',
  'service-account',
  '.htpasswd',
  'secring',
];

/** Path-like tokens: not whitespace, not shell separators or quotes. */
const PATH_TOKEN = /[~/.\w-]*[~/.\w-]/g;
const URL_LITERAL = /\b(?:https?|ftp):\/\/[^\s'"`)<>|]+/gi;

export function scanInline(body: string): InlineFindings {
  return { credentialPaths: findCredentialPaths(body), urls: findUrls(body) };
}

function findCredentialPaths(body: string): string[] {
  const found = new Set<string>();
  const tokens = body.match(PATH_TOKEN) ?? [];
  for (const token of tokens) {
    const lower = token.toLowerCase();
    for (const marker of CREDENTIAL_MARKERS) {
      if (lower.includes(marker) && looksLikePath(token)) {
        found.add(token);
        break;
      }
    }
  }
  return [...found];
}

function looksLikePath(token: string): boolean {
  return token.includes('/') || token.startsWith('.') || token.startsWith('~');
}

function findUrls(body: string): string[] {
  const found = new Set<string>();
  const matches = body.match(URL_LITERAL) ?? [];
  for (const url of matches) found.add(url);
  return [...found];
}
