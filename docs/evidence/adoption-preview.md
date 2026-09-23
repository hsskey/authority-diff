corpus snapshot: transcripts-2026-09-23-1036 (2026-09-23, 1,036 files, 34,940 Actions); classifier 0.2.2; measured 2026-09-24; candidate policy A contentHash `f96ed41d…beb8`; adoption resultHash `3c51b552…e157`

# Adoption preview (first Policy)

The adoption preview applies one candidate Policy Version to the recorded Actions with no baseline and asks which Effect each Action would receive (ADR-0010).
Every number in the main sections below is labelled **classifier 0.2.2, policy A** (measured 2026-09-24).
No repository names, host paths, or raw command text appear below; non-standard programs are masked as `<local-tool-NN>` and MCP tools as `<mcp-tool-NN>`.

Judge: Agent. No person has recorded a Verdict on these groups.
Journey grade: **medium** (중): real-record Adoption Groups were reviewable and the preview matched the expected shape; nothing stronger is claimed.

## Result

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
| `computeAdoption` wall time | 502 ms |

The four figures the adoption review shows on screen and that this file locks: **evaluated 34,490, ask 76.1%, deny 20 (0.06%), 23 Adoption Groups**.
The web renders shares with one decimal, so the deny tile reads `0.1%`; the count 20 is the exact figure.

## Why the ask share is what it is

The ask share is a property of this Policy on this corpus and is reported as-is.

- 19,789 of the 26,273 ask and deny Actions (75.3%) match no Rule and fall to the default `ask`.
  The default template allows read, write, and commit only in `workspace` and execute only in `workspace` with `full` or `partial` analyzability; every read, write, or execute outside the Action's workspace root is `host` and asks.
- `cd` into a directory outside the workspace root is classified as a `read` Operation on that path and is the deciding Operation of 7,860 Actions (29.9% of ask and deny), the largest single contribution to the `ask · read · host` group.
  Sibling worktrees and the supervisor's home are outside every Session's workspace root in this corpus (`docs/evidence/replay-limitations.md`).
- 6,322 Actions (24.1%) are `execute` of a program whose effect could not be determined; `ask_unanalyzable` asks by Rule.
- The remaining Rule matches are small: `ask_irreversible_local` 77, `ask_external_disclosure` 43, `ask_agent_config_change` 22, `deny_credentials_access` 13, `deny_shared_history_rewrite` 7.

Neither the classifier nor the default template was changed to move this number.
An organization that wants the share to drop declares more of its environment (workspace roots, trusted remotes) or adds Rules; that is a Policy change reviewed in a Change Review.

## Adoption Groups

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

Composition versus classifier 0.2.1 (same totals, same 23 groups): `ask · fetch · host` (18 `git` Actions) is new because a fetch whose repository operand is a local path is now a `path` Target, and `ask · fetch · unknown_remote` drops from 217 to 199 accordingly; the single `deny · rewrite · unknown_remote` Action joined `deny · rewrite · public_remote` (6 → 7) because its remote now resolves.
Analyzability moved from 17,769 / 6,810 / 9,911 to 17,909 / 6,670 / 9,911 for the same reason.

## Determinism and consistency with the Change Review baseline

- Two `computeAdoption` runs over the same snapshot gave the same `resultHash` `3c51b5522a40cc88ad0b6b555b3fddc203aa68811b6c3d4aa6f3f404ad94e157` (502 ms and 535 ms).
- The preview agrees with the Gate 2 A vs B replay on the same classifier: allow→allow 8,217 = allow; ask→allow 132 + ask→ask 26,121 = 26,253 = ask; deny→deny 20 = deny; evaluated 34,490 and excluded 450 in both (`docs/evidence/gate2-replay.md`).
- The `resultHash` covers stats, the groups in group-key order (Program Summary included, Headline excluded), and the (actionKey, groupKey, effect) assignments in action-key order.

## Fresh-volume journey re-run

TBD022_JOURNEY_SECTION

## Re-run procedure (fresh volume)

The adoption stage comes first; the change-review stage is the Gate 3 journey unchanged.

Stack: a compose project of its own with an empty volume and its own ports, built from the commit under test; the maintainer's running stack is not used.
The web app runs from `apps/web` with `/api` proxied to that server.
Commands below omit the corpus and policy file paths; they live under `.local/` and never enter the repository.

Adoption stage:

1. `pnpm authority import <snapshot>` into the fresh stack. Expected: 1,036 sessions, 34,940 accepted, 196 duplicates, 0 failed.
2. `/` with no Policy shows the Activity Overview (Sessions, Actions, evaluable Actions, analyzability, Capability and Target Kind tables, top programs, remote hosts) and "아직 조직 정책이 없습니다".
3. "첫 조직 정책 만들기" opens draft version 1 (default template). Replace the document with policy A, "draft 저장" (the content hash becomes `f96ed41d…beb8`), "검증" reads "검증: 통과".
4. "최초 도입 검토 만들기". The review is kind `adoption`, "기준 VERSION 없음 (최초 도입)". Confirm on the review and on `/` ("도입 preview"): evaluated 34,490; 허용 8,217 (23.8%); 확인 필요 26,253 (76.1%); 차단 20 (the tile rounds to 0.1%); "확인 필요 group (21)", "차단 group (2)".
5. Open one deny group and one ask group: the Headline, the Program Summary, and the Target Summary are outside the sample panel; command text, paths, and ruleId are only inside the sample panel and the "기술 세부" toggle.
6. Set every one of the 23 groups to 의도한 제한. "Gate: 열림" appears only after the last one; before that the blocker reads "판정하지 않은 group N개" and "최초 정책 채택" is disabled.
7. Enter a reviewer name and "최초 정책 채택". The decision record appears, version 1 is `accepted`, the verdict controls are disabled, and no screen says 적용됨, 활성, or enforced. `/` now shows "채택된 정책: version #1" with the Effect distribution.
8. Download the Evidence Report: policy hash, window, scale, allow/ask/deny counts and shares, the two group tables with Verdicts, the decision, the Decision Record hash, the notice that the figures apply the Policy to past behavior and do not recover past runtime approvals. No path or command text in it.

Change-review stage (the Gate 3 journey, unchanged): from the accepted version 1 make draft version 2 with B', "변경 검토 만들기", then Gate 3 items 3 to 7 (two repo-02 groups critical with a self-explaining Headline; no path, fragment, or ruleId outside the sample panel; unexpected locks accept with blocker copy; reject, edit to B, accept; the downloaded report carries both content hashes, inputsHash, resultHash, the audit tail, the `none` share, and the Operation section; `pnpm authority verify-audit` intact).

Conformance stage: copy the hook spool files into a scratch home, `spool-flush` them to the fresh server, request a `conformance` run for the accepted version over the observation window, and read `/conformance`.

Tear the stack down with `down -v` when done.

## Signature choice (previous version: classifier 0.2.1)

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
| unit on which a "정책 수정 필요" Verdict can be applied to the Policy | larger than the group (a Rule has no program dimension) | the group itself (a Rule or a Zone declaration) |
| consistent with the Change Review Diff Group signature | yes (program included) | no |

B was chosen.
A Rule never looks at the program, so under B one group is exactly one judgement the Policy makes, which is what an adoption Verdict judges.
A splits the same judgement into up to 117 groups that cannot be changed separately in the Policy, and 67 of its 237 groups hold a single Action.
B's weakness is that 8 groups mix program categories (98.3% of ask+deny Actions); the largest, `ask · execute · host`, held 117 distinct programs under one Rule (`ask_unanalyzable`).
That is why the group carries a Program Summary (top programs and distinct program count) as evidence inside the group instead of in its key.
The Change Review signature keeps program; the condition for unifying the two is ADR-0010's reversal trigger.
