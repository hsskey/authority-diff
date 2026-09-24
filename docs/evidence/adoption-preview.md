corpus snapshot: transcripts-2026-09-23-1036 (2026-09-23, 1,036 files, 34,940 Actions); classifier 0.2.6; measured 2026-09-24; candidate policy A contentHash `f96ed41d…beb8`; adoption resultHash `099321d3…0215` (server), `099321d3…0215` (local pipeline)
<!-- evidence-numbers
snapshot.sessions: 1,036
snapshot.actions: 34,940
snapshot.duplicates: 196
snapshot.evaluated: 34,033
policy-a.contentHash: f96ed41d…beb8
policy-a.allow: 17,801
policy-a.ask: 16,212
policy-a.deny: 20
analyzability.full: 17,980
analyzability.partial: 10,044
analyzability.none: 6,009
adoption.groups: 24
adoption.resultHash: 099321d3…0215
gate2.a-vs-b.resultHash: 547da885…2735
gate2.a-vs-bp.resultHash: a3e33bde…3904
gate2.a-vs-b.changed: 169
conformance.resultHash: 898affd1…1ca8
-->

# Adoption preview (first Policy)

The adoption preview applies one candidate Policy Version to the recorded Actions with no baseline and asks which Effect each Action would receive (ADR-0010).
<!-- remeasure:adoption-intro -->
Every number in the main sections below is labelled **classifier 0.2.6, policy A** (measured 2026-09-24).
<!-- /remeasure:adoption-intro -->
No repository names, host paths, or raw command text appear below; non-standard programs are masked as `<local-tool-NN>` and MCP tools as `<mcp-tool-NN>`.

Judge: Agent. No person has recorded a Verdict on these groups.
Journey grade: **medium**: real-record Adoption Groups were reviewable and the preview matched the expected shape; nothing stronger is claimed.

## Result

<!-- remeasure:adoption-result -->
The candidate is policy A: the default template's Rules with the corrected environment profile (credential paths 5, agent-config paths 4, trusted remotes 35, public remotes 40, protected branches 3, production markers 3).
Actions are built the same way the server builds them for a replay (transcript parse, remote enrichment, classifier 0.2.6, duplicate Action Keys removed) and evaluated with `computeAdoption` from `@authority/replay/diff`.

| item | value |
| --- | ---: |
| Sessions | 1,036 |
| Actions (after dedupe) | 34,940 (196 duplicates) |
| evaluated | 34,033 |
| excluded (no Operation) | 907 |
| allow | 17,801 (52.3%) |
| ask | 16,212 (47.6%) |
| deny | 20 (0.06%) |
| analyzability full / partial / none (Action) | 17,980 / 10,044 / 6,009 |
| Capability × Zone × Effect cells | 30 |
| Adoption Groups (ask / deny) | 24 (22 / 2) |
| ask + deny Actions assigned to a group | 16,232 |
| Sessions with at least one ask or deny Action | 492 |
| `computeAdoption` wall time | 438 ms |

The four figures the adoption review shows on screen and that this file locks: **evaluated 34,033, ask 47.6%, deny 20 (0.06%), 24 Adoption Groups**.
The web renders shares with one decimal, so the deny tile reads `0.1%`; the count 20 is the exact figure.
<!-- /remeasure:adoption-result -->

## Why the ask share is what it is

The ask share is a property of this Policy on this corpus and is reported as-is.

- 11,228 of the 16,232 ask and deny Actions (69.2%) match no Rule and fall to the default `ask`.
  The default template allows read, write, and commit only in `workspace` and execute only in `workspace` with `full` or `partial` analyzability; every read, write, or execute outside the Action's workspace root is `host` and asks.
- `cd` into a directory outside the workspace root is classified as a `read` Operation on that path and is the deciding Operation of 1,255 Actions (7.7% of ask and deny), the second largest program in the `ask · read · host` group after `cat`.
  Sibling worktrees and the supervisor's home are outside every Session's workspace root in this corpus (`docs/evidence/replay-limitations.md`).
- 4,741 Actions (29.2%) are in `ask · execute · host`, decided by `ask_unanalyzable`; 4,429 of them have analyzability `none`, an `execute` whose effect could not be determined.
- The remaining Rule matches are small: `ask_irreversible_local` 125, `ask_external_disclosure` 95, `ask_agent_config_change` 23, `deny_credentials_access` 13, `deny_shared_history_rewrite` 7.
- A command named by a path, or a shell given a script file, is `execute` on that file with analyzability `partial`, so `allow_workspace_execute` allows a script inside the workspace without reading it.
  That part of the allow share is auto-allow from wider recognition, not a conservative recovery; the change note under "Previous version" gives the count.

The default template was not changed to move this number, and the none rate is not a classifier target.
An organization that wants the share to drop declares more of its environment (workspace roots, trusted remotes) or adds Rules; that is a Policy change reviewed in a Change Review.

## Adoption Groups

<!-- remeasure:adoption-groups -->
Groups are `[effect, capability, zone]` (ADR-0010), in review order (deny first, then ask by Action count).
The share column is of the 16,232 ask and deny Actions.
Programs are masked as in the previous rounds: non-standard programs as `<local-tool-NN>`, MCP tools as `<mcp-tool-NN>`.

| # | effect | capability | zone | deciding rule | actions | sessions | share | none | distinct programs | top programs |
| ---: | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | deny | read | credentials | deny_credentials_access | 13 | 10 | 0.1% | 0 | 4 | grep 6, ls 4, gh 2, Read 1 |
| 2 | deny | rewrite | public_remote | deny_shared_history_rewrite | 7 | 5 | 0.0% | 0 | 1 | git 7 |
| 3 | ask | read | host | none (default ask) | 6,618 | 381 | 40.8% | 0 | 27 | cat 1,389, cd 1,255, ls 1,183, grep 669 |
| 4 | ask | execute | host | ask_unanalyzable | 4,741 | 343 | 29.2% | 4,429 | 118 | python3 2,081, <local-tool-02> 660, node 511, <local-tool-08> 330 |
| 5 | ask | write | host | none (default ask) | 3,099 | 365 | 19.1% | 0 | 41 | cat 775, echo 592, mkdir 422, Write 217 |
| 6 | ask | read | agent_config | none (default ask) | 474 | 179 | 2.9% | 0 | 17 | cat 135, Read 125, sed 77, grep 50 |
| 7 | ask | fetch | public_remote | none (default ask) | 387 | 108 | 2.4% | 0 | 2 | gh 197, git 190 |
| 8 | ask | fetch | unknown_remote | none (default ask) | 234 | 86 | 1.4% | 0 | 5 | git 102, gh 55, WebFetch 34, curl 31 |
| 9 | ask | fetch | protected | none (default ask) | 153 | 19 | 0.9% | 0 | 1 | gh 153 |
| 10 | ask | delete | workspace | none (default ask) | 147 | 95 | 0.9% | 0 | 4 | rm 127, git 17, find 2, rmdir 1 |
| 11 | ask | delete | host | ask_irreversible_local | 105 | 63 | 0.6% | 0 | 2 | rm 103, rmdir 2 |
| 12 | ask | push | public_remote | ask_external_disclosure | 90 | 74 | 0.6% | 0 | 1 | git 90 |
| 13 | ask | execute | unknown_remote | none (default ask) | 60 | 14 | 0.4% | 0 | 17 | <mcp-tool-03> 6, <mcp-tool-04> 6, <mcp-tool-02> 6, <mcp-tool-01> 6 |
| 14 | ask | fetch | host | none (default ask) | 38 | 23 | 0.2% | 0 | 1 | git 38 |
| 15 | ask | write | agent_config | ask_agent_config_change | 21 | 11 | 0.1% | 0 | 8 | Write 7, Edit 5, cat 2, ln 2 |
| 16 | ask | rewrite | workspace | ask_irreversible_local | 20 | 17 | 0.1% | 0 | 1 | git 20 |
| 17 | ask | send | protected | none (default ask) | 7 | 1 | 0.0% | 0 | 1 | gh 7 |
| 18 | ask | install | unknown_remote | none (default ask) | 4 | 2 | 0.0% | 0 | 2 | brew 3, npm 1 |
| 19 | ask | push | protected | none (default ask) | 3 | 3 | 0.0% | 0 | 2 | git 2, gh 1 |
| 20 | ask | execute | trusted_remote | none (default ask) | 3 | 2 | 0.0% | 0 | 1 | npm 3 |
| 21 | ask | send | unknown_remote | ask_external_disclosure | 3 | 1 | 0.0% | 0 | 1 | curl 3 |
| 22 | ask | send | public_remote | ask_external_disclosure | 2 | 2 | 0.0% | 0 | 1 | gh 2 |
| 23 | ask | delete | agent_config | ask_agent_config_change | 2 | 1 | 0.0% | 0 | 1 | rm 2 |
| 24 | ask | commit | agent_config | none (default ask) | 1 | 1 | 0.0% | 0 | 1 | git 1 |

- Group sizes: 1,000+ Actions 3 groups, 100 to 999 6, 20 to 99 5, 5 to 19 3, 2 to 4 6, single Action 1.
  The largest group holds 40.8% of ask and deny Actions, the top 4 hold 92.0%, the top 11 hold 99%.
- Every group has exactly one deciding Rule (the default `ask` counted as one); no group mixes Rules.
- Distinct programs per group: 118, 41, 27, 17, 17, 8, 5, 4, 4, 2, 2, 2, 2, then 1 in the remaining 11 groups.
  The Program Summary inside each group is what makes an `expected` Verdict on `ask · execute · host` a decision about 118 programs rather than about a key.
- Review units: 24 Verdicts, one per group, to open the gate.
<!-- /remeasure:adoption-groups -->

## Determinism and consistency with the Change Review baseline

<!-- remeasure:adoption-determinism -->
- Two `computeAdoption` runs over the same snapshot gave the same `resultHash` `099321d3c553a666c5de9cbdf68414bac2e940e853a202eb808401e705d80215` (438 ms and 413 ms).
- Two server runs over the imported Actions gave the same `resultHash` `099321d3c553a666c5de9cbdf68414bac2e940e853a202eb808401e705d80215`, equal to the local value.
- The preview agrees with the Gate 2 A vs B replay on the same classifier: allow→allow 17,801 = allow; ask→allow 169 + ask→ask 16,043 = 16,212 = ask; deny→deny 20 = deny; evaluated 34,033 and excluded 907 in both (`docs/evidence/gate2-replay.md`).
<!-- /remeasure:adoption-determinism -->
- The `resultHash` covers stats, the groups in group-key order (Program Summary included, Headline excluded), and the (actionKey, groupKey, effect) assignments in action-key order.

## Scripted fresh-volume journey

`pnpm evidence:remeasure` runs the twelve steps against the API of a compose project of its own with an empty volume, a server built from the working tree, and the frozen spool copies, then removes the project and its volume.
Every check below is asserted by the command; a failed check stops it before any document is written.
It reads what the server returns, not what the screens render; the screen checks stay in the re-run procedure below.

<!-- remeasure:adoption-journey -->
| step | via | result |
| --- | --- | --- |
| 1 import | `authority import` | 1,036 sessions, 34,940 accepted, 196 duplicates, 0 failed |
| 2 overview, no Policy | activity overview | no Policy; Action 34,940, evaluable 34,033; analyzability 17,980 / 10,044 / 6,009 |
| 3 first Policy | policy version | draft version 1 from the default template replaced with policy A (content hash `f96ed41d…beb8`), validation passed |
| 4 adoption preview | change review, replay run | kind `adoption`, no baseline; evaluated 34,033; allow 17,801, ask 16,212, deny 20; 22 ask and 2 deny groups; stats and group keys equal the local computation; resultHash `099321d3…0215` on two runs |
| 5 group detail | adoption group samples | `deny · read · credentials` and `ask · read · host` return a Headline and samples |
| 6 verdicts | verdicts | 24 groups set to `expected`; `adoption_unreviewed` blocks the gate until the last one, then the gate opens |
| 7 adopt | decision | review `accepted`, version 1 `accepted` |
| 8 report | Evidence Report | adoption Evidence Report carries resultHash `099321d3…0215` |
| 9 conformance | `authority spool-flush`, replay run | 2 spool copies sent; conformance run for version 1 completed with 86 findings, resultHash `898affd1…1ca8` |
| 10 change review B' | policy version, change review | draft version 2 with B' (`ebea9a23…0cc9`), kind `change`, baseline version 1; changed 169, Widening group 7; resultHash `a3e33bde…3904` equals the local Gate 2 run |
| 11 unexpected, reject, B, accept | verdicts, decisions | 5 groups `expected`, 2 `unexpected` → `widening_unexpected` blocks and accept is refused; rejected; draft version 3 with B (`45197245…6515`): changed 169, Widening group 5, resultHash `547da885…2735` equals the local Gate 2 run; all `expected` → accepted |
| 12 audit | `authority verify-audit` | intact, 3 decision records |
<!-- /remeasure:adoption-journey -->

## Fresh-volume journey re-run

The scripted API journey above is the re-run on this classifier. The twelve-screen browser pass was not repeated; its recorded table is under Previous version.

The four figures match the measurement above: evaluated 34,033, ask 47.6%, deny 20 (rendered 0.1%), 24 Adoption Groups.
Server and local agreement: the adoption run on the server gave the local `resultHash` `099321d3…0215`.

Findings from this run (none blocks the journey):

- After "token 저장" on `/login`, the header now shows "로그아웃" without a reload; the 0.2.3 finding on this is resolved.
- The deny share renders as `0.1%` because tiles show one decimal; the count 20 is exact.

## Re-run procedure (fresh volume)

`pnpm evidence:remeasure` reruns the four Gate 2 comparisons, the adoption preview, and the policy A conformance run on the frozen snapshot, runs the twelve steps through the API (see "Scripted fresh-volume journey"), and rewrites the stamps and the measured blocks (`<!-- remeasure:<name> -->`) of `gate2-replay.md`, this file, `conformance.md`, and the README numbers table.
It reads `.local/evidence-remeasure.json` (`--config` for another file): `snapshot`, `snapshotDate`, `policies` (`A`, `B`, `B'`, `P`, `P'`), `spool` (the cut spool copies), `conformanceWindow`, and `legend`, the private map from real program, repository, and host names to their masked labels; a name missing from the legend gets the next label of its kind.
Prose outside the blocks is left to people.
When the classifier version changed, the command first moves each document's main sections under a new "Previous version" section and prints the prose lines with numbers to re-check.
Raw results, the adoption Evidence Report, and the compose file go to `.local/remeasure/<time>/`.

The scripted API journey is the measurement. A browser pass over the screens is optional and was not repeated.
The adoption stage comes first; the change-review stage is the Gate 3 journey unchanged.

Stack: a compose project of its own with an empty volume and its own ports, built from the commit under test; the maintainer's running stack is not used.
The web app runs from `apps/web` with `/api` proxied to that server.
Commands below omit the corpus and policy file paths; they live under `.local/` and never enter the repository.

Adoption stage:

1. `pnpm authority import <snapshot>` into the fresh stack. Expected: 1,036 sessions, 34,940 accepted, 196 duplicates, 0 failed.
2. `/` with no Policy shows the Activity Overview (Sessions, Actions, evaluable Actions, analyzability, Capability and Target Kind tables, top programs, remote hosts) and "아직 조직 정책이 없습니다".
3. "첫 조직 정책 만들기" opens draft version 1 (default template). Replace the document with policy A, "draft 저장" (the content hash becomes `f96ed41d…beb8`), "검증" reads "검증: 통과".
4. "최초 도입 검토 만들기". The review is kind `adoption`, "기준 VERSION 없음 (최초 도입)". Confirm on the review and on `/` ("도입 preview"): evaluated 34,033; 허용 17,801 (52.3%); 확인 필요 16,212 (47.6%); 차단 20 (the tile rounds to 0.1%); "확인 필요 group (22)", "차단 group (2)".
5. Open one deny group and one ask group: the Headline, the Program Summary, and the Target Summary are outside the sample panel; command text, paths, and ruleId are only inside the sample panel and the "기술 세부" toggle.
6. Set every one of the 24 groups to 의도한 제한. "Gate: 열림" appears only after the last one; before that the blocker reads "판정하지 않은 group N개" and "최초 정책 채택" is disabled.
7. Enter a reviewer name and "최초 정책 채택". The decision record appears, version 1 is `accepted`, the verdict controls are disabled, and no screen says 적용됨, 활성, or enforced. `/` now shows "채택된 정책: version #1" with the Effect distribution.
8. Download the Evidence Report: policy hash, window, scale, allow/ask/deny counts and shares, the two group tables with Verdicts, the decision, the Decision Record hash, the notice that the figures apply the Policy to past behavior and do not recover past runtime approvals. No path or command text in it.

Change-review stage (the Gate 3 journey, unchanged): from the accepted version 1 make draft version 2 with B', "변경 검토 만들기", then Gate 3 items 3 to 7 (the two `unknown_remote → trusted_remote` groups critical with a self-explaining Headline; no path, fragment, or ruleId outside the sample panel; unexpected locks accept with blocker copy; reject, edit to B, accept; the downloaded report carries both content hashes, inputsHash, resultHash, the audit tail, the `none` share, and the Operation section; `pnpm authority verify-audit` intact).

Conformance stage: copy the hook spool files into a scratch home, `spool-flush` them to the fresh server, request a `conformance` run for the accepted version over the observation window, and read `/conformance`.

Tear the stack down with `down -v` when done.

## Previous version: classifier 0.2.5 (not re-run)

The section below is the adoption preview as measured on classifier 0.2.5, policy A, on 2026-09-24, and is kept as the record of that measurement.
Its `resultHash` values are not comparable with the 0.2.6 values above.

### Change from classifier 0.2.5

| measure | 0.2.5 | 0.2.6 |
| --- | ---: | ---: |
| evaluated / excluded | 34,490 / 450 | 34,033 / 907 |
| allow | 17,801 (51.6%) | 17,801 (52.3%) |
| ask | 16,669 (48.3%) | 16,212 (47.6%) |
| deny | 20 | 20 |
| analyzability full / partial / none (Action) | 17,980 / 10,044 / 6,466 | 17,980 / 10,044 / 6,009 |
| Adoption Groups (ask / deny) | 24 (22 / 2) | 24 (22 / 2) |
| `ask · execute · host` Actions | 5,198 | 4,741 |
| Sessions with at least one ask or deny Action | 647 | 492 |
| A vs B changed Actions | 169 | 169 |
| server and local `resultHash` | equal | equal |

Classifier 0.2.6 maps StructuredOutput to zero Operations.
Its 457 Actions, all in `ask · execute · host` with analyzability `none`, leave evaluation and are excluded; the allow and deny counts are unchanged.
The allow share rises only because the evaluated count shrinks; the ask share falls because all 457 excluded Actions were ask.
Every other Adoption Group has the same Actions, sessions, and top programs, so the remote-to-local `scp` change from `send` to `fetch` moves no Action between groups in this snapshot.

The adoption preview applies one candidate Policy Version to the recorded Actions with no baseline and asks which Effect each Action would receive (ADR-0010).
Every number in the main sections below is labelled **classifier 0.2.5, policy A** (measured 2026-09-24).
No repository names, host paths, or raw command text appear below; non-standard programs are masked as `<local-tool-NN>` and MCP tools as `<mcp-tool-NN>`.

Judge: Agent. No person has recorded a Verdict on these groups.
Journey grade: **medium**: real-record Adoption Groups were reviewable and the preview matched the expected shape; nothing stronger is claimed.

### Result

The candidate is policy A: the default template's Rules with the corrected environment profile (credential paths 5, agent-config paths 4, trusted remotes 35, public remotes 40, protected branches 3, production markers 3).
Actions are built the same way the server builds them for a replay (transcript parse, remote enrichment, classifier 0.2.5, duplicate Action Keys removed) and evaluated with `computeAdoption` from `@authority/replay/diff`.

| item | value |
| --- | ---: |
| Sessions | 1,036 |
| Actions (after dedupe) | 34,940 (196 duplicates) |
| evaluated | 34,490 |
| excluded (no Operation) | 450 |
| allow | 17,801 (51.6%) |
| ask | 16,669 (48.3%) |
| deny | 20 (0.06%) |
| analyzability full / partial / none (Action) | 17,980 / 10,044 / 6,466 |
| Capability × Zone × Effect cells | 30 |
| Adoption Groups (ask / deny) | 24 (22 / 2) |
| ask + deny Actions assigned to a group | 16,689 |
| Sessions with at least one ask or deny Action | 647 |
| `computeAdoption` wall time | 455 ms |

The four figures the adoption review shows on screen and that this file locks: **evaluated 34,490, ask 48.3%, deny 20 (0.06%), 24 Adoption Groups**.
The web renders shares with one decimal, so the deny tile reads `0.1%`; the count 20 is the exact figure.

### Why the ask share is what it is

The ask share is a property of this Policy on this corpus and is reported as-is.

- 11,228 of the 16,689 ask and deny Actions (67.3%) match no Rule and fall to the default `ask`.
  The default template allows read, write, and commit only in `workspace` and execute only in `workspace` with `full` or `partial` analyzability; every read, write, or execute outside the Action's workspace root is `host` and asks.
- `cd` into a directory outside the workspace root is classified as a `read` Operation on that path and is the deciding Operation of 1,255 Actions (7.5% of ask and deny), the second largest program in the `ask · read · host` group after `cat`.
  Sibling worktrees and the supervisor's home are outside every Session's workspace root in this corpus (`docs/evidence/replay-limitations.md`).
- 5,198 Actions (31.1%) are in `ask · execute · host`, decided by `ask_unanalyzable`; 4,886 of them have analyzability `none`, an `execute` whose effect could not be determined.
- The remaining Rule matches are small: `ask_irreversible_local` 125, `ask_external_disclosure` 95, `ask_agent_config_change` 23, `deny_credentials_access` 13, `deny_shared_history_rewrite` 7.
- A command named by a path, or a shell given a script file, is `execute` on that file with analyzability `partial`, so `allow_workspace_execute` allows a script inside the workspace without reading it.
  That part of the allow share is auto-allow from wider recognition, not a conservative recovery; the change note under "Previous version" gives the count.

The default template was not changed to move this number, and the none rate is not a classifier target.
An organization that wants the share to drop declares more of its environment (workspace roots, trusted remotes) or adds Rules; that is a Policy change reviewed in a Change Review.

### Adoption Groups

Groups are `[effect, capability, zone]` (ADR-0010), in review order (deny first, then ask by Action count).
The share column is of the 16,689 ask and deny Actions.
Programs are masked as in the previous rounds: non-standard programs as `<local-tool-NN>`, MCP tools as `<mcp-tool-NN>`.

| # | effect | capability | zone | deciding rule | actions | sessions | share | none | distinct programs | top programs |
| ---: | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | deny | read | credentials | deny_credentials_access | 13 | 10 | 0.1% | 0 | 4 | grep 6, ls 4, gh 2, Read 1 |
| 2 | deny | rewrite | public_remote | deny_shared_history_rewrite | 7 | 5 | 0.0% | 0 | 1 | git 7 |
| 3 | ask | read | host | none (default ask) | 6,618 | 381 | 39.7% | 0 | 27 | cat 1,389, cd 1,255, ls 1,183, grep 669 |
| 4 | ask | execute | host | ask_unanalyzable | 5,198 | 611 | 31.1% | 4,886 | 119 | python3 2,081, <local-tool-02> 660, node 511, StructuredOutput 457 |
| 5 | ask | write | host | none (default ask) | 3,099 | 365 | 18.6% | 0 | 41 | cat 775, echo 592, mkdir 422, Write 217 |
| 6 | ask | read | agent_config | none (default ask) | 474 | 179 | 2.8% | 0 | 17 | cat 135, Read 125, sed 77, grep 50 |
| 7 | ask | fetch | public_remote | none (default ask) | 387 | 108 | 2.3% | 0 | 2 | gh 197, git 190 |
| 8 | ask | fetch | unknown_remote | none (default ask) | 234 | 86 | 1.4% | 0 | 5 | git 102, gh 55, WebFetch 34, curl 31 |
| 9 | ask | fetch | protected | none (default ask) | 153 | 19 | 0.9% | 0 | 1 | gh 153 |
| 10 | ask | delete | workspace | none (default ask) | 147 | 95 | 0.9% | 0 | 4 | rm 127, git 17, find 2, rmdir 1 |
| 11 | ask | delete | host | ask_irreversible_local | 105 | 63 | 0.6% | 0 | 2 | rm 103, rmdir 2 |
| 12 | ask | push | public_remote | ask_external_disclosure | 90 | 74 | 0.5% | 0 | 1 | git 90 |
| 13 | ask | execute | unknown_remote | none (default ask) | 60 | 14 | 0.4% | 0 | 17 | <mcp-tool-03> 6, <mcp-tool-04> 6, <mcp-tool-02> 6, <mcp-tool-01> 6 |
| 14 | ask | fetch | host | none (default ask) | 38 | 23 | 0.2% | 0 | 1 | git 38 |
| 15 | ask | write | agent_config | ask_agent_config_change | 21 | 11 | 0.1% | 0 | 8 | Write 7, Edit 5, cat 2, ln 2 |
| 16 | ask | rewrite | workspace | ask_irreversible_local | 20 | 17 | 0.1% | 0 | 1 | git 20 |
| 17 | ask | send | protected | none (default ask) | 7 | 1 | 0.0% | 0 | 1 | gh 7 |
| 18 | ask | install | unknown_remote | none (default ask) | 4 | 2 | 0.0% | 0 | 2 | brew 3, npm 1 |
| 19 | ask | push | protected | none (default ask) | 3 | 3 | 0.0% | 0 | 2 | git 2, gh 1 |
| 20 | ask | execute | trusted_remote | none (default ask) | 3 | 2 | 0.0% | 0 | 1 | npm 3 |
| 21 | ask | send | unknown_remote | ask_external_disclosure | 3 | 1 | 0.0% | 0 | 1 | curl 3 |
| 22 | ask | send | public_remote | ask_external_disclosure | 2 | 2 | 0.0% | 0 | 1 | gh 2 |
| 23 | ask | delete | agent_config | ask_agent_config_change | 2 | 1 | 0.0% | 0 | 1 | rm 2 |
| 24 | ask | commit | agent_config | none (default ask) | 1 | 1 | 0.0% | 0 | 1 | git 1 |

- Group sizes: 1,000+ Actions 3 groups, 100 to 999 6, 20 to 99 5, 5 to 19 3, 2 to 4 6, single Action 1.
  The largest group holds 39.7% of ask and deny Actions, the top 4 hold 92.2%, the top 11 hold 99%.
- Every group has exactly one deciding Rule (the default `ask` counted as one); no group mixes Rules.
- Distinct programs per group: 119, 41, 27, 17, 17, 8, 5, 4, 4, 2, 2, 2, 2, then 1 in the remaining 11 groups.
  The Program Summary inside each group is what makes an `expected` Verdict on `ask · execute · host` a decision about 119 programs rather than about a key.
- Review units: 24 Verdicts, one per group, to open the gate.

### Determinism and consistency with the Change Review baseline

- Two `computeAdoption` runs over the same snapshot gave the same `resultHash` `5a3edb5d37fbd0497b79bf9b167a684d854d510fc0689a42e2099ba7b0abc58b` (455 ms and 451 ms).
- Two server runs over the imported Actions gave the same `resultHash` `5a3edb5d37fbd0497b79bf9b167a684d854d510fc0689a42e2099ba7b0abc58b`, equal to the local value.
- The preview agrees with the Gate 2 A vs B replay on the same classifier: allow→allow 17,801 = allow; ask→allow 169 + ask→ask 16,500 = 16,669 = ask; deny→deny 20 = deny; evaluated 34,490 and excluded 450 in both (`docs/evidence/gate2-replay.md`).
- The `resultHash` covers stats, the groups in group-key order (Program Summary included, Headline excluded), and the (actionKey, groupKey, effect) assignments in action-key order.

### Scripted fresh-volume journey

`pnpm evidence:remeasure` runs the twelve steps against the API of a compose project of its own with an empty volume, a server built from the working tree, and the frozen spool copies, then removes the project and its volume.
Every check below is asserted by the command; a failed check stops it before any document is written.
It reads what the server returns, not what the screens render; the screen checks stay in the re-run procedure below.

| step | via | result |
| --- | --- | --- |
| 1 import | `authority import` | 1,036 sessions, 34,940 accepted, 196 duplicates, 0 failed |
| 2 overview, no Policy | activity overview | no Policy; Action 34,940, evaluable 34,490; analyzability 17,980 / 10,044 / 6,466 |
| 3 first Policy | policy version | draft version 1 from the default template replaced with policy A (content hash `f96ed41d…beb8`), validation passed |
| 4 adoption preview | change review, replay run | kind `adoption`, no baseline; evaluated 34,490; allow 17,801, ask 16,669, deny 20; 22 ask and 2 deny groups; stats and group keys equal the local computation; resultHash `5a3edb5d…c58b` on two runs |
| 5 group detail | adoption group samples | `deny · read · credentials` and `ask · read · host` return a Headline and samples |
| 6 verdicts | verdicts | 24 groups set to `expected`; `adoption_unreviewed` blocks the gate until the last one, then the gate opens |
| 7 adopt | decision | review `accepted`, version 1 `accepted` |
| 8 report | Evidence Report | adoption Evidence Report carries resultHash `5a3edb5d…c58b` |
| 9 conformance | `authority spool-flush`, replay run | 2 spool copies sent; conformance run for version 1 completed with 87 findings, resultHash `269a53d2…dd23` |
| 10 change review B' | policy version, change review | draft version 2 with B' (`ebea9a23…0cc9`), kind `change`, baseline version 1; changed 169, Widening group 7; resultHash `092e356e…18c7` equals the local Gate 2 run |
| 11 unexpected, reject, B, accept | verdicts, decisions | 5 groups `expected`, 2 `unexpected` → `widening_unexpected` blocks and accept is refused; rejected; draft version 3 with B (`45197245…6515`): changed 169, Widening group 5, resultHash `746dd77f…0d11` equals the local Gate 2 run; all `expected` → accepted |
| 12 audit | `authority verify-audit` | intact, 3 decision records |

### Fresh-volume journey re-run

The scripted API journey above is the re-run on this classifier. The twelve-screen browser pass was not repeated; its recorded table is under Previous version.

The four figures match the measurement above: evaluated 34,490, ask 48.3%, deny 20 (rendered 0.1%), 24 Adoption Groups.
Server and local agreement: the adoption run on the server gave the local `resultHash` `5a3edb5d…c58b`.

Findings from this run (none blocks the journey):

- After "token 저장" on `/login`, the header now shows "로그아웃" without a reload; the 0.2.3 finding on this is resolved.
- The deny share renders as `0.1%` because tiles show one decimal; the count 20 is exact.

### Re-run procedure (fresh volume)

`pnpm evidence:remeasure` reruns the four Gate 2 comparisons, the adoption preview, and the policy A conformance run on the frozen snapshot, runs the twelve steps through the API (see "Scripted fresh-volume journey"), and rewrites the stamps and the measured blocks (`<!-- remeasure:<name> -->`) of `gate2-replay.md`, this file, `conformance.md`, and the README numbers table.
It reads `.local/evidence-remeasure.json` (`--config` for another file): `snapshot`, `snapshotDate`, `policies` (`A`, `B`, `B'`, `P`, `P'`), `spool` (the cut spool copies), `conformanceWindow`, and `legend`, the private map from real program, repository, and host names to their masked labels; a name missing from the legend gets the next label of its kind.
Prose outside the blocks is left to people.
When the classifier version changed, the command first moves each document's main sections under a new "Previous version" section and prints the prose lines with numbers to re-check.
Raw results, the adoption Evidence Report, and the compose file go to `.local/remeasure/<time>/`.

The scripted API journey is the measurement. A browser pass over the screens is optional and was not repeated.
The adoption stage comes first; the change-review stage is the Gate 3 journey unchanged.

Stack: a compose project of its own with an empty volume and its own ports, built from the commit under test; the maintainer's running stack is not used.
The web app runs from `apps/web` with `/api` proxied to that server.
Commands below omit the corpus and policy file paths; they live under `.local/` and never enter the repository.

Adoption stage:

1. `pnpm authority import <snapshot>` into the fresh stack. Expected: 1,036 sessions, 34,940 accepted, 196 duplicates, 0 failed.
2. `/` with no Policy shows the Activity Overview (Sessions, Actions, evaluable Actions, analyzability, Capability and Target Kind tables, top programs, remote hosts) and "아직 조직 정책이 없습니다".
3. "첫 조직 정책 만들기" opens draft version 1 (default template). Replace the document with policy A, "draft 저장" (the content hash becomes `f96ed41d…beb8`), "검증" reads "검증: 통과".
4. "최초 도입 검토 만들기". The review is kind `adoption`, "기준 VERSION 없음 (최초 도입)". Confirm on the review and on `/` ("도입 preview"): evaluated 34,490; 허용 17,801 (51.6%); 확인 필요 16,669 (48.3%); 차단 20 (the tile rounds to 0.1%); "확인 필요 group (22)", "차단 group (2)".
5. Open one deny group and one ask group: the Headline, the Program Summary, and the Target Summary are outside the sample panel; command text, paths, and ruleId are only inside the sample panel and the "기술 세부" toggle.
6. Set every one of the 24 groups to 의도한 제한. "Gate: 열림" appears only after the last one; before that the blocker reads "판정하지 않은 group N개" and "최초 정책 채택" is disabled.
7. Enter a reviewer name and "최초 정책 채택". The decision record appears, version 1 is `accepted`, the verdict controls are disabled, and no screen says 적용됨, 활성, or enforced. `/` now shows "채택된 정책: version #1" with the Effect distribution.
8. Download the Evidence Report: policy hash, window, scale, allow/ask/deny counts and shares, the two group tables with Verdicts, the decision, the Decision Record hash, the notice that the figures apply the Policy to past behavior and do not recover past runtime approvals. No path or command text in it.

Change-review stage (the Gate 3 journey, unchanged): from the accepted version 1 make draft version 2 with B', "변경 검토 만들기", then Gate 3 items 3 to 7 (the two `unknown_remote → trusted_remote` groups critical with a self-explaining Headline; no path, fragment, or ruleId outside the sample panel; unexpected locks accept with blocker copy; reject, edit to B, accept; the downloaded report carries both content hashes, inputsHash, resultHash, the audit tail, the `none` share, and the Operation section; `pnpm authority verify-audit` intact).

Conformance stage: copy the hook spool files into a scratch home, `spool-flush` them to the fresh server, request a `conformance` run for the accepted version over the observation window, and read `/conformance`.

Tear the stack down with `down -v` when done.

## Previous version: classifier 0.2.4 (not re-run)

The section below is the adoption preview as measured on classifier 0.2.4, policy A, on 2026-09-24, including the browser pass over the screens, and is kept as the record of that measurement.
Its `resultHash` values are not comparable with the 0.2.5 values above.

### Change from classifier 0.2.4

| measure | 0.2.4 | 0.2.5 |
| --- | ---: | ---: |
| allow | 17,509 (50.8%) | 17,801 (51.6%) |
| ask | 16,961 (49.2%) | 16,669 (48.3%) |
| deny | 20 | 20 |
| analyzability full / partial / none (Action) | 17,980 / 9,662 / 6,848 | 17,980 / 10,044 / 6,466 |
| Adoption Groups (ask / deny) | 24 (22 / 2) | 24 (22 / 2) |
| allowed `execute · workspace` Actions | 2,918 | 3,020 |
| allowed `read · workspace` Actions | 12,568 | 12,758 |
| `ask · execute · host` Actions | 5,505 | 5,198 |
| `ask · read · host` Actions | 6,611 | 6,618 |
| `ask · fetch · protected` Actions | 149 | 153 |
| A vs B changed Actions | 166 | 169 |
| server and local `resultHash` | equal | equal |

Classifier 0.2.5 classifies tmux read-only query subcommands as `read` with analyzability `partial`.
382 Actions leave `none`. 292 move from ask to allow, and no Action moves to a stricter Effect.
Allowed `read · workspace` Actions rise by 190; allowed `execute · workspace` Actions rise by 102.
`ask · execute · host` falls by 307; 90 Actions leave `none` and still ask.

The adoption preview applies one candidate Policy Version to the recorded Actions with no baseline and asks which Effect each Action would receive (ADR-0010).
Every number in the main sections below is labelled **classifier 0.2.4, policy A** (measured 2026-09-24).
No repository names, host paths, or raw command text appear below; non-standard programs are masked as `<local-tool-NN>` and MCP tools as `<mcp-tool-NN>`.

Judge: Agent. No person has recorded a Verdict on these groups.
Journey grade: **medium** (중): real-record Adoption Groups were reviewable and the preview matched the expected shape; nothing stronger is claimed.

### Result

The candidate is policy A: the default template's Rules with the corrected environment profile (credential paths 5, agent-config paths 4, trusted remotes 35, public remotes 40, protected branches 3, production markers 3).
Actions are built the same way the server builds them for a replay (transcript parse, remote enrichment, classifier 0.2.4, duplicate Action Keys removed) and evaluated with `computeAdoption` from `@authority/replay/diff`.

| item | value |
| --- | ---: |
| Sessions | 1,036 |
| Actions (after dedupe) | 34,940 (196 duplicates) |
| evaluated | 34,490 |
| excluded (no Operation) | 450 |
| allow | 17,509 (50.8%) |
| ask | 16,961 (49.2%) |
| deny | 20 (0.06%) |
| analyzability full / partial / none (Action) | 17,980 / 9,662 / 6,848 |
| Capability × Zone × Effect cells | 30 |
| Adoption Groups (ask / deny) | 24 (22 / 2) |
| ask + deny Actions assigned to a group | 16,981 |
| Sessions with at least one ask or deny Action | 647 |
| `computeAdoption` wall time | 468 ms |

The four figures the adoption review shows on screen and that this file locks: **evaluated 34,490, ask 49.2%, deny 20 (0.06%), 24 Adoption Groups**.
The web renders shares with one decimal, so the deny tile reads `0.1%`; the count 20 is the exact figure.

### Why the ask share is what it is

The ask share is a property of this Policy on this corpus and is reported as-is.

- 11,213 of the 16,981 ask and deny Actions (66.0%) match no Rule and fall to the default `ask`.
  The default template allows read, write, and commit only in `workspace` and execute only in `workspace` with `full` or `partial` analyzability; every read, write, or execute outside the Action's workspace root is `host` and asks.
- `cd` into a directory outside the workspace root is classified as a `read` Operation on that path and is the deciding Operation of 1,255 Actions (7.4% of ask and deny), the second largest program in the `ask · read · host` group after `cat`.
  Sibling worktrees and the supervisor's home are outside every Session's workspace root in this corpus (`docs/evidence/replay-limitations.md`).
- 5,505 Actions (32.4%) are in `ask · execute · host`, decided by `ask_unanalyzable`; 5,195 of them have analyzability `none`, an `execute` whose effect could not be determined.
- The remaining Rule matches are small: `ask_irreversible_local` 125, `ask_external_disclosure` 95, `ask_agent_config_change` 23, `deny_credentials_access` 13, `deny_shared_history_rewrite` 7.
- A command named by a path, or a shell given a script file, is `execute` on that file with analyzability `partial`, so `allow_workspace_execute` allows a script inside the workspace without reading it.
  That part of the allow share is auto-allow from wider recognition, not a conservative recovery; the change note under "Previous version" gives the count.

The default template was not changed to move this number, and the none rate is not a classifier target.
An organization that wants the share to drop declares more of its environment (workspace roots, trusted remotes) or adds Rules; that is a Policy change reviewed in a Change Review.

### Adoption Groups

Groups are `[effect, capability, zone]` (ADR-0010), in review order (deny first, then ask by Action count).
The share column is of the 16,981 ask and deny Actions.
Programs are masked as in the previous rounds: non-standard programs as `<local-tool-NN>`, MCP tools as `<mcp-tool-NN>`.

| # | effect | capability | zone | deciding rule | actions | sessions | share | none | distinct programs | top programs |
| ---: | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | deny | read | credentials | deny_credentials_access | 13 | 10 | 0.1% | 0 | 4 | grep 6, ls 4, gh 2, Read 1 |
| 2 | deny | rewrite | public_remote | deny_shared_history_rewrite | 7 | 5 | 0.0% | 0 | 1 | git 7 |
| 3 | ask | read | host | none (default ask) | 6,611 | 381 | 38.9% | 0 | 27 | cat 1,389, cd 1,255, ls 1,180, grep 668 |
| 4 | ask | execute | host | ask_unanalyzable | 5,505 | 611 | 32.4% | 5,195 | 119 | python3 2,080, <local-tool-02> 660, node 511, StructuredOutput 457 |
| 5 | ask | write | host | none (default ask) | 3,099 | 365 | 18.2% | 0 | 41 | cat 775, echo 592, mkdir 422, Write 217 |
| 6 | ask | read | agent_config | none (default ask) | 473 | 179 | 2.8% | 0 | 17 | cat 135, Read 125, sed 77, grep 50 |
| 7 | ask | fetch | public_remote | none (default ask) | 387 | 108 | 2.3% | 0 | 2 | gh 197, git 190 |
| 8 | ask | fetch | unknown_remote | none (default ask) | 231 | 86 | 1.4% | 0 | 5 | git 99, gh 55, WebFetch 34, curl 31 |
| 9 | ask | fetch | protected | none (default ask) | 149 | 19 | 0.9% | 0 | 1 | gh 149 |
| 10 | ask | delete | workspace | none (default ask) | 147 | 95 | 0.9% | 0 | 4 | rm 127, git 17, find 2, rmdir 1 |
| 11 | ask | delete | host | ask_irreversible_local | 105 | 63 | 0.6% | 0 | 2 | rm 103, rmdir 2 |
| 12 | ask | push | public_remote | ask_external_disclosure | 90 | 74 | 0.5% | 0 | 1 | git 90 |
| 13 | ask | execute | unknown_remote | none (default ask) | 60 | 14 | 0.4% | 0 | 17 | <mcp-tool-03> 6, <mcp-tool-04> 6, <mcp-tool-02> 6, <mcp-tool-01> 6 |
| 14 | ask | fetch | host | none (default ask) | 38 | 23 | 0.2% | 0 | 1 | git 38 |
| 15 | ask | write | agent_config | ask_agent_config_change | 21 | 11 | 0.1% | 0 | 8 | Write 7, Edit 5, cat 2, ln 2 |
| 16 | ask | rewrite | workspace | ask_irreversible_local | 20 | 17 | 0.1% | 0 | 1 | git 20 |
| 17 | ask | send | protected | none (default ask) | 7 | 1 | 0.0% | 0 | 1 | gh 7 |
| 18 | ask | install | unknown_remote | none (default ask) | 4 | 2 | 0.0% | 0 | 2 | brew 3, npm 1 |
| 19 | ask | push | protected | none (default ask) | 3 | 3 | 0.0% | 0 | 2 | git 2, gh 1 |
| 20 | ask | execute | trusted_remote | none (default ask) | 3 | 2 | 0.0% | 0 | 1 | npm 3 |
| 21 | ask | send | unknown_remote | ask_external_disclosure | 3 | 1 | 0.0% | 0 | 1 | curl 3 |
| 22 | ask | send | public_remote | ask_external_disclosure | 2 | 2 | 0.0% | 0 | 1 | gh 2 |
| 23 | ask | delete | agent_config | ask_agent_config_change | 2 | 1 | 0.0% | 0 | 1 | rm 2 |
| 24 | ask | commit | agent_config | none (default ask) | 1 | 1 | 0.0% | 0 | 1 | git 1 |

- Group sizes: 1,000+ Actions 3 groups, 100 to 999 6, 20 to 99 5, 5 to 19 3, 2 to 4 6, single Action 1.
  The largest group holds 38.9% of ask and deny Actions, the top 4 hold 92.4%, the top 11 hold 99%.
- Every group has exactly one deciding Rule (the default `ask` counted as one); no group mixes Rules.
- Distinct programs per group: 119, 41, 27, 17, 17, 8, 5, 4, 4, 2, 2, 2, 2, then 1 in the remaining 11 groups.
  The Program Summary inside each group is what makes an `expected` Verdict on `ask · execute · host` a decision about 119 programs rather than about a key.
- Review units: 24 Verdicts, one per group, to open the gate.

### Determinism and consistency with the Change Review baseline

- Two `computeAdoption` runs over the same snapshot gave the same `resultHash` `481ba37ee4dd075febe94f034325821106e71072c83fa419c39178f85fb54568` (468 ms and 479 ms).
- Two server runs over the imported Actions gave the same `resultHash` `481ba37ee4dd075febe94f034325821106e71072c83fa419c39178f85fb54568`, equal to the local value.
- The preview agrees with the Gate 2 A vs B replay on the same classifier: allow→allow 17,509 = allow; ask→allow 166 + ask→ask 16,795 = 16,961 = ask; deny→deny 20 = deny; evaluated 34,490 and excluded 450 in both (`docs/evidence/gate2-replay.md`).
- The `resultHash` covers stats, the groups in group-key order (Program Summary included, Headline excluded), and the (actionKey, groupKey, effect) assignments in action-key order.

### Scripted fresh-volume journey

`pnpm evidence:remeasure` runs the twelve steps against the API of a compose project of its own with an empty volume, a server built from the working tree, and the frozen spool copies, then removes the project and its volume.
Every check below is asserted by the command; a failed check stops it before any document is written.
It reads what the server returns, not what the screens render; the screen checks stay in the re-run procedure below.

| step | via | result |
| --- | --- | --- |
| 1 import | `authority import` | 1,036 sessions, 34,940 accepted, 196 duplicates, 0 failed |
| 2 overview, no Policy | activity overview | no Policy; Action 34,940, evaluable 34,490; analyzability 17,980 / 9,662 / 6,848 |
| 3 first Policy | policy version | draft version 1 from the default template replaced with policy A (content hash `f96ed41d…beb8`), validation passed |
| 4 adoption preview | change review, replay run | kind `adoption`, no baseline; evaluated 34,490; allow 17,509, ask 16,961, deny 20; 22 ask and 2 deny groups; stats and group keys equal the local computation; resultHash `481ba37e…4568` on two runs |
| 5 group detail | adoption group samples | `deny · read · credentials` and `ask · read · host` return a Headline and samples |
| 6 verdicts | verdicts | 24 groups set to `expected`; `adoption_unreviewed` blocks the gate until the last one, then the gate opens |
| 7 adopt | decision | review `accepted`, version 1 `accepted` |
| 8 report | Evidence Report | adoption Evidence Report carries resultHash `481ba37e…4568` |
| 9 conformance | `authority spool-flush`, replay run | 2 spool copies sent; conformance run for version 1 completed with 87 findings, resultHash `269a53d2…dd23` |
| 10 change review B' | policy version, change review | draft version 2 with B' (`ebea9a23…0cc9`), kind `change`, baseline version 1; changed 166, Widening group 7; resultHash `3993dfe0…2783` equals the local Gate 2 run |
| 11 unexpected, reject, B, accept | verdicts, decisions | 5 groups `expected`, 2 `unexpected` → `widening_unexpected` blocks and accept is refused; rejected; draft version 3 with B (`45197245…6515`): changed 166, Widening group 5, resultHash `6a84292d…8d3f` equals the local Gate 2 run; all `expected` → accepted |
| 12 audit | `authority verify-audit` | intact, 3 decision records |

### Fresh-volume journey re-run

Run on 2026-09-24 on a compose project of its own with an empty volume and its own ports, server image built from the working tree that carries classifier 0.2.4, and the web app served from `apps/web` against that server.
The maintainer's stack was not used.
Judge: Agent; every Verdict below was given by an Agent through the web controls, and the loop time is Agent tool latency, not a person's reading time.

| step | screen | result |
| --- | --- | --- |
| 1 import | CLI | 1,036 sessions, 34,940 accepted, 196 duplicates, 0 failed |
| 2 overview, no Policy | `/` | Session 665 (30-day window), Action 34,940, evaluable 34,490; analyzability 17,980 / 9,662 / 6,848 (52.1% / 28.0% / 19.9%); Capability, Target Kind, top program, and remote host tables; "<!-- ko-product-output -->아직 조직 정책이 없습니다" with "<!-- ko-product-output -->첫 조직 정책 만들기". No repository name on the screen |
| 3 first Policy | version editor | draft version 1 from the default template; document replaced with policy A (content hash `f96ed41d…beb8`), "draft <!-- ko-product-output -->저장", "<!-- ko-product-output -->검증: <!-- ko-product-output -->통과" |
| 4 adoption preview | review, `/` | review kind `adoption`, "<!-- ko-product-output -->기준 VERSION <!-- ko-product-output -->없음 (<!-- ko-product-output -->최초 도입)", "<!-- ko-product-output -->판정 대기"; <!-- ko-product-output -->평가한 action 34490 (<!-- ko-product-output -->전체 34940, <!-- ko-product-output -->제외 450); tiles <!-- ko-product-output -->허용 17509 50.8%, <!-- ko-product-output -->확인 필요 16961 49.2%, <!-- ko-product-output -->차단 20 0.1%; "<!-- ko-product-output -->확인 필요 group (22)", "<!-- ko-product-output -->차단 group (2)"; the Program count, Action, and Session columns of all 24 rows equal the Adoption Groups table above; `/` "<!-- ko-product-output -->도입 preview" shows the same three tiles |
| 5 group detail | deny `read · credentials`, ask `read · host` | Headlines "<!-- ko-product-output -->자격 증명에서의 읽기 13<!-- ko-product-output -->건이 이 정책에서 '<!-- ko-product-output -->차단' <!-- ko-product-output -->대상이 됩니다." and "<!-- ko-product-output -->호스트에서의 읽기 6611<!-- ko-product-output -->건이 이 정책에서 '<!-- ko-product-output -->확인 필요' <!-- ko-product-output -->대상이 됩니다."; "Program <!-- ko-product-output -->구성: <!-- ko-product-output -->서로 다른 program 4<!-- ko-product-output -->개 / 27<!-- ko-product-output -->개" with the top programs of the table above; outside the sample panel and the "<!-- ko-product-output -->기술 세부" toggle: 0 ruleId, 0 home path (checked on the DOM with those two removed) |
| 6 verdicts | review | 24 selects set to <!-- ko-product-output -->의도한 제한 one by one; the blocker counted down ("<!-- ko-product-output -->판정하지 않은 group 23<!-- ko-product-output -->개" … "1<!-- ko-product-output -->개"), then "Gate: <!-- ko-product-output -->열림 / <!-- ko-product-output -->승인을 막는 blocker<!-- ko-product-output -->가 없습니다."; "<!-- ko-product-output -->최초 정책 채택" stays disabled until a reviewer name is entered |
| 7 adopt | review, `/` | status <!-- ko-product-output -->채택됨, <!-- ko-product-output -->결정 "<!-- ko-product-output -->최초 정책 채택", 24 selects disabled, sentence "<!-- ko-product-output -->채택은 검토 기록입니다. runtime <!-- ko-product-output -->설정 반영은 Authority Diff <!-- ko-product-output -->밖에서 이루어집니다."; no <!-- ko-product-output -->적용됨, <!-- ko-product-output -->활성, or enforced on the screen; version 1 `accepted` via the API. `/` shows "<!-- ko-product-output -->채택된 정책: version #1" with the Effect distribution of the adoption run (<!-- ko-product-output -->허용 17509 50.8%) |
| 8 report | download | "<!-- ko-product-output -->보고서 다운로드" fetches the report route (200); adoption Evidence Report: candidate hash `f96ed41d…beb8`, Replay inputsHash, resultHash `481ba37e…4568`, <!-- ko-product-output -->분석 규모 (34490, none 6848 19.9%), <!-- ko-product-output -->정책 적용 결과 (17509 / 16961 / 20), the two group tables with Verdicts, <!-- ko-product-output -->결정, Audit chain, <!-- ko-product-output -->고지; 0 ruleId, 0 home path |
| 9 conformance | API + `/conformance` | spool copies flushed from a scratch home (2 files sent, 0 failed); `conformance` run for the accepted version 1 completed on classifier 0.2.4 with resultHash `269a53d2…dd23`; `/conformance` lists 87 findings (violation 3 groups / 6 Actions, under_asked 84 / 1,069). Figures in `docs/evidence/conformance.md` |
| 10 change review B' | version 2, review | draft 2 from the accepted version 1, document B' (`ebea9a23…0cc9`), "<!-- ko-product-output -->검증: <!-- ko-product-output -->통과", "<!-- ko-product-output -->변경 검토 만들기"; kind `change`, <!-- ko-product-output -->평가 34490, <!-- ko-product-output -->넓어진 166, widening group 7, transitions allow→allow 17509, ask→allow 166, ask→ask 16795, deny→deny 20; resultHash `3993dfe0…2783` (same as the local Gate 2 value); the seven group rows equal the A vs B' table of `gate2-replay.md`; the two `unknown_remote → trusted_remote` groups critical (git 5 / 2 Sessions, gh 4 / 2), each Headline naming where the fetches went; 0 ruleId, 0 home path outside the sample panel |
| 11 unexpected, reject, B, accept | review, version 3 | 5 groups <!-- ko-product-output -->예상된 변화, the 2 trusted-remote groups <!-- ko-product-output -->예상 밖 → "Gate: blocker 1<!-- ko-product-output -->건 / <!-- ko-product-output -->예상 밖으로 판정된 group 2<!-- ko-product-output -->개. <!-- ko-product-output -->정책을 고쳐 새 review<!-- ko-product-output -->를 만드세요", accept disabled; <!-- ko-product-output -->정책 변경 반려 with a reason → <!-- ko-product-output -->반려됨; draft 3 from version 2 with B (`45197245…6515`) → <!-- ko-product-output -->넓어진 166, group 5 (git 73, WebFetch 34, gh 32, curl 15, WebSearch 12), resultHash `6a84292d…8d3f`; all <!-- ko-product-output -->예상된 변화 → "Gate: <!-- ko-product-output -->열림" → <!-- ko-product-output -->정책 변경 수락 → <!-- ko-product-output -->채택됨. Loop from the first unexpected Verdict to the accept: 73 s (Agent) |
| 12 audit | CLI, `/` | `verify-audit` `{"isIntact": true, "checkedCount": 3, "firstBrokenSequence": null}`; the B change report carries both content hashes, inputsHash, resultHash, the `none` share (0 of 166), the Operation section (fetch `unknown_remote → unknown_remote` 200), and audit chain sequence 3; `/` shows "<!-- ko-product-output -->채택된 정책: version #3" with the Effect distribution of the version 3 run (<!-- ko-product-output -->허용 17675 51.2%, <!-- ko-product-output -->확인 필요 16795 48.7%, <!-- ko-product-output -->차단 20) |

The four figures match the measurement above: evaluated 34,490, ask 49.2%, deny 20 (rendered 0.1%), 24 Adoption Groups.
Server and local agreement: the adoption run on the server gave the local `resultHash` `481ba37e…4568`.

Findings from this run (none blocks the journey):

- After "token <!-- ko-product-output -->저장" on `/login`, the header now shows "<!-- ko-product-output -->로그아웃" without a reload; the 0.2.3 finding on this is resolved.
- The deny share renders as `0.1%` because tiles show one decimal; the count 20 is exact.

### Re-run procedure (fresh volume)

`pnpm evidence:remeasure` reruns the four Gate 2 comparisons, the adoption preview, and the policy A conformance run on the frozen snapshot, runs the twelve steps through the API (see "Scripted fresh-volume journey"), and rewrites the stamps and the measured blocks (`<!-- remeasure:<name> -->`) of `gate2-replay.md`, this file, `conformance.md`, and the README numbers table.
It reads `.local/evidence-remeasure.json` (`--config` for another file): `snapshot`, `snapshotDate`, `policies` (`A`, `B`, `B'`, `P`, `P'`), `spool` (the cut spool copies), `conformanceWindow`, and `legend`, the private map from real program, repository, and host names to their masked labels; a name missing from the legend gets the next label of its kind.
Prose outside the blocks is left to people.
When the classifier version changed, the command first moves each document's main sections under a new "Previous version" section and prints the prose lines with numbers to re-check.
Raw results, the adoption Evidence Report, and the compose file go to `.local/remeasure/<time>/`.

The browser run below also checks the screens.
The adoption stage comes first; the change-review stage is the Gate 3 journey unchanged.

Stack: a compose project of its own with an empty volume and its own ports, built from the commit under test; the maintainer's running stack is not used.
The web app runs from `apps/web` with `/api` proxied to that server.
Commands below omit the corpus and policy file paths; they live under `.local/` and never enter the repository.

Adoption stage:

1. `pnpm authority import <snapshot>` into the fresh stack. Expected: 1,036 sessions, 34,940 accepted, 196 duplicates, 0 failed.
2. `/` with no Policy shows the Activity Overview (Sessions, Actions, evaluable Actions, analyzability, Capability and Target Kind tables, top programs, remote hosts) and "<!-- ko-product-output -->아직 조직 정책이 없습니다".
3. "<!-- ko-product-output -->첫 조직 정책 만들기" opens draft version 1 (default template). Replace the document with policy A, "draft <!-- ko-product-output -->저장" (the content hash becomes `f96ed41d…beb8`), "<!-- ko-product-output -->검증" reads "<!-- ko-product-output -->검증: <!-- ko-product-output -->통과".
4. "<!-- ko-product-output -->최초 도입 검토 만들기". The review is kind `adoption`, "<!-- ko-product-output -->기준 VERSION <!-- ko-product-output -->없음 (<!-- ko-product-output -->최초 도입)". Confirm on the review and on `/` ("<!-- ko-product-output -->도입 preview"): evaluated 34,490; <!-- ko-product-output -->허용 17,509 (50.8%); <!-- ko-product-output -->확인 필요 16,961 (49.2%); <!-- ko-product-output -->차단 20 (the tile rounds to 0.1%); "<!-- ko-product-output -->확인 필요 group (22)", "<!-- ko-product-output -->차단 group (2)".
5. Open one deny group and one ask group: the Headline, the Program Summary, and the Target Summary are outside the sample panel; command text, paths, and ruleId are only inside the sample panel and the "<!-- ko-product-output -->기술 세부" toggle.
6. Set every one of the 24 groups to <!-- ko-product-output -->의도한 제한. "Gate: <!-- ko-product-output -->열림" appears only after the last one; before that the blocker reads "<!-- ko-product-output -->판정하지 않은 group N<!-- ko-product-output -->개" and "<!-- ko-product-output -->최초 정책 채택" is disabled.
7. Enter a reviewer name and "<!-- ko-product-output -->최초 정책 채택". The decision record appears, version 1 is `accepted`, the verdict controls are disabled, and no screen says <!-- ko-product-output -->적용됨, <!-- ko-product-output -->활성, or enforced. `/` now shows "<!-- ko-product-output -->채택된 정책: version #1" with the Effect distribution.
8. Download the Evidence Report: policy hash, window, scale, allow/ask/deny counts and shares, the two group tables with Verdicts, the decision, the Decision Record hash, the notice that the figures apply the Policy to past behavior and do not recover past runtime approvals. No path or command text in it.

Change-review stage (the Gate 3 journey, unchanged): from the accepted version 1 make draft version 2 with B', "<!-- ko-product-output -->변경 검토 만들기", then Gate 3 items 3 to 7 (the two `unknown_remote → trusted_remote` groups critical with a self-explaining Headline; no path, fragment, or ruleId outside the sample panel; unexpected locks accept with blocker copy; reject, edit to B, accept; the downloaded report carries both content hashes, inputsHash, resultHash, the audit tail, the `none` share, and the Operation section; `pnpm authority verify-audit` intact).

Conformance stage: copy the hook spool files into a scratch home, `spool-flush` them to the fresh server, request a `conformance` run for the accepted version over the observation window, and read `/conformance`.

Tear the stack down with `down -v` when done.

## Previous version: classifier 0.2.3 (not re-run)

The section below is the adoption preview as measured on classifier 0.2.3, policy A, on 2026-09-24, including the browser pass over the screens, and is kept as the record of that measurement.
Its `resultHash` values are not comparable with the 0.2.4 values above.
No repository names, host paths, or raw command text appear below; non-standard programs are masked as `<local-tool-NN>` and MCP tools as `<mcp-tool-NN>`.

Judge: Agent. No person has recorded a Verdict on these groups.
Journey grade: **medium**: real-record Adoption Groups were reviewable and the preview matched the expected shape; nothing stronger is claimed.

### Change from classifier 0.2.3

| measure | 0.2.3 | 0.2.4 |
| --- | ---: | ---: |
| allow | 15,242 (44.2%) | 17,509 (50.8%) |
| ask | 19,228 (55.7%) | 16,961 (49.2%) |
| deny | 20 | 20 |
| analyzability full / partial / none (Action) | 17,972 / 6,610 / 9,908 | 17,980 / 9,662 / 6,848 |
| Adoption Groups (ask / deny) | 24 (22 / 2) | 24 (22 / 2) |
| allowed `execute · workspace` Actions | 927 | 2,918 |
| allowed `read · workspace` Actions | 12,296 | 12,568 |
| `ask · execute · host` Actions | 8,048 | 5,505 |
| `ask · read · host` Actions | 6,458 | 6,611 |
| `ask · fetch · protected` Actions | 77 | 149 |
| server and local `resultHash` | equal | equal |

Classifier 0.2.4 classifies a command named by a path, and a shell given a script file, as `execute` on that file with analyzability `partial`, and `command -v`/`-V` as a `read` of the working directory (`docs/evidence/classifier-hardening-4.md`).
Of the 3,060 Actions that leave `none`, 2,267 move from ask to allow, and no Action moves to a stricter Effect.
Allowed `execute · workspace` Actions rise by 1,991: workspace-internal scripts that `allow_workspace_execute` now allows.
The other 276 are Actions whose remaining Operations are workspace reads and writes that `allow_workspace_edit` already allowed.
The rule does not read the script, so its effect is still unknown; the rise is auto-allow from wider recognition, not a conservative recovery.
The 793 Actions that leave `none` and still ask move from `ask · execute · host` to the group of their next asking Operation, such as `ask · read · host` and `ask · fetch · protected`.

### Result

The candidate is policy A: the default template's Rules with the corrected environment profile (credential paths 5, agent-config paths 4, trusted remotes 35, public remotes 40, protected branches 3, production markers 3).
Actions are built the same way the server builds them for a replay (transcript parse, remote enrichment, classifier 0.2.3, duplicate Action Keys removed) and evaluated with `computeAdoption` from `@authority/replay/diff`.

| item | value |
| --- | ---: |
| Sessions | 1,036 |
| Actions (after dedupe) | 34,940 (196 duplicates) |
| evaluated | 34,490 |
| excluded (no Operation) | 450 |
| allow | 15,242 (44.2%) |
| ask | 19,228 (55.7%) |
| deny | 20 (0.06%) |
| analyzability full / partial / none (Action) | 17,972 / 6,610 / 9,908 |
| Capability × Zone × Effect cells | 30 |
| Adoption Groups (ask / deny) | 24 (22 / 2) |
| ask + deny Actions assigned to a group | 19,248 |
| Sessions with at least one ask or deny Action | 647 |
| `computeAdoption` wall time | 443 ms |

The four figures the adoption review shows on screen and that this file locks: **evaluated 34,490, ask 55.7%, deny 20 (0.06%), 24 Adoption Groups**.
The web renders shares with one decimal, so the deny tile reads `0.1%`; the count 20 is the exact figure.

### Why the ask share is what it is

The ask share is a property of this Policy on this corpus and is reported as-is.

- 10,936 of the 19,248 ask and deny Actions (56.8%) match no Rule and fall to the default `ask`.
  The default template allows read, write, and commit only in `workspace` and execute only in `workspace` with `full` or `partial` analyzability; every read, write, or execute outside the Action's workspace root is `host` and asks.
- `cd` into a directory outside the workspace root is classified as a `read` Operation on that path and is the deciding Operation of 1,190 Actions (6.2% of ask and deny), the second largest program in the `ask · read · host` group after `cat`.
  Sibling worktrees and the supervisor's home are outside every Session's workspace root in this corpus (`docs/evidence/replay-limitations.md`).
- 8,048 Actions (41.8%) are `execute` of a program whose effect could not be determined; `ask_unanalyzable` asks by Rule.
- The remaining Rule matches are small: `ask_irreversible_local` 125, `ask_external_disclosure` 96, `ask_agent_config_change` 23, `deny_credentials_access` 13, `deny_shared_history_rewrite` 7.

Neither the classifier nor the default template was changed to move this number.
An organization that wants the share to drop declares more of its environment (workspace roots, trusted remotes) or adds Rules; that is a Policy change reviewed in a Change Review.

### Adoption Groups

Groups are `[effect, capability, zone]` (ADR-0010), in review order (deny first, then ask by Action count).
The share column is of the 19,248 ask and deny Actions.
Programs are masked as in the previous rounds: non-standard programs as `<local-tool-NN>`, MCP tools as `<mcp-tool-NN>`.

| # | effect | capability | zone | deciding rule | actions | sessions | share | none | distinct programs | top programs |
| ---: | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | deny | read | credentials | deny_credentials_access | 13 | 10 | 0.1% | 0 | 4 | grep 6, ls 4, gh 2, Read 1 |
| 2 | deny | rewrite | public_remote | deny_shared_history_rewrite | 7 | 5 | 0.0% | 0 | 1 | git 7 |
| 3 | ask | execute | host | ask_unanalyzable | 8,048 | 617 | 41.8% | 8,048 | 133 | python3 2,061, <local-tool-01> 1,939, <local-tool-02> 660, node 509 |
| 4 | ask | read | host | none (default ask) | 6,458 | 379 | 33.6% | 0 | 27 | cat 1,386, cd 1,190, ls 1,158, grep 652 |
| 5 | ask | write | host | none (default ask) | 3,073 | 364 | 16.0% | 0 | 35 | cat 766, echo 589, mkdir 422, Write 217 |
| 6 | ask | read | agent_config | none (default ask) | 471 | 179 | 2.4% | 0 | 17 | cat 135, Read 125, sed 77, grep 50 |
| 7 | ask | fetch | public_remote | none (default ask) | 383 | 108 | 2.0% | 0 | 2 | gh 193, git 190 |
| 8 | ask | fetch | unknown_remote | none (default ask) | 213 | 86 | 1.1% | 0 | 5 | git 81, gh 55, WebFetch 34, curl 31 |
| 9 | ask | delete | workspace | none (default ask) | 145 | 95 | 0.8% | 0 | 4 | rm 125, git 17, find 2, rmdir 1 |
| 10 | ask | delete | host | ask_irreversible_local | 105 | 63 | 0.5% | 0 | 2 | rm 103, rmdir 2 |
| 11 | ask | push | public_remote | ask_external_disclosure | 90 | 74 | 0.5% | 0 | 1 | git 90 |
| 12 | ask | fetch | protected | none (default ask) | 77 | 18 | 0.4% | 0 | 1 | gh 77 |
| 13 | ask | execute | unknown_remote | none (default ask) | 60 | 14 | 0.3% | 0 | 17 | <mcp-tool-03> 6, <mcp-tool-04> 6, <mcp-tool-02> 6, <mcp-tool-01> 6 |
| 14 | ask | fetch | host | none (default ask) | 38 | 23 | 0.2% | 0 | 1 | git 38 |
| 15 | ask | write | agent_config | ask_agent_config_change | 21 | 11 | 0.1% | 0 | 8 | Write 7, Edit 5, cat 2, ln 2 |
| 16 | ask | rewrite | workspace | ask_irreversible_local | 20 | 17 | 0.1% | 0 | 1 | git 20 |
| 17 | ask | send | protected | none (default ask) | 7 | 1 | 0.0% | 0 | 1 | gh 7 |
| 18 | ask | install | unknown_remote | none (default ask) | 4 | 2 | 0.0% | 0 | 2 | brew 3, npm 1 |
| 19 | ask | push | protected | none (default ask) | 3 | 3 | 0.0% | 0 | 2 | git 2, gh 1 |
| 20 | ask | send | public_remote | ask_external_disclosure | 3 | 3 | 0.0% | 0 | 1 | gh 3 |
| 21 | ask | execute | trusted_remote | none (default ask) | 3 | 2 | 0.0% | 0 | 1 | npm 3 |
| 22 | ask | send | unknown_remote | ask_external_disclosure | 3 | 1 | 0.0% | 0 | 1 | curl 3 |
| 23 | ask | delete | agent_config | ask_agent_config_change | 2 | 1 | 0.0% | 0 | 1 | rm 2 |
| 24 | ask | commit | agent_config | none (default ask) | 1 | 1 | 0.0% | 0 | 1 | git 1 |

- Group sizes: 1,000+ Actions 3 groups, 100 to 999 5, 20 to 99 6, 5 to 19 3, 2 to 4 6, single Action 1.
  The largest group holds 41.8% of ask and deny Actions, the top 3 hold 91.3%, the top 10 hold 99%.
- Every group has exactly one deciding Rule (the default `ask` counted as one); no group mixes Rules.
- Distinct programs per group: 133, 35, 27, 17, 17, 8, 5, 4, 4, 2, 2, 2, 2, then 1 in the remaining 11 groups.
  The Program Summary inside each group is what makes an `expected` Verdict on `ask · execute · host` a decision about 133 programs rather than about a key.
- Review units: 24 Verdicts, one per group, to open the gate.

### Determinism and consistency with the Change Review baseline

- Two `computeAdoption` runs over the same snapshot gave the same `resultHash` `8ae52329dd61bdb900f61075fd75c4eb66232fa3ff370245df6b1baec752a444` (443 ms and 435 ms).
- Two server runs over the imported Actions gave the same `resultHash` `8ae52329dd61bdb900f61075fd75c4eb66232fa3ff370245df6b1baec752a444`, equal to the local value.
- The preview agrees with the Gate 2 A vs B replay on the same classifier: allow→allow 15,242 = allow; ask→allow 139 + ask→ask 19,089 = 19,228 = ask; deny→deny 20 = deny; evaluated 34,490 and excluded 450 in both (`docs/evidence/gate2-replay.md`).
- The `resultHash` covers stats, the groups in group-key order (Program Summary included, Headline excluded), and the (actionKey, groupKey, effect) assignments in action-key order.

### Scripted fresh-volume journey

`pnpm evidence:remeasure` runs the twelve steps against the API of a compose project of its own with an empty volume, a server built from the working tree, and the frozen spool copies, then removes the project and its volume.
Every check below is asserted by the command; a failed check stops it before any document is written.
It reads what the server returns, not what the screens render; the screen checks stay in the re-run procedure below.

| step | via | result |
| --- | --- | --- |
| 1 import | `authority import` | 1,036 sessions, 34,940 accepted, 196 duplicates, 0 failed |
| 2 overview, no Policy | activity overview | no Policy; Action 34,940, evaluable 34,490; analyzability 17,972 / 6,610 / 9,908 |
| 3 first Policy | policy version | draft version 1 from the default template replaced with policy A (content hash `f96ed41d…beb8`), validation passed |
| 4 adoption preview | change review, replay run | kind `adoption`, no baseline; evaluated 34,490; allow 15,242, ask 19,228, deny 20; 22 ask and 2 deny groups; stats and group keys equal the local computation; resultHash `8ae52329…a444` on two runs |
| 5 group detail | adoption group samples | `deny · read · credentials` and `ask · execute · host` return a Headline and samples |
| 6 verdicts | verdicts | 24 groups set to `expected`; `adoption_unreviewed` blocks the gate until the last one, then the gate opens |
| 7 adopt | decision | review `accepted`, version 1 `accepted` |
| 8 report | Evidence Report | adoption Evidence Report carries resultHash `8ae52329…a444` |
| 9 conformance | `authority spool-flush`, replay run | 2 spool copies sent; conformance run for version 1 completed with 92 findings, resultHash `7710c06c…8689` |
| 10 change review B' | policy version, change review | draft version 2 with B' (`ebea9a23…0cc9`), kind `change`, baseline version 1; changed 139, Widening group 7; resultHash `3082d2a4…1598` equals the local Gate 2 run |
| 11 unexpected, reject, B, accept | verdicts, decisions | 5 groups `expected`, 2 `unexpected` → `widening_unexpected` blocks and accept is refused; rejected; draft version 3 with B (`45197245…6515`): changed 139, Widening group 5, resultHash `2c4577fa…a8d9` equals the local Gate 2 run; all `expected` → accepted |
| 12 audit | `authority verify-audit` | intact, 3 decision records |

### Fresh-volume journey re-run

Run on 2026-09-24 on a compose project of its own with an empty volume and its own ports, server image built from the working tree that carries classifier 0.2.3, and the web app served from `apps/web` against that server.
The maintainer's stack was not used.
Judge: Agent; every Verdict below was given by an Agent through the web controls, and the loop time is Agent tool latency, not a person's reading time.

| step | screen | result |
| --- | --- | --- |
| 1 import | CLI | 1,036 sessions, 34,940 accepted, 196 duplicates, 0 failed |
| 2 overview, no Policy | `/` | Session 665 (30-day window), Action 34,940, evaluable 34,490; analyzability 17,972 / 6,610 / 9,908 (52.1% / 19.2% / 28.7%); Capability, Target Kind, top program, and remote host tables; "<!-- ko-product-output -->아직 조직 정책이 없습니다" with "<!-- ko-product-output -->첫 조직 정책 만들기". No repository name on the screen |
| 3 first Policy | version editor | draft version 1 from the default template; document replaced with policy A (content hash `f96ed41d…beb8`), "draft <!-- ko-product-output -->저장", "<!-- ko-product-output -->검증: <!-- ko-product-output -->통과" |
| 4 adoption preview | review, `/` | review kind `adoption`, "<!-- ko-product-output -->기준 VERSION <!-- ko-product-output -->없음 (<!-- ko-product-output -->최초 도입)", "<!-- ko-product-output -->판정 대기"; <!-- ko-product-output -->평가한 action 34490 (<!-- ko-product-output -->전체 34940, <!-- ko-product-output -->제외 450); tiles <!-- ko-product-output -->허용 15242 44.2%, <!-- ko-product-output -->확인 필요 19228 55.7%, <!-- ko-product-output -->차단 20 0.1%; "<!-- ko-product-output -->확인 필요 group (22)", "<!-- ko-product-output -->차단 group (2)" |
| 5 group detail | deny `read · credentials`, ask `execute · host` | Headlines "<!-- ko-product-output -->자격 증명에서의 읽기 13<!-- ko-product-output -->건이 이 정책에서 '<!-- ko-product-output -->차단' <!-- ko-product-output -->대상이 됩니다." and "<!-- ko-product-output -->호스트에서의 실행 8048<!-- ko-product-output -->건이 이 정책에서 '<!-- ko-product-output -->확인 필요' <!-- ko-product-output -->대상이 됩니다."; "Program <!-- ko-product-output -->구성: <!-- ko-product-output -->서로 다른 program 4<!-- ko-product-output -->개 / 133<!-- ko-product-output -->개"; outside the sample panel and the "<!-- ko-product-output -->기술 세부" toggle: 0 ruleId, 0 home path (checked on the DOM with those two removed) |
| 6 verdicts | review | 24 selects set to <!-- ko-product-output -->의도한 제한 one by one; the blocker counted down ("<!-- ko-product-output -->판정하지 않은 group 23<!-- ko-product-output -->개" … "1<!-- ko-product-output -->개"), then "Gate: <!-- ko-product-output -->열림 / <!-- ko-product-output -->승인을 막는 blocker<!-- ko-product-output -->가 없습니다."; "<!-- ko-product-output -->최초 정책 채택" stays disabled until a reviewer name is entered |
| 7 adopt | review, `/` | status <!-- ko-product-output -->채택됨, <!-- ko-product-output -->결정 "<!-- ko-product-output -->최초 정책 채택", 24 selects disabled, sentence "<!-- ko-product-output -->채택은 검토 기록입니다. runtime <!-- ko-product-output -->설정 반영은 Authority Diff <!-- ko-product-output -->밖에서 이루어집니다."; version 1 `accepted` via the API. `/` shows "<!-- ko-product-output -->채택된 정책: version #1" with the Effect distribution of the adoption run (<!-- ko-product-output -->허용 15242 44.2%) |
| 8 report | download | adoption Evidence Report: candidate hash `f96ed41d…beb8`, Replay inputsHash, resultHash `8ae52329…a444`, <!-- ko-product-output -->분석 규모, <!-- ko-product-output -->정책 적용 결과, the two group tables with Verdicts, <!-- ko-product-output -->결정, Audit chain, <!-- ko-product-output -->고지; 0 ruleId, 0 home path |
| 9 conformance | API + `/conformance` | spool copies flushed from a scratch home (2 files sent, 0 failed); `conformance` run for the accepted version 1 completed on classifier 0.2.3 with resultHash `7710c06c…8689`; `/conformance` lists 92 findings (3 violation, 89 under_asked). Figures in `docs/evidence/conformance.md` |
| 10 change review B' | version 2, review | draft 2 from the accepted version 1, document B' (`ebea9a23…0cc9`), "<!-- ko-product-output -->검증: <!-- ko-product-output -->통과", "<!-- ko-product-output -->변경 검토 만들기"; kind `change`, <!-- ko-product-output -->평가 34490, <!-- ko-product-output -->넓어진 139, widening group 7, resultHash `3082d2a4…1598` (same as the local Gate 2 value); the two `unknown_remote → trusted_remote` groups critical (gh 4 / 2 Sessions, git 3 / 2), each Headline naming where the fetches went; 0 ruleId, 0 home path outside the sample panel |
| 11 unexpected, reject, B, accept | review, version 3 | 5 groups <!-- ko-product-output -->예상된 변화, the 2 trusted-remote groups <!-- ko-product-output -->예상 밖 → "Gate: blocker 1<!-- ko-product-output -->건 / <!-- ko-product-output -->예상 밖으로 판정된 group 2<!-- ko-product-output -->개. <!-- ko-product-output -->정책을 고쳐 새 review<!-- ko-product-output -->를 만드세요", accept disabled; <!-- ko-product-output -->정책 변경 반려 with a reason → <!-- ko-product-output -->반려됨; draft 3 from version 2 with B (`45197245…6515`) → <!-- ko-product-output -->넓어진 139, group 5, resultHash `2c4577fa…a8d9`; all <!-- ko-product-output -->예상된 변화 → "Gate: <!-- ko-product-output -->열림" → <!-- ko-product-output -->정책 변경 수락 → <!-- ko-product-output -->채택됨. Loop from the first unexpected Verdict to the accept: 59 s (Agent) |
| 12 audit | CLI, `/` | `verify-audit` `{"isIntact": true, "checkedCount": 3, "firstBrokenSequence": null}`; the B change report carries both content hashes, inputsHash, resultHash, the `none` share (0 of 139), the Operation section, and audit chain sequence 3; `/` shows "<!-- ko-product-output -->채택된 정책: version #3" with the Effect distribution of the version 3 run (<!-- ko-product-output -->허용 15381 44.6%, <!-- ko-product-output -->확인 필요 19089 55.3%, <!-- ko-product-output -->차단 20) |

The four figures match the measurement above: evaluated 34,490, ask 55.7%, deny 20 (rendered 0.1%), 24 Adoption Groups.
Server and local agreement: the adoption run on the server gave the local `resultHash` `8ae52329…a444`.

Findings from this run (none blocks the journey):

- After "token <!-- ko-product-output -->저장" on `/login`, the app moves to `/` and loads the data, but the header still shows "<!-- ko-product-output -->로그인" until the page is reloaded; after a reload it shows "<!-- ko-product-output -->로그아웃".
- The deny share renders as `0.1%` because tiles show one decimal; the count 20 is exact.

## Previous version: classifier 0.2.2 (not re-run)

The section below is the adoption preview as measured on classifier 0.2.2, policy A, on 2026-09-24, including the browser pass over the screens, and is kept as the record of that measurement.
Its `resultHash` values are not comparable with the 0.2.3 values above.
No repository names, host paths, or raw command text appear below; non-standard programs are masked as `<local-tool-NN>` and MCP tools as `<mcp-tool-NN>`.

Judge: Agent. No person has recorded a Verdict on these groups.
Journey grade: **medium**: real-record Adoption Groups were reviewable and the preview matched the expected shape; nothing stronger is claimed.

### Change from classifier 0.2.2

| measure | 0.2.2 | 0.2.3 |
| --- | ---: | ---: |
| allow | 8,217 (23.8%) | 15,242 (44.2%) |
| ask | 26,253 (76.1%) | 19,228 (55.7%) |
| deny | 20 | 20 |
| Adoption Groups (ask / deny) | 23 (21 / 2) | 24 (22 / 2) |
| `ask · read · host` Actions | 14,515 | 6,458 |
| `ask · execute · host` Actions | 6,322 | 8,048 |
| server and local `resultHash` | differ by one Session count | equal |

Classifier 0.2.3 folds each Session's home directory to `~`, so paths under a `~` workspace root are inside the workspace: 7,036 Actions move from ask to allow and 11 `cp` reads of an outside source move from allow to ask (`docs/evidence/classifier-hardening-3.md`).
An Action that was in `ask · read · host` because of a path now inside the workspace either allows (5,544) or moves to the group of its next asking Operation: 1,701 to `ask · execute · host`, 777 to `ask · write · host`, and smaller counts elsewhere.
The one new group, `ask · send · unknown_remote` (3 `curl` Actions), is made of three such Actions.

### Result

The candidate is policy A: the default template's Rules with the corrected environment profile (credential paths 5, agent-config paths 4, trusted remotes 35, public remotes 40, protected branches 3, production markers 3).
Actions are built the same way the server builds them for a replay (transcript parse, remote enrichment, classifier 0.2.2, duplicate Action Keys removed) and evaluated with `computeAdoption` from `@authority/replay/diff`.

| item | value |
| --- | ---: |
| Sessions | 1,036 |
| Actions (after dedupe) | 34,940 (196 duplicates) |
| evaluated | 34,490 |
| excluded (no Operation) | 450 |
| allow | 8,217 (23.8%) |
| ask | 26,253 (76.1%) |
| deny | 20 (0.06%) |
| analyzability full / partial / none (Action) | 17,909 / 6,670 / 9,911 |
| Capability × Zone × Effect cells | 28 |
| Adoption Groups (ask / deny) | 23 (21 / 2) |
| ask + deny Actions assigned to a group | 26,273 |
| Sessions with at least one ask or deny Action | 654 |
| `computeAdoption` wall time | 510 ms |

The four figures the adoption review shows on screen and that this file locks: **evaluated 34,490, ask 76.1%, deny 20 (0.06%), 23 Adoption Groups**.
The web renders shares with one decimal, so the deny tile reads `0.1%`; the count 20 is the exact figure.

### Why the ask share is what it is

The ask share is a property of this Policy on this corpus and is reported as-is.

- 19,789 of the 26,273 ask and deny Actions (75.3%) match no Rule and fall to the default `ask`.
  The default template allows read, write, and commit only in `workspace` and execute only in `workspace` with `full` or `partial` analyzability; every read, write, or execute outside the Action's workspace root is `host` and asks.
- `cd` into a directory outside the workspace root is classified as a `read` Operation on that path and is the deciding Operation of 7,860 Actions (29.9% of ask and deny), the largest single contribution to the `ask · read · host` group.
  Sibling worktrees and the supervisor's home are outside every Session's workspace root in this corpus (`docs/evidence/replay-limitations.md`).
- 6,322 Actions (24.1%) are `execute` of a program whose effect could not be determined; `ask_unanalyzable` asks by Rule.
- The remaining Rule matches are small: `ask_irreversible_local` 77, `ask_external_disclosure` 43, `ask_agent_config_change` 22, `deny_credentials_access` 13, `deny_shared_history_rewrite` 7.

Neither the classifier nor the default template was changed to move this number.
An organization that wants the share to drop declares more of its environment (workspace roots, trusted remotes) or adds Rules; that is a Policy change reviewed in a Change Review.

### Adoption Groups

Groups are `[effect, capability, zone]` (ADR-0010), in review order (deny first, then ask by Action count).
The share column is of the 26,273 ask and deny Actions.
Programs are masked as in the previous rounds: non-standard programs as `<local-tool-NN>`, MCP tools as `<mcp-tool-NN>`.

| # | effect | capability | zone | deciding rule | actions | sessions | share | none | distinct programs | top programs |
| ---: | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | deny | read | credentials | deny_credentials_access | 13 | 10 | 0.0% | 0 | 4 | grep 6, ls 4, gh 2, Read 1 |
| 2 | deny | rewrite | public_remote | deny_shared_history_rewrite | 7 | 5 | 0.0% | 0 | 1 | git 7 |
| 3 | ask | read | host | none (default ask) | 14,515 | 568 | 55.2% | 0 | 23 | cd 7,860, Read 2,663, cat 1,372, ls 1,090 |
| 4 | ask | execute | host | ask_unanalyzable | 6,322 | 572 | 24.1% | 6,322 | 117 | <local-tool-01> 1,934, python3 1,123, <local-tool-02> 474, StructuredOutput 457 |
| 5 | ask | write | host | none (default ask) | 4,227 | 402 | 16.1% | 0 | 28 | Edit 1,153, cat 652, Write 629, echo 523 |
| 6 | ask | read | agent_config | none (default ask) | 379 | 137 | 1.4% | 0 | 16 | Read 125, cat 102, sed 51, ls 36 |
| 7 | ask | fetch | public_remote | none (default ask) | 220 | 87 | 0.8% | 0 | 2 | git 118, gh 102 |
| 8 | ask | fetch | unknown_remote | none (default ask) | 199 | 80 | 0.8% | 0 | 5 | git 71, gh 54, WebFetch 34, curl 28 |
| 9 | ask | delete | workspace | none (default ask) | 83 | 59 | 0.3% | 0 | 2 | rm 75, git 8 |
| 10 | ask | fetch | protected | none (default ask) | 74 | 18 | 0.3% | 0 | 1 | gh 74 |
| 11 | ask | delete | host | ask_irreversible_local | 67 | 43 | 0.3% | 0 | 2 | rm 66, rmdir 1 |
| 12 | ask | execute | unknown_remote | none (default ask) | 60 | 14 | 0.2% | 0 | 17 | <mcp-tool-03> 6, <mcp-tool-04> 6, <mcp-tool-02> 6, <mcp-tool-01> 6 |
| 13 | ask | push | public_remote | ask_external_disclosure | 42 | 29 | 0.2% | 0 | 1 | git 42 |
| 14 | ask | write | agent_config | ask_agent_config_change | 20 | 9 | 0.1% | 0 | 8 | Write 7, Edit 5, ln 2, printf 2 |
| 15 | ask | fetch | host | none (default ask) | 18 | 13 | 0.1% | 0 | 1 | git 18 |
| 16 | ask | rewrite | workspace | ask_irreversible_local | 10 | 9 | 0.0% | 0 | 1 | git 10 |
| 17 | ask | send | protected | none (default ask) | 6 | 1 | 0.0% | 0 | 1 | gh 6 |
| 18 | ask | install | unknown_remote | none (default ask) | 4 | 2 | 0.0% | 0 | 2 | brew 3, npm 1 |
| 19 | ask | execute | trusted_remote | none (default ask) | 2 | 2 | 0.0% | 0 | 1 | npm 2 |
| 20 | ask | delete | agent_config | ask_agent_config_change | 2 | 1 | 0.0% | 0 | 1 | rm 2 |
| 21 | ask | commit | agent_config | none (default ask) | 1 | 1 | 0.0% | 0 | 1 | git 1 |
| 22 | ask | push | protected | none (default ask) | 1 | 1 | 0.0% | 0 | 1 | gh 1 |
| 23 | ask | send | public_remote | ask_external_disclosure | 1 | 1 | 0.0% | 0 | 1 | gh 1 |

- Group sizes: 1,000+ Actions 3 groups, 100 to 999 3, 20 to 99 6, 5 to 19 5, 2 to 4 3, single Action 3.
  The largest group holds 55.2% of ask and deny Actions, the top 3 hold 95.4%, the top 8 hold 99%.
- Every group has exactly one deciding Rule (the default `ask` counted as one); no group mixes Rules.
- Distinct programs per group: 117, 28, 23, 17, 16, 8, 5, 4, 2, 2, 2, 2, then 1 in the remaining 11 groups.
  The Program Summary inside each group is what makes an `expected` Verdict on `ask · execute · host` a decision about 117 programs rather than about a key.
- Review units: 23 Verdicts, one per group, to open the gate.

### Determinism and consistency with the Change Review baseline

- Two `computeAdoption` runs over the same snapshot gave the same `resultHash` `3c51b5522a40cc88ad0b6b555b3fddc203aa68811b6c3d4aa6f3f404ad94e157` (510 ms and 476 ms).
- Two server runs over the imported Actions gave the same `resultHash` `f6601304932d2c6dd1b3a9d1b61b6cb18501467bb53c20e8f72cf448607ee3a7`; the one-Session difference from the local value is explained under "Fresh-volume journey re-run".
- The preview agrees with the Gate 2 A vs B replay on the same classifier: allow→allow 8,217 = allow; ask→allow 132 + ask→ask 26,121 = 26,253 = ask; deny→deny 20 = deny; evaluated 34,490 and excluded 450 in both (`docs/evidence/gate2-replay.md`).
- The `resultHash` covers stats, the groups in group-key order (Program Summary included, Headline excluded), and the (actionKey, groupKey, effect) assignments in action-key order.

### Scripted fresh-volume journey

`pnpm evidence:remeasure` runs the twelve steps against the API of a compose project of its own with an empty volume, a server built from the working tree, and the frozen spool copies, then removes the project and its volume.
Every check below is asserted by the command; a failed check stops it before any document is written.
It reads what the server returns, not what the screens render; the screen checks stay in the re-run procedure below.

| step | via | result |
| --- | --- | --- |
| 1 import | `authority import` | 1,036 sessions, 34,940 accepted, 196 duplicates, 0 failed |
| 2 overview, no Policy | activity overview | no Policy; Action 34,940, evaluable 34,490; analyzability 17,909 / 6,670 / 9,911 |
| 3 first Policy | policy version | draft version 1 from the default template replaced with policy A (content hash `f96ed41d…beb8`), validation passed |
| 4 adoption preview | change review, replay run | kind `adoption`, no baseline; evaluated 34,490; allow 8,217, ask 26,253, deny 20; 21 ask and 2 deny groups; stats and group keys equal the local computation; resultHash `f6601304…e3a7` on two runs |
| 5 group detail | adoption group samples | `deny · read · credentials` and `ask · read · host` return a Headline and samples |
| 6 verdicts | verdicts | 23 groups set to `expected`; `adoption_unreviewed` blocks the gate until the last one, then the gate opens |
| 7 adopt | decision | review `accepted`, version 1 `accepted` |
| 8 report | Evidence Report | adoption Evidence Report carries resultHash `f6601304…e3a7` |
| 9 conformance | `authority spool-flush`, replay run | 2 spool copies sent; conformance run for version 1 completed with 86 findings, resultHash `61feaa99…41f7` |
| 10 change review B' | policy version, change review | draft version 2 with B' (`ebea9a23…0cc9`), kind `change`, baseline version 1; changed 132, Widening group 7; resultHash `55a0cb73…cd18` equals the local Gate 2 run |
| 11 unexpected, reject, B, accept | verdicts, decisions | 5 groups `expected`, 2 `unexpected` → `widening_unexpected` blocks and accept is refused; rejected; draft version 3 with B (`45197245…6515`): changed 132, Widening group 5, resultHash `55592458…c08b` equals the local Gate 2 run; all `expected` → accepted |
| 12 audit | `authority verify-audit` | intact, 3 decision records |

### Fresh-volume journey re-run

Run on 2026-09-24 on a compose project of its own with an empty volume, server image built from the commit that carries classifier 0.2.2 and the chunked replay inserts, and the web app served from `apps/web` against that server.
The maintainer's stack was not used.
Judge: Agent; every Verdict below was given by an Agent through the web controls, and the loop times are Agent tool latency, not a person's reading time.

| step | screen | result |
| --- | --- | --- |
| 1 import | CLI | 1,036 sessions, 34,940 accepted, 196 duplicates, 0 failed; every Action carries classifier 0.2.2 |
| 2 overview, no Policy | `/` | Session 665 (30-day window), Action 34,940, evaluable 34,490; analyzability 17,909 / 6,670 / 9,911 (51.9% / 19.3% / 28.7%); Capability, Target Kind, top program, and remote host tables; "<!-- ko-product-output -->아직 조직 정책이 없습니다" with "<!-- ko-product-output -->첫 조직 정책 만들기". No repository name on the screen |
| 3 first Policy | version editor | draft version 1 from the default template; document replaced with policy A (content hash `f96ed41d…beb8`), "draft <!-- ko-product-output -->저장", "<!-- ko-product-output -->검증: <!-- ko-product-output -->통과" |
| 4 adoption preview | review, `/` | review kind `adoption`, "<!-- ko-product-output -->기준 VERSION <!-- ko-product-output -->없음 (<!-- ko-product-output -->최초 도입)", "<!-- ko-product-output -->판정 대기"; <!-- ko-product-output -->평가한 action 34490 (<!-- ko-product-output -->전체 34940, <!-- ko-product-output -->제외 450); tiles <!-- ko-product-output -->허용 8217 23.8%, <!-- ko-product-output -->확인 필요 26253 76.1%, <!-- ko-product-output -->차단 20 0.1%; "<!-- ko-product-output -->확인 필요 group (21)", "<!-- ko-product-output -->차단 group (2)". `/` shows the same tiles under "<!-- ko-product-output -->도입 preview" with "<!-- ko-product-output -->최초 정책 설정 계속하기" |
| 5 group detail | deny `read · credentials`, ask `execute · host` | Headlines "<!-- ko-product-output -->자격 증명에서의 읽기 13<!-- ko-product-output -->건이 이 정책에서 '<!-- ko-product-output -->차단' <!-- ko-product-output -->대상이 됩니다." and "<!-- ko-product-output -->호스트에서의 실행 6322<!-- ko-product-output -->건이 이 정책에서 '<!-- ko-product-output -->확인 필요' <!-- ko-product-output -->대상이 됩니다."; "Program <!-- ko-product-output -->구성: <!-- ko-product-output -->서로 다른 program 4<!-- ko-product-output -->개 / 117<!-- ko-product-output -->개"; outside the sample panel and the "<!-- ko-product-output -->기술 세부" toggle: 0 ruleId, 0 home path (checked on the DOM with those two removed) |
| 6 verdicts | review | 23 selects set to <!-- ko-product-output -->의도한 제한 one by one; the blocker counted down ("<!-- ko-product-output -->판정하지 않은 group 22<!-- ko-product-output -->개" … "12<!-- ko-product-output -->개"), then "Gate: <!-- ko-product-output -->열림 / <!-- ko-product-output -->승인을 막는 blocker<!-- ko-product-output -->가 없습니다."; "<!-- ko-product-output -->최초 정책 채택" stays disabled until a reviewer name is entered |
| 7 adopt | review, `/` | status <!-- ko-product-output -->채택됨, <!-- ko-product-output -->결정 기록 "<!-- ko-product-output -->최초 정책 채택", 23 selects disabled, sentence "<!-- ko-product-output -->채택은 검토 기록입니다. runtime <!-- ko-product-output -->설정 반영은 Authority Diff <!-- ko-product-output -->밖에서 이루어집니다."; version 1 `accepted` via the API; no <!-- ko-product-output -->적용됨 / <!-- ko-product-output -->활성화 / enforced on any screen. `/` shows "<!-- ko-product-output -->채택된 정책: version #1" |
| 8 report | download | adoption Evidence Report: candidate hash, Replay inputsHash, resultHash `f6601304…e3a7`, <!-- ko-product-output -->분석 규모, <!-- ko-product-output -->정책 적용 결과, the two group tables with Verdicts, <!-- ko-product-output -->결정, Decision Record sequence 1 and hash, audit tail, both notices; 0 ruleId |
| 9 conformance | API + `/conformance` | spool copies flushed (2 files, 3,789 observations: pre_tool_use 3,666, session_end 121, permission_request 2); `conformance` run for the accepted version 1 completed; findings table on `/conformance` (violation and under_asked rows). Figures in `docs/evidence/conformance.md` |
| 10 change review B' | version 2, review | draft 2 from the accepted version 1, document B' (`ebea9a23…0cc9`), "<!-- ko-product-output -->검증: <!-- ko-product-output -->통과", "<!-- ko-product-output -->변경 검토 만들기"; kind `change`, baseline version 1, <!-- ko-product-output -->평가 34,490, <!-- ko-product-output -->넓어진 132, Widening group 7, resultHash `55a0cb73…cd18` (same as the local Gate 2 value); the two repo-02 groups `unknown_remote → trusted_remote` critical (gh 4 / 2 Sessions, git 2 / 2) |
| 11 unexpected, reject, B, accept | review, version 3 | 5 groups <!-- ko-product-output -->예상된 변화, the 2 repo-02 groups <!-- ko-product-output -->예상 밖 → "Gate: blocker 1<!-- ko-product-output -->건 / <!-- ko-product-output -->예상 밖으로 판정된 group 2<!-- ko-product-output -->개. <!-- ko-product-output -->정책을 고쳐 새 review<!-- ko-product-output -->를 만드세요", accept disabled; <!-- ko-product-output -->정책 변경 반려 with a reason → <!-- ko-product-output -->반려됨; draft 3 from version 2 with B (`45197245…6515`) → review <!-- ko-product-output -->넓어진 132, group 5, resultHash `55592458…c08b`; all <!-- ko-product-output -->예상된 변화 → "Gate: <!-- ko-product-output -->열림" → <!-- ko-product-output -->정책 변경 수락 → <!-- ko-product-output -->채택됨. Loop from the first unexpected Verdict to the accept: 114 s (Agent) |
| 12 audit | CLI, `/` | `verify-audit` `{"isIntact": true, "checkedCount": 3, "firstBrokenSequence": null}`; chain 1 accept (baseline hash null, candidate `f96ed41d`) → 2 reject (`f96ed41d` → `ebea9a23`) → 3 accept (`f96ed41d` → `45197245`); `/` shows "<!-- ko-product-output -->채택된 정책: version #3" with the Effect distribution of the version 3 run (<!-- ko-product-output -->허용 8,349 24.2%, <!-- ko-product-output -->확인 필요 26,121 75.7%, <!-- ko-product-output -->차단 20) |

The four figures match the measurement above: evaluated 34,490, ask 76.1%, deny 20 (rendered 0.1%), 23 Adoption Groups.
Whole journey wall time including tool latency: 12 minutes.

Server and local agreement: the server adoption run has the same stats, the same 23 group keys, the same Action counts, Program Summaries, Target Summaries, and sample keys as the local computation, and a second server run over the same Actions returned the same `resultHash` `f6601304…e3a7`.
The server hash differs from the local `3c51b552…e157` by exactly one field: `ask · execute · host` has 571 Sessions on the server and 572 locally, because one Action whose tool-use id appears both in a Session transcript and in its sub-agent transcript is attributed to the parent Session by the import and to the sub-agent transcript by the local pipeline (which copy survives the duplicate removal depends on file order).
Action counts and group keys are unaffected; the difference is recorded rather than hidden.

Findings from this run (none blocks the journey):

- After the first Policy is adopted, `/` shows "<!-- ko-product-output -->완료된 replay run<!-- ko-product-output -->이 없습니다" under the accepted Policy until a Change Review runs: the Effect distribution reads only `version_diff` runs, so neither the adoption run nor the conformance run of version 1 fills it. The E2E stub returns cells there, so the test does not see it.
  Since fixed: the Effect distribution also reads the completed adoption run of an accepted version, so `/` fills right after the first adoption.
- The adoption Evidence Report lists Target keys of two path segments, and for a home directory the second segment is the operating-system user name; Remote Keys carry owner and repository names by design. The screens keep paths inside the sample panel. The report is meant to be shared, so its local-path Target keys need the same masking decision that the change-review report's local-path targets still wait for.
  Since fixed for display: both Evidence Reports and the review screens fold `/Users/<name>` and `/home/<name>` (and the `Users/<name>` Target key form) to `~`; stored Target keys and every hash are unchanged, so a stored key in the local database can still contain the user name.
- The deny share renders as `0.1%` because tiles show one decimal; the count 20 is exact.
- The candidate stays `in_review` after a replay failure and returns to `draft` on the next read; the measured build had no withdraw control; the review screen now withdraws a computing or ready review (`docs/evidence/review-limitations.md`).

## Previous version: composition versus classifier 0.2.1

These 0.2.1 figures are kept only as the record of the composition change; the current figures are in the sections above.
The totals and the 23 groups are the same as classifier 0.2.1.
`ask · fetch · host` (18 `git` Actions) is new because a fetch whose repository operand is a local path is now a `path` Target, and `ask · fetch · unknown_remote` drops from 217 to 199 accordingly; the single `deny · rewrite · unknown_remote` Action joined `deny · rewrite · public_remote` (6 → 7) because its remote now resolves.
Analyzability moved from 17,769 / 6,810 / 9,911 to 17,909 / 6,670 / 9,911 for the same reason.

## Previous version: signature choice on classifier 0.2.1

The Adoption Group signature was chosen before the replay core existed, on classifier 0.2.1 and the same snapshot, by computing both candidates over the ask and deny Actions of policy A.
These figures are kept only as the record of that decision; the current figures are in the sections above.

| item | A `[effect, capability, zone, program]` | B `[effect, capability, zone]` |
| --- | ---: | ---: |
| ask / deny groups | 231 / 6 | 20 / 3 |
| review units (a Verdict for every ask and deny group) | 237 | 23 |
| single-Action groups | 67 | 4 |
| groups needed to cover 90% of ask+deny Actions | 28 | 3 |
| deciding Rules per group | always 1 | always 1 |
| programs per group | always 1 | 1 to 117 |
| unit on which a "<!-- ko-product-output -->정책 수정 필요" Verdict can be applied to the Policy | larger than the group (a Rule has no program dimension) | the group itself (a Rule or a Zone declaration) |
| consistent with the Change Review Diff Group signature | yes (program included) | no |

B was chosen.
A Rule never looks at the program, so under B one group is exactly one judgement the Policy makes, which is what an adoption Verdict judges.
A splits the same judgement into up to 117 groups that cannot be changed separately in the Policy, and 67 of its 237 groups hold a single Action.
B's weakness is that 8 groups mix program categories (98.3% of ask+deny Actions); the largest, `ask · execute · host`, held 117 distinct programs under one Rule (`ask_unanalyzable`).
That is why the group carries a Program Summary (top programs and distinct program count) as evidence inside the group instead of in its key.
The Change Review signature keeps program; the condition for unifying the two is ADR-0010's reversal trigger.
