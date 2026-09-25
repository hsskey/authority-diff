import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { extractCommands } from '../verify-agents-commands.ts';

const markdown = `# Title

Run \`pnpm prose\` is not a command.

\`\`\`sh
pnpm check

pnpm test:e2e
\`\`\`

\`\`\`ts
const notACommand = 1;
\`\`\`

\`\`\`
pnpm untagged
\`\`\`
`;

describe('extractCommands', () => {
  it('returns the non-empty lines of sh fences only', () => {
    expect(extractCommands(markdown)).toEqual(['pnpm check', 'pnpm test:e2e']);
  });

  it('finds the finishing commands in AGENTS.md', () => {
    const agents = readFileSync(join(fileURLToPath(import.meta.url), '../../../AGENTS.md'), 'utf8');

    expect(extractCommands(agents)).toEqual(
      expect.arrayContaining(['pnpm check', 'pnpm lint:boundaries:prove', 'pnpm test:e2e']),
    );
  });
});
