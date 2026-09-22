import { DEFAULT_POLICY_DOCUMENT } from '@authority/policy/evaluate';

// Prints the default Policy template as JSON to stdout so a user can redirect
// it into a file and edit baseline (A), candidate (B), and revised (B') copies.
process.stdout.write(`${JSON.stringify(DEFAULT_POLICY_DOCUMENT, null, 2)}\n`);
