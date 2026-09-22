import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: 'packages/*/lib/infra/tables.ts',
  out: 'drizzle',
  dbCredentials: { url: process.env.AUTHORITY_DB_URL ?? '' },
});
