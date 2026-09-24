synthetic fixture: tests/fixtures/journey; classifier 0.2.4; measured 2026-09-24; head `422ea95e34dbf0d66befa7b9d2c388cc192c57be`

# Journey check

A dated log of the twelve-step API journey, including `verify-audit`, run against a compose project of its own with an empty volume and a server built from the named commit.
The fixture is synthetic (`tests/fixtures/journey`); expected figures live in that fixture's `expected.md`.
Raw outputs stay under `.local/journey-check/` and do not enter the repository.

Recorded command: `pnpm tsx tools/local-pipeline/journey-check.ts`

| date | commit | result |
| --- | --- | --- |
| 2026-09-24 | `422ea95e34dbf0d66befa7b9d2c388cc192c57be` | pass; `verify-audit` intact, 3 Decision Records |

Latest run (2026-09-24, `422ea95e34dbf0d66befa7b9d2c388cc192c57be`):

| step | result |
| --- | --- |
| 1 import | 3 Sessions, 18 accepted, 0 duplicates, 0 failed |
| 2 overview, no Policy | no Policy; Action 18, evaluable 18; analyzability 14 / 3 / 1 |
| 3 first Policy | draft version 1 replaced with policy A, validation passed |
| 4 adoption preview | kind `adoption`; evaluated 18; allow 6, ask 9, deny 3; 6 ask and 1 deny Adoption Groups; resultHash matches the local computation on two runs |
| 5 group detail | `deny · read · credentials` and `ask · fetch · unknown_remote` return a Headline and samples |
| 6 verdicts | 7 Adoption Groups set to `expected`; the Gate opens after the last Verdict |
| 7 adopt | review `accepted`, version 1 `accepted` |
| 8 report | adoption Evidence Report carries the adoption resultHash |
| 9 conformance | 2 spool copies sent; conformance Replay Run completed with 7 Conformance Findings |
| 10 change review B' | draft version 2, kind `change`; changed 4, Widening group 3; resultHash matches the local run |
| 11 unexpected, reject, B, accept | 1 `unexpected` locks the Gate; rejected; draft version 3 with B: all `expected`, accepted |
| 12 audit | `verify-audit` intact, 3 Decision Records |
