// process.env access is centralized in this lint-exempt *.config.ts helper
// (see the **/*.config.ts override in .oxlintrc.json) so test files stay free
// of node/no-process-env, matching how harness.ts sources PATH via run-env.config.ts.

export function snapshotEnv(): NodeJS.ProcessEnv {
  return { ...process.env };
}

export function restoreEnv(snapshot: NodeJS.ProcessEnv): void {
  process.env = { ...snapshot };
}

export function setEnv(vars: Record<string, string>): void {
  for (const [key, value] of Object.entries(vars)) {
    process.env[key] = value;
  }
}
