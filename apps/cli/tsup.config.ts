import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'tsup';

const CLI_ROOT = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  entry: { authority: join(CLI_ROOT, 'src/main.ts') },
  format: ['esm'],
  outDir: join(CLI_ROOT, 'dist'),
  outExtension: () => ({ js: '.mjs' }),
  bundle: true,
  splitting: false,
  platform: 'node',
  target: 'node22',
  noExternal: [/^@authority\//],
  sourcemap: false,
  clean: true,
});
