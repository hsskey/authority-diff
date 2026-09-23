# Authority Diff

Authority Diff is a review tool for Agent permission Policy changes.
It classifies past Agent Actions, evaluates them under two Policy Versions, and shows which Effects would change.
It does not deploy or enforce a Policy, and it does not claim that a runtime will follow the evaluated Effects.

V1 proves one question: if this Policy change is applied, which recent recorded Actions receive a different Effect.

## Result of the recorded journey

The core scene is a fetch to another owner's repository after `trustedRemotes` is widened with a host-wide GitHub pattern.

That scene is **6 Actions** (2 `git` fetch, 4 `gh` fetch), not 30.
Zone moves `unknown_remote` → `trusted_remote`. Effect moves ask → allow. Severity is critical.
Named remotes used outside the Action workspace do not resolve a Remote Key, so they stay `unknown_remote` even under that pattern.

Journey grade: **medium**. Real-record Widening groups were available to review, and they stayed inside the predicted scene.

Jev is V2 exploration only (`authority probe`). Replay, Change Review, and conformance do not call it, and a Probe result is not a Gate.

## How to run

Node 22. The intended local path is compose, seed, import, then hooks.

1. `docker compose up` — PostgreSQL and the server. The server listens on `http://localhost:8787`. The compose file sets `AUTHORITY_AUTH_TOKEN` to `local-dev-token`.
2. **Seed** — a seed step is part of this path. The seed command is not in this repository yet; it lands separately. Until then, skip it and import your own transcripts.
3. Import Claude Code transcripts:

   ```sh
   AUTHORITY_CLI_SERVER_URL=http://localhost:8787 \
   AUTHORITY_CLI_TOKEN=local-dev-token \
     pnpm authority import <transcript-directory>
   ```

4. Install observation hooks into Claude Code settings (fail-open, no Effect):

   ```sh
   pnpm authority install-hooks
   ```

   `pnpm authority spool-flush` later sends spool files to the server for conformance.

Do not put real transcripts, command text, paths, or host names into this repository. Keep those under `.local/` and publish aggregates only.

## Limitations

- **Single-person corpus.** Replay and conformance numbers come from one Principal's Claude Code records.
- **Single runtime.** Parse, import, and hooks cover Claude Code. There is no Codex adapter.
- **Agent Verdict.** Widening-group review time was measured by an Agent. A person has not recorded Verdicts on those groups.
- **Hook observation gap.** When the hook is down, no Runtime Observation is written. Those Actions get Disposition `executed_prompt_unknown`.
- **`over_asked` is 0.** PermissionRequest observations often arrive with a null tool use id, so they do not pair onto Actions. `over_asked` stays 0 on this corpus.
- **Publish direction.** Zone does not distinguish publish from fetch. `ask_external_disclosure` matches `push` on `public_remote` and `unknown_remote` only. A package publish to a registry listed in `trustedRemotes` is `push` on `trusted_remote` and is not treated as external disclosure.
- **Worktree host Zone.** `workspace` is the Action's workspace root. Sibling worktree paths resolve as `host`. A Rule that allows read, write, or execute in `workspace` still asks there.
- **Node path.** `install-hooks` prefers a stable Node symlink over a Homebrew Cellar path, because a Cellar path disappears on upgrade. If no symlink resolves to the same binary, the Cellar path remains and hooks break after upgrade.

Classifier details, Zone publish counts, and hook spool behavior are in `docs/evidence/`. Range is `docs/cutline.md`. Target architecture is `docs/design.md`.
