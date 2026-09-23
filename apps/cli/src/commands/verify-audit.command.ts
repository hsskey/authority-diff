import { authToken, serverBaseUrl } from '../config.ts';
import { writeStderr, writeStdout } from '../output.ts';

/**
 * Asks the server to recompute the review decision hash chain, prints the
 * verification, and exits non-zero unless the chain is intact.
 */
export async function runVerifyAudit(): Promise<void> {
  const token = authToken();
  if (token === null) {
    writeStderr('AUTHORITY_CLI_TOKEN is not set');
    process.exitCode = 1;
    return;
  }

  const response = await fetch(`${serverBaseUrl()}/api/v1/audit/verification`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    writeStderr(`verify-audit failed: HTTP ${response.status}`);
    process.exitCode = 1;
    return;
  }
  const body: unknown = await response.json();
  writeStdout(JSON.stringify(body, null, 2));
  const isIntact = typeof body === 'object' && body !== null && 'isIntact' in body && body.isIntact;
  if (isIntact !== true) {
    process.exitCode = 1;
  }
}
