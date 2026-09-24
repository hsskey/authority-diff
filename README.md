# Authority Diff

Authority Diff is a review tool for an organization's Agent permission Policy.
It classifies past Agent Actions, applies a Policy Version to them, and shows which Effect (allow, ask, deny) each Action would receive.
It reviews a first Policy before adoption, and a Policy change against the accepted baseline.
It does not deploy or enforce a Policy, and it does not claim that a runtime will follow the evaluated Effects.

V1 proves two questions on recorded Actions: what this first Policy would ask or deny, and which Actions a Policy change would move to a different Effect.

## Journey

import → activity overview → first Policy (draft) → adoption preview → review and adopt → [Authority Diff 밖] managed settings 반영 → change review → conformance

1. **Import.** `authority import` loads Claude Code transcripts, redacts secrets, and classifies each tool call into Operations.
2. **Activity Overview.** With no Policy, `/` shows the imported activity: Sessions, Actions, Capability and Target Kind distribution, analyzability, top programs. No Effect and no Zone yet, because both need a Policy.
3. **First Policy (draft).** "첫 조직 정책 만들기" creates draft version 1 from the default template. Edit the JSON (Rules and Environment Profile), save, validate. There is one Policy per organization.
4. **Adoption preview.** "최초 도입 검토 만들기" applies the draft alone to the recorded Actions. The screen shows how many Actions would be allowed, asked, or denied, and groups the ask and deny Actions into Adoption Groups by Effect, Capability, and Zone. Nothing is compared with a baseline, and no past approval is inferred from the transcripts.
5. **Review and adopt.** Every Adoption Group needs a Verdict (의도한 제한 / 보류 / 정책 수정 필요). Only when all of them are 의도한 제한 does "최초 정책 채택" make version 1 `accepted` and write a Decision Record.
6. **[Authority Diff 밖] managed settings 반영.** `accepted` is a review record. It is not a deployment and not enforcement. Applying the Policy to a runtime (for example through managed settings) happens outside Authority Diff, and Authority Diff does not record whether it happened.
7. **Change review.** A draft made from the accepted version gets a Change Review: the same Actions under both versions, Widening and Narrowing groups, Verdicts, accept or reject, Evidence Report.
8. **Conformance.** Observation hooks report what the runtime actually did. Conformance compares those Runtime Observations with the accepted Policy and reports violation, under_asked, and over_asked findings. This is the only screen that says anything about runtime behavior.

## Result of the recorded journey

<!-- evidence-numbers
classifier: 0.2.5
snapshot.sessions: 1,036
snapshot.actions: 34,940
snapshot.evaluated: 34,490
policy-a.allow: 17,801
policy-a.ask: 16,669
policy-a.deny: 20
adoption.groups: 24
bp-scene.actions: 9
-->
Every number below is from the frozen corpus (1,036 Sessions, 34,940 Actions after dedupe) with classifier 0.2.5 and the corrected environment profile (policy A).
Each figure follows the classifier version stamped on the first line of its evidence document; figures from earlier classifier versions stay only under that document's "Previous version" sections.
Details, masked group tables, and hashes are in `docs/evidence/adoption-preview.md`, `docs/evidence/gate2-replay.md`, and `docs/evidence/conformance.md`.

### Adoption preview (first Policy)

<!-- remeasure:readme-adoption -->
| evaluated Actions | allow | ask | deny | Adoption Groups |
| ---: | ---: | ---: | ---: | --- |
| 34,490 | 17,801 (51.6%) | 16,669 (48.3%) | 20 (0.06%) | 24 (22 ask, 2 deny) |
<!-- /remeasure:readme-adoption -->

allow 51.6% and ask 48.3% sum to 99.9% because of rounding; deny is the remaining share (20 Actions; 0.06% in the table, 0.1% on the one-decimal tile).
The ask share is high because the default template has no Rule that allows read, write, or execute outside the workspace, so those Actions fall to the default ask, and `execute` of unanalyzable programs asks by Rule.
The allow share includes scripts named by a path inside the workspace, which `allow_workspace_execute` allows without reading them; that part is auto-allow from wider command recognition, not a sign the scripts are safe.
That is what the Policy says about this corpus, reported as-is.
Reviewing the whole preview took 24 Verdicts, one per Adoption Group.
The fresh-volume re-run of the journey, scripted through the API, showed the same figures, and `verify-audit` found the Decision Record chain intact; on screen the deny tile rounds to `0.1%` because tiles show one decimal, and the count 20 is exact.

### Change Review (github.com/** scene)

The core scene is fetches to other owners' repositories after `trustedRemotes` is widened with a host-wide GitHub pattern.

That scene is **9 Actions** (5 `git` fetches from one repository, 4 `gh` fetches, one to each of four other repositories).
Zone moves `unknown_remote` → `trusted_remote`. Effect moves ask → allow. Severity is critical.
Named remotes used outside the Action workspace do not resolve a Remote Key, so they stay `unknown_remote` even under that pattern.

Journey grade: **medium** (중). Real-record Adoption Groups and Widening groups were available to review, and they stayed inside the predicted scene.
Verdicts in this record were given by an Agent, not a person.

Jev is V2 exploration only (`authority probe`). Replay, Change Review, and conformance do not call it, and a Probe result is not a Gate.

## 탐색적 정책 문장 점검

`authority probe --provider jev` asks Jev how it reads each default-template Rule sentence against the Scenarios in `tests/corpus/scenarios.json`, and ranks them by margin.
The Scenario set is 35 synthetic entries, 30 of them agent-authored.
Each default-template Rule has three added Scenarios, each using one of the explicit, implied, delegated, or absent Mandate phrasings.
On one run 35 / 35 matched the expected Effect and the lowest Effect margin was 0.88; n=35 cannot support a 95% match-rate claim.
There is no threshold and no gate wiring. The ranking, the lowest-margin Scenarios, and the limits are in [docs/evidence/probe-exploratory.md](docs/evidence/probe-exploratory.md).

## How to run

Node 22. The intended local path is compose, seed or import, the web journey, then hooks.

1. `docker compose up` — PostgreSQL and the server. The server listens on `http://localhost:8787`. The compose file sets `AUTHORITY_AUTH_TOKEN` to `local-dev-token`.
2. **Seed** (optional). One command imports a transcript snapshot and creates the organization Policy with the given document as draft version 1:

   ```sh
   AUTHORITY_DB_URL=postgres://authority:authority@localhost:55432/authority \
   AUTHORITY_AUTH_TOKEN=local-dev-token \
     pnpm seed:demo --snapshot <transcript-directory> --policy <policy-document.json>
   ```

   The adoption review, its Verdicts, and the acceptance are left to the web journey. The seed refuses a database that already holds a Policy.
   To start from the web instead, skip the seed and import only (step 3); `/` then offers "첫 조직 정책 만들기".
3. Import Claude Code transcripts:

   ```sh
   AUTHORITY_CLI_SERVER_URL=http://localhost:8787 \
   AUTHORITY_CLI_TOKEN=local-dev-token \
     pnpm authority import <transcript-directory>
   ```

4. Open the web app (`pnpm --filter @authority/web dev`, `http://localhost:5173`, token `local-dev-token`) and follow the journey above.
5. Install observation hooks into Claude Code settings (fail-open, no Effect):

   ```sh
   pnpm authority install-hooks
   ```

   `pnpm authority spool-flush` later sends spool files to the server for conformance.
   `pnpm authority spool-flush --from <dir>` sends a spool directory copied from another machine.

Do not put real transcripts, command text, paths, or host names into this repository. Keep those under `.local/` and publish aggregates only.

## Limitations

- **Single-person corpus.** Adoption preview, replay, and conformance numbers come from one Principal's Claude Code records.
- **Single runtime.** Parse, import, and hooks cover Claude Code. There is no Codex adapter.
- **Agent Verdict.** Adoption Group and Widening group Verdicts in the recorded journey were given by an Agent. A person has not recorded Verdicts on those groups.
- **Adoption preview is not a runtime baseline.** The preview applies the draft to past Actions. It does not say which of those Actions a runtime approved, and `accepted` does not mean the runtime now behaves this way.
- **Hook observation gap.** When the hook is down, no Runtime Observation is written. Those Actions get Disposition `executed_prompt_unknown`.
- **`over_asked` stays near 0.** The PermissionRequest hook input carries no tool use id, so a PermissionRequest pairs to its Action by Session, tool name, and tool input hash, and only when the earlier `pre_tool_use` was observed. This corpus recorded only 2 PermissionRequest observations.
- **Publish direction.** Zone does not distinguish publish from fetch. `ask_external_disclosure` matches `push` on `public_remote` and `unknown_remote` only. A package publish to a registry listed in `trustedRemotes` is `push` on `trusted_remote` and is not treated as external disclosure.
- **Worktree host Zone.** `workspace` is the Action's workspace root. Sibling worktree paths resolve as `host`. A Rule that allows read, write, or execute in `workspace` still asks there, which is most of the ask share above.
- **Approximate remote parsing.** A Remote Key comes from the command text and the remotes found on disk at import time. A named remote used outside the Action workspace stays unresolved and falls to `unknown_remote` (`docs/evidence/classifier-limitations.md`, `docs/evidence/replay-limitations.md`).
- **Real-record demo, no synthetic fixture.** The `github.com/**` scene in the recorded journey comes from recorded Actions. No `synthetic` fixture was imported, and no Widening outside the expected list appeared. Metrics, provenance, and grade are in `docs/evidence/v1-metrics.md`.
- **Not built in V1.** Enforcing or rolling back a Policy Version, settings export, a job queue, API tokens and roles, provider calibration, a Codex parser, and the other work listed in `docs/cutline.md` chapter 13 are out of scope.
- **Node path.** `install-hooks` prefers a stable Node path over a versioned one, because a versioned path disappears on upgrade. It uses a Homebrew symlink that resolves to the same Cellar binary, or the vite-plus, Volta, or nvm shim. If neither exists, the versioned path remains and hooks break after upgrade.

Classifier details, Zone publish counts, and hook spool behavior are in `docs/evidence/`. Range is `docs/cutline.md`. Target architecture is `docs/design.md`. Terms are `CONTEXT.md`.
