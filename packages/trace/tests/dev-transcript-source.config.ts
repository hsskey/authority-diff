// Env access is centralized here so the local-only diagnostic test can read the
// transcript directory without spreading process.env through test code. The
// directory is set only on a developer machine; in CI the variable is unset and
// the diagnostic test skips.
export const devTranscriptDir: string | undefined = process.env.AUTHORITY_DEV_TRANSCRIPT_DIR;
