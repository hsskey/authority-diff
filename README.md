# Authority Diff

Authority Diff replays an Agent's past work under a permission Policy, so you can see which Actions the Policy would allow, ask about, or deny before you adopt it or change it.

**Evidence scope:** one-person, single-runtime (Claude Code) evidence; verdicts recorded by an agent; grade medium.
The corpus figures in this README come from one person's Claude Code transcripts; the exploratory probe uses synthetic Scenarios instead.
The Verdicts in that record were given by an Agent, not a person, and the recorded journey is graded medium ([Evidence](#evidence)).

Korean: [README.ko.md](README.ko.md)

## The problem and who it is for

Authority Diff is for the engineering lead or platform owner who writes the permission Policy for the coding Agents in an organization.

A permission Policy is a list of Rule sentences.
Reading the sentences does not show which of your Agents' real tool calls each Rule would allow, ask about, or deny.
A small edit, such as trusting every repository on one host, can turn asks into allows for Actions nobody meant to trust.

Authority Diff answers two questions on recorded Actions:

- What would this first Policy ask about or deny?
- Which Actions would this Policy change move to a different Effect?

## Quickstart

You need Node 22, pnpm, and Docker.
The commands below import the three synthetic transcripts in `tests/fixtures/journey/transcripts`; to review your own work, point the import at a directory of your Claude Code transcripts instead.

```sh
pnpm install --frozen-lockfile
docker compose up -d --wait
AUTHORITY_CLI_SERVER_URL=http://localhost:8787 AUTHORITY_CLI_TOKEN=local-dev-token \
  pnpm authority import tests/fixtures/journey/transcripts
pnpm --filter @authority/web dev
```

`docker compose up` starts PostgreSQL and the server on `http://localhost:8787`, and sets the server token to `local-dev-token`.
Open `http://localhost:5173`, log in with the token `local-dev-token`, and choose "Create the first organization policy".
The next section walks through the rest of the screens.
Screen labels here are quoted from the English UI; the language button in the header switches between English and Korean.

### Walk the journey

import → activity overview → first Policy (draft) → adoption preview → review and adopt → [outside Authority Diff] update runtime settings → change review → conformance

1. **Import.** `authority import` loads Claude Code transcripts, redacts secrets, and classifies each tool call into Operations.
2. **Activity Overview.** Before a Policy exists, `/` shows the imported activity: Sessions, Actions, Capability and Target Kind distribution, analyzability, and top programs.
   It shows no Effect and no Zone, because both need a Policy.
3. **First Policy (draft).** "Create the first organization policy" creates draft version 1 from the default template.
   Edit the JSON (Rules and Environment Profile), then save and validate it.
   An organization has one Policy.
4. **Adoption preview.** "Create initial adoption review" evaluates the recorded Actions under the draft alone.
   The screen counts the Actions the draft would allow, ask about, or deny, and groups the ask and deny Actions into Adoption Groups by Effect, Capability, and Zone.
   The preview compares nothing with a baseline and infers no past approval from the transcripts.
5. **Review and adopt.** Give every Adoption Group a Verdict: Intended limit, On hold, or Needs policy fix.
   When every group is Intended limit, "Adopt initial policy" marks version 1 `accepted` and writes a Decision Record.
6. **[Outside Authority Diff] update runtime settings.** `accepted` is a review record.
   Changing runtime settings to match the Policy, for example through managed settings, happens outside Authority Diff.
   An operator can record through the API that this change happened.
   Authority Diff stores that declaration without checking it, and no Policy Version status, replay, conformance, evaluation, or screen reads it.
   `GET /api/v1/policy-versions/{id}/exports/claude-code` returns a Claude Code settings fragment as a reference: only Rules with a deterministic Claude Code form are in it, every other Rule is listed under `unmappedRules` with a reason, and Authority Diff does not deploy or enforce the fragment (ACR-0018).
   The default template has no such Rule, so its fragment is empty.
7. **Change review.** A draft made from the accepted version gets a Change Review.
   It evaluates the same Actions under both versions, shows Widening and Narrowing groups, takes Verdicts, and ends in accept or reject with an Evidence Report.
8. **Conformance.** Observation hooks report what the runtime did.
   Conformance compares those Runtime Observations with the accepted Policy and reports violation, under_asked, and over_asked findings.
   This is the only screen that says anything about runtime behavior.

### Seed a database from a snapshot

To skip the Policy editor, one command imports a transcript snapshot and creates the organization Policy with a given document as draft version 1:

```sh
AUTHORITY_DB_URL=postgres://authority:authority@localhost:55432/authority \
AUTHORITY_AUTH_TOKEN=local-dev-token \
  pnpm seed:demo --snapshot <transcript-directory> --policy <policy-document.json>
```

The seed refuses a database that already holds a Policy.
The adoption review, its Verdicts, and the acceptance stay in the web journey.

### Record runtime behavior for conformance

Install the observation hooks into your Claude Code settings.
The hooks are fail-open and return no Effect.

```sh
pnpm authority install-hooks
```

Run `pnpm authority spool-flush` to send the recorded spool files to the server for conformance.
Run `pnpm authority spool-flush --from <dir>` to send a spool directory copied from another machine.

## Core concepts

**Policy Version and Effect.**
A Policy Version is one immutable document that holds the Rules and the Environment Profile.
Each Rule attaches an Effect (`allow`, `ask`, or `deny`) to conditions on Capability, Zone, Reversibility, and Analyzability.
Authority Diff splits each Action, one tool call, into Operations, and the Action gets the most restrictive Effect among its Operations.

**Review: groups, Verdicts, and the Gate.**
A replay evaluates the same recorded Actions under a Policy Version.
Before any version is accepted, a first-adoption review groups the ask and deny Actions into Adoption Groups.
After that, a change review compares a draft with the accepted version and groups the Actions whose Effect changed into Widening and Narrowing groups.
A person records one Verdict per group.
The Gate opens when no blocker remains: in a first-adoption review it looks at every Adoption Group, and in a change review at the Widening groups.
Each accept or reject writes a Decision Record into a hash chain that `verify-audit` checks.

**Conformance.**
Observation hooks record what the runtime did with each Action, called its Disposition.
Conformance compares those Dispositions with the accepted Policy Version and reports each disagreement as a violation, under_asked, or over_asked finding.
Replay and review describe what the Policy says; conformance is the part that measures what the runtime did.

The full glossary is `CONTEXT.md`.

## Evidence

<!-- evidence-numbers
classifier: 0.2.6
snapshot.sessions: 1,036
snapshot.actions: 34,940
snapshot.evaluated: 34,033
policy-a.allow: 17,801
policy-a.ask: 16,212
policy-a.deny: 20
adoption.groups: 24
bp-scene.actions: 9
-->
Every figure below comes from one frozen corpus snapshot (1,036 Sessions, 34,940 Actions after dedupe), classifier 0.2.6, and the corrected Environment Profile (policy A).
Each evidence document stamps its classifier version on its first line.
Figures from earlier classifier versions stay only under that document's "Previous version" sections.
Details, masked group tables, and hashes are in `docs/evidence/adoption-preview.md`, `docs/evidence/gate2-replay.md`, and `docs/evidence/conformance.md`.

### Adoption preview (first Policy)

<!-- remeasure:readme-adoption -->
| evaluated Actions | allow | ask | deny | Adoption Groups |
| ---: | ---: | ---: | ---: | --- |
| 34,033 | 17,801 (52.3%) | 16,212 (47.6%) | 20 (0.06%) | 24 (22 ask, 2 deny) |
<!-- /remeasure:readme-adoption -->

allow 52.3% and ask 47.6% sum to 99.9% because of rounding.
deny is the remaining share: 20 Actions, 0.06% in the table and 0.1% on the screen tile, which shows one decimal.
The ask share is high for two reasons.
The default template has no Rule that allows read, write, or execute outside the workspace, so those Actions fall to the default ask.
A Rule also asks before `execute` of a program the classifier cannot analyze.
The allow share includes scripts named by a path inside the workspace, which `allow_workspace_execute` allows without reading them.
That part of the allow share comes from wider command recognition and does not show that those scripts are safe.
The table reports what the Policy says about this corpus, as-is.
Reviewing the whole preview took 24 Verdicts, one per Adoption Group.
A fresh-volume re-run of the journey, scripted through the API, showed the same figures, and `verify-audit` found the Decision Record chain intact.

### Change Review (github.com/** scene)

The core scene is fetches from other owners' repositories after a draft widens `trustedRemotes` with a host-wide GitHub pattern.

That scene is **9 Actions**: 5 `git` fetches from one repository and 4 `gh` fetches, one from each of four other repositories.
Zone moves `unknown_remote` → `trusted_remote`, Effect moves ask → allow, and severity is critical.
A named remote used outside the Action workspace resolves no Remote Key, so it stays `unknown_remote` even under that pattern.

Journey grade: **medium**.
Real-record Adoption Groups and Widening groups were available to review, and they stayed inside the predicted scene.
The grade is not strong because the recorded Actions showed no Widening outside the expected list.
The Verdicts in this record were given by an Agent, not a person.

### Exploratory policy sentence check

`authority probe --provider jev` asks Jev, a model that reads policy sentences, how it reads each default-template Rule sentence against the Scenarios in `tests/corpus/scenarios.json`, and ranks the Scenarios by margin.
The measured set is 35 synthetic schemaVersion 1 Scenarios, 30 of them agent-authored.
Each default-template Rule has three of them, spread across the explicit, implied, delegated, and absent Mandate phrasings.
On one run, 35 / 35 matched the expected Effect and the lowest Effect margin was 0.88.
A sample of 35 cannot support a 95% match-rate claim.
`tests/corpus/scenarios.json` also holds 20 schemaVersion 2 Scenarios that were not rerun, because Jev access was not available.
The probe has no threshold and no gate wiring.
The ranking, the lowest-margin Scenarios, the schemaVersion 2 additions, and the limits are in [docs/evidence/probe-exploratory.md](docs/evidence/probe-exploratory.md).

## Limits and non-goals

### Non-goals

- Authority Diff does not deploy or enforce a Policy; `accepted` is a review record, and changing runtime settings happens outside Authority Diff.
- Authority Diff makes no claim that the runtime behaves as an evaluation result says; conformance measures that by comparing Runtime Observations with the accepted Policy.
- Jev is used only for exploratory probes (`authority probe`) and takes no part in replay, review, or conformance.

Rolling back a Policy Version, deploying settings, API tokens and roles, provider calibration, a Codex parser, and the other work listed in `docs/cutline.md` chapter 13 are out of scope.

### Limits

- **Single-person corpus.** The adoption preview, replay, and conformance figures come from one Principal's Claude Code records.
- **Single runtime.** Parsing, import, and hooks cover Claude Code only; there is no Codex adapter.
- **Agent Verdicts.** An Agent gave the Adoption Group and Widening group Verdicts in the recorded journey; no person has recorded Verdicts on those groups.
- **Adoption preview is not a runtime baseline.** The preview evaluates past Actions under the draft.
  It does not say which of those Actions a runtime approved, and `accepted` does not mean the runtime now behaves this way.
- **Hook observation gap.** While the hook is down, no Runtime Observation is written, and those Actions get Disposition `executed_prompt_unknown`.
- **`over_asked` stays near 0.** The PermissionRequest hook input carries no tool use id.
  A PermissionRequest pairs with its Action by Session, tool name, and tool input hash, and only when the earlier `pre_tool_use` was observed.
  This corpus recorded only 2 PermissionRequest observations.
- **Publish direction.** Zone does not tell a publish from a fetch.
  `ask_external_disclosure` matches `push` on `public_remote` and `unknown_remote` only.
  A package publish to a registry listed in `trustedRemotes` is `push` on `trusted_remote`, and the Policy does not treat it as external disclosure.
- **Worktree host Zone.** `workspace` is the Action's workspace root, and sibling worktree paths resolve as `host`.
  A Rule that allows read, write, or execute in `workspace` still asks in those paths, which accounts for most of the ask share above.
- **Approximate remote parsing.** A Remote Key comes from the command text and the remotes found on disk at import time.
  A named remote used outside the Action workspace stays unresolved and falls to `unknown_remote` (`docs/evidence/classifier-limitations.md`, `docs/evidence/replay-limitations.md`).
- **Real-record demo, no synthetic fixture.** The `github.com/**` scene in the recorded journey comes from recorded Actions.
  No `synthetic` fixture was imported, and no Widening outside the expected list appeared.
  Metrics, provenance, and grade are in `docs/evidence/v1-metrics.md`.
- **Node path.** `install-hooks` prefers a stable Node path over a versioned one, because a versioned path disappears on upgrade.
  It uses a Homebrew symlink that resolves to the same Cellar binary, or the vite-plus, Volta, or nvm shim.
  If none of these exists, the hooks keep the versioned path and break after a Node upgrade.

Classifier details, Zone publish counts, and hook spool behavior are in `docs/evidence/`.

## Contributing

- [AGENTS.md](AGENTS.md) lists the commands, package boundaries, coding conventions, and the checks to run before you open a pull request.
- [CONTEXT.md](CONTEXT.md) is the glossary; code, docs, and names use only its terms.
- [docs/cutline.md](docs/cutline.md) is the current scope, and [docs/design.md](docs/design.md) is the target architecture.
- [docs/adr/](docs/adr/) records hard-to-reverse decisions, and [docs/acr/](docs/acr/) records approved architecture changes.
- Pull requests use [.github/PULL_REQUEST_TEMPLATE.md](.github/PULL_REQUEST_TEMPLATE.md), and CI checks the body.
- Do not put real transcripts, command text, paths, or host names into this repository.
  Keep them under `.local/` and publish aggregate figures only.

## License

MIT. See [LICENSE](LICENSE).
