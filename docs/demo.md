# Demo script

This is the script for recording the V1 journey as a screen demo.
It follows the twelve steps of the scripted fresh-volume journey in `docs/evidence/adoption-preview.md`, one screen per step and one spoken line per screen.

Live figures are from classifier 0.2.3 on corpus snapshot transcripts-2026-09-23-1036, measured 2026-09-24.
Each one names the measured block in `docs/evidence/adoption-preview.md` that carries it.
After `pnpm evidence:remeasure` rewrites the evidence for another classifier, refill every figure from its block.
Do not take a figure from memory, from an older evidence version, or from what a rehearsal showed on screen.
Screen labels are quoted as the web app renders them.

## What the demo claims

The demo answers two questions on recorded Actions: what a first Policy would ask or deny, and which Actions a Policy change would move to a different Effect.
It does not claim that a runtime follows the evaluated Effects, that adoption deploys anything, or that a person gave the Verdicts in the measured record.
Keep every spoken line inside the grade in `docs/evidence/v1-metrics.md`.

## Scenario

| step | screen | spoken line | figures to highlight |
| --- | --- | --- | --- |
| 1 import | terminal, `pnpm authority import` | "We load one person's recorded Claude Code transcripts; secrets are redacted and every tool call is classified into Operations." | 1,036 sessions, 34,940 accepted, 196 duplicates, 0 failed (`remeasure:adoption-journey`, step 1) |
| 2 overview, no Policy | `/` | "Before any Policy exists, this is only what the Agents did: which Capabilities, which targets, and how much we could not analyze." | Action 34,940, evaluable 34,490; analyzability full / partial / none 17,972 / 6,610 / 9,908 (`remeasure:adoption-journey`, step 2); "아직 조직 정책이 없습니다" |
| 3 first Policy | version editor | "The first Policy starts from the default template; we declare our environment and validate it." | "검증: 통과"; content hash of policy A `f96ed41d…beb8` (`remeasure:adoption-journey`, step 3) |
| 4 adoption preview | review | "Applied to the past with no baseline, this Policy would allow this share, ask for this share, and deny these few." | evaluated 34,490; 허용 15,242 (44.2%), 확인 필요 19,228 (55.7%), 차단 20 (0.06%, rendered `0.1%`); 22 ask and 2 deny groups (`remeasure:adoption-result`); "기준 VERSION 없음 (최초 도입)" |
| 5 group detail | one deny group, one ask group | "Each group is one judgement the Policy makes; the headline says it in a sentence, and commands stay in the sample panel." | the Headlines of `deny · read · credentials` (13 Actions) and `ask · execute · host` (8,048 Actions), the largest ask group with 133 distinct programs (`remeasure:adoption-groups`) |
| 6 verdicts | review, verdict selects | "Nothing is adopted until every group has a Verdict; the blocker counts down as we judge." | "판정하지 않은 group N개" counting down, then "Gate: 열림"; 24 groups (`remeasure:adoption-result`) |
| 7 adopt | review, then `/` | "Adopting is a review record, not a deployment; applying it to the runtime happens outside Authority Diff." | "채택됨", "채택은 검토 기록입니다. runtime 설정 반영은 Authority Diff 밖에서 이루어집니다.", "채택된 정책: version #1" |
| 8 report | downloaded Evidence Report | "The report carries the hashes, so anyone can re-run the replay and get the same result." | adoption resultHash `8ae52329dd61bdb900f61075fd75c4eb66232fa3ff370245df6b1baec752a444` (`remeasure:adoption-determinism`); the notice that figures do not recover past runtime approvals |
| 9 conformance | `/conformance` | "This is the only screen about what the runtime actually did, compared with the Policy we adopted." | 92 findings, conformance resultHash `7710c06c…8689` (`remeasure:adoption-journey`, step 9); violation and under_asked rows |
| 10 change review | version 2, review | "Now a change: allow fetches from unknown remotes, and, by mistake, trust every GitHub repository with one host-wide pattern." | 139 넓어진 Actions, 7 Widening groups, resultHash `3082d2a4…1598` (`remeasure:adoption-journey`, step 10); the groups whose Zone moves `unknown_remote → trusted_remote`, marked critical |
| 11 unexpected, reject, fix, accept | review, version 3 | "Trusting another owner's repository was not what we meant, so the Gate blocks; we reject, drop the host-wide pattern, and accept the change without it." | "Gate: blocker 1건", disabled accept, "반려됨"; version 3 changed 139 Actions, 5 Widening groups, resultHash `2c4577fa…a8d9` (`remeasure:adoption-journey`, step 11); "채택됨" |
| 12 audit | terminal, then `/` | "Every decision is in a hash chain, and the chain verifies intact." | `verify-audit` `isIntact` true, `checkedCount` 3 (`remeasure:adoption-journey`, step 12); "채택된 정책: version #3" with its Effect distribution |

Close on step 12.
Do not add a line about enforcement, blocked attacks, or a person's review time.

## Fresh-volume seed procedure

Every take runs on a compose project of its own with an empty volume, built from the commit being demonstrated.
The maintainer's stack and its volume are not used and are not deleted.

Inputs live under `.local/` and never enter the repository: the transcript snapshot, policy A, B', and B documents, the hook spool copies, and the conformance window.
They are the same files `.local/evidence-remeasure.json` names for `pnpm evidence:remeasure`.

1. Stop the maintainer's stack without removing its volume, because the web dev server proxies `/api` to `localhost:8787`:

   ```sh
   docker compose stop
   ```

2. Start a demo project; `-p` gives it a new, empty volume:

   ```sh
   docker compose -p authority-demo up -d --build --wait
   ```

3. Load the data, one of two ways.

   Full take, from step 1: import only, so step 2 shows "아직 조직 정책이 없습니다" and step 3 creates the first Policy on screen.

   ```sh
   AUTHORITY_CLI_SERVER_URL=http://localhost:8787 \
   AUTHORITY_CLI_TOKEN=local-dev-token \
     pnpm authority import <snapshot>
   ```

   Retake from step 4: seed instead, which imports and creates draft version 1 with policy A in one command. `/` then shows "최초 정책 설정 계속하기".

   ```sh
   AUTHORITY_DB_URL=postgres://authority:authority@localhost:55432/authority \
   AUTHORITY_AUTH_TOKEN=local-dev-token \
     pnpm seed:demo --snapshot <snapshot> --policy <policy-A.json>
   ```

4. Serve the web app and log in with `local-dev-token`:

   ```sh
   pnpm --filter @authority/web dev
   ```

5. Tear the project down after the take and bring the maintainer's stack back:

   ```sh
   docker compose -p authority-demo down -v
   docker compose start
   ```

Check the import summary against step 1's figures before recording on; a different count means a different snapshot or classifier.

## Recording order

Recording proceeds from tag `evidence-2026-09-24-classifier-0.2.3`, the evidence snapshot these figures come from.
Verdicts, adoption, rejection, and acceptance are one-way on a volume, so record in journey order on one volume.
A retake of any step after one of them needs a new volume from the seed procedure.

1. Terminal: step 1 import. Cut the wait between the command and its summary.
2. Browser: steps 2 to 8 in order.
   Capture step 6 once before the first Verdict, so the blocker and the disabled "최초 정책 채택" are on screen.
3. Off camera: stage conformance.
   Copy the spool files into `<scratch-home>/.authority/spool/`, flush them, and request the run; V1 has no screen that starts a conformance run.

   ```sh
   HOME=<scratch-home> \
   AUTHORITY_CLI_SERVER_URL=http://localhost:8787 \
   AUTHORITY_CLI_TOKEN=local-dev-token \
     pnpm authority spool-flush

   curl -s -X POST http://localhost:8787/api/v1/replay-runs \
     -H 'authorization: Bearer local-dev-token' \
     -H 'content-type: application/json' \
     -d '{"kind":"conformance","candidateVersionId":"<version-1-id>","windowFrom":"<from>","windowTo":"<to>"}'
   ```

4. Browser: step 9 once the run has completed.
5. Browser: steps 10 and 11.
   Capture step 11 once after the unexpected Verdicts and before rejecting, so the blocker copy and the disabled accept are on screen.
6. Terminal: step 12, then the browser on `/` for the version 3 distribution.

   ```sh
   AUTHORITY_CLI_SERVER_URL=http://localhost:8787 \
   AUTHORITY_CLI_TOKEN=local-dev-token \
     pnpm authority verify-audit
   ```

7. Tear down with the last command of the seed procedure.
