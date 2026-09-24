corpus snapshot: transcripts-2026-09-23-1036 (2026-09-23, 1,036 files, 34,940 Actions); classifier 0.2.2; measured 2026-09-24; A vs B' resultHash `55a0cb73…cd18`

# Gate 3 browser reading

Journey grade stays **medium** (중): the reader below is an Agent, not a person.

## Third-party (no-context agent) reading

Result: **pass**, 26 s wall time against a 120 s limit.

Screens: the adoption review of policy A before any Verdict, and the Change Review of B' against the accepted version 1 before any Verdict.
Both came from a fresh compose project with an empty volume, torn down with `down -v` afterwards, at 1440 px width, full page.
The figures on them match the recorded journey: adoption <!-- ko-product-output -->평가 34,490, <!-- ko-product-output -->허용 8,217, <!-- ko-product-output -->확인 필요 26,253, <!-- ko-product-output -->차단 20, groups 21 + 2; Change Review <!-- ko-product-output -->넓어진 132, Widening group 7, resultHash `55a0cb73…cd18` (`adoption-preview.md`, `gate2-replay.md`).

Reader: a new Claude Code session run from a directory holding only the two images, named `screen-1.png` and `screen-2.png`.
It had the Read tool only, no project settings, MCP servers, or skills, and no repository, docs, or earlier reports.
Prompt: look only at the two screens and, within two minutes, explain what changed on each and why it matters.

Pass criteria, fixed before the run (all required):

1. Screen 1 is a first Policy with no baseline applied to past Actions: most become ask (about 76%), 20 deny, and nothing is adopted while 23 groups are unjudged.
2. Screen 2 compares a candidate with an accepted baseline: 132 Actions move ask → allow, all fetch and critical, and two groups move `unknown_remote → trusted_remote`.
3. Why it matters: Agents would fetch from remote sources without confirmation, and the Gate holds the change until every group is judged.
4. No material misreading, such as calling the Policy enforced or reading the figures as past runtime approvals.

What the reader said, in short:

- Screen 1: with no baseline, the proposal applied to 34,490 past Actions gives <!-- ko-product-output -->허용 8,217 (23.8%), <!-- ko-product-output -->확인 필요 26,253 (76.1%), <!-- ko-product-output -->차단 20; 23 groups are <!-- ko-product-output -->미판정 and the Gate blocker keeps "<!-- ko-product-output -->최초 정책 채택" disabled.
- Screen 2: the baseline is the screen 1 version; only ask → allow changed, 132 Actions (<!-- ko-product-output -->확인 필요 26,253 → 26,121), in 7 critical fetch groups to `unknown_remote` across five programs, and the `gh` and `git` groups also move to `trusted_remote`; 7 unjudged groups keep "<!-- ko-product-output -->정책 변경 수락" disabled.
- Why it matters: fetches to unknown addresses would pass without confirmation, a path for data leaks or prompt injection; 132 is under 0.4% of the total and would vanish in aggregate figures, so the transition table and group list surface it; the two `trusted_remote` groups ask whether that trust is deserved; the Gate and the reviewer name and reason make the decision traceable.
- It repeated the screen 1 notice that the figures apply the Policy to past Actions and do not recover past runtime approvals.

Limits of this reading:

- The reader inferred that screen 1's version became the baseline from the matching version id; the screens do not show the adoption decision itself.
- It did not say what in the Policy caused the widening (`allow_unknown_remote_fetch` and the host-wide `github.com/**` in `trustedRemotes`); the screens do not show the Policy document.
