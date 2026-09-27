synthetic fixture: tests/fixtures/journey; classifier 0.2.6; measured 2026-09-27; first head `55f973a572fa6b4d91a8c1d49d7fc59f3dd2043f`, rerun head `060c6d6cbc6c7279fb410c55fd6433fa1f9774c3`; resultHashes: adoption `d9b3a37b…ed6e`, conformance `8cc351df…942f`, change review B' `aa9885ff…bd42`, change review B `88118f6e…9860`

# V1 freeze check

The V1 freeze gate run on main at `55f973a572fa6b4d91a8c1d49d7fc59f3dd2043f`, the commit that replaced deep same-package relative imports with the `#lib/*`, `#src/*`, and `#schema` subpath aliases.
It asks one question: do those aliases resolve in the server image that `docker compose` builds, and not only in local tools?

The fixture is synthetic (`tests/fixtures/journey`); its expected figures live in that fixture's `expected.md`.
Raw outputs, downloaded Evidence Reports, and scratch homes stay under `.local/freeze-check/` and do not enter the repository.

## Environment

| item | value |
| --- | --- |
| date | 2026-09-27 |
| commit | `55f973a572fa6b4d91a8c1d49d7fc59f3dd2043f` (origin/main) |
| host | macOS 15.5, arm64 |
| Node (host) | 22.23.3 (`.nvmrc` 22) |
| pnpm | 12.5.1 |
| Docker Engine | 29.4.0, linux/arm64 |
| Docker Compose | 5.1.2 |
| server image | `apps/server/Dockerfile` (`node:22`), built fresh for every compose project below |
| visual image | `mcr.microsoft.com/playwright:v1.63.0-noble`, linux/amd64, Node 22.23.3 |

## Result

| gate | command | result |
| --- | --- | --- |
| API journey, fresh volume | `pnpm tsx tools/local-pipeline/journey-check.ts` | pass; all twelve steps match `expected.md` |
| browser journey, English | seed procedure in `docs/demo.md` with the fixture, then the steps in `docs/evidence/adoption-preview.md` | pass, 12 of 12 steps |
| browser journey, Korean | same, on a second fresh volume | pass, 12 of 12 steps |
| verify-audit | `pnpm authority verify-audit` (step 12 of each journey) | intact, `checkedCount` 3, on all three volumes |
| check:evidence | `pnpm check:evidence` | pass, exit 0 |
| e2e:visual | `pnpm e2e:visual` inside the pinned Playwright image, as the `e2e-visual` CI job runs it | pass, 12 of 12 screenshots, no baseline differs |

Conclusion: the `#lib/*`, `#src/*`, and `#schema` aliases resolve in the docker execution path; the compose-built server started, migrated, and served every step of all three journeys without a failure.

## API journey

`journey-check.ts` wrote a compose project of its own (`authority-remeasure-<time>`), built the server image from the working tree, started it on an empty volume, ran the twelve steps through the API, and removed the project and its volume with `down -v`.
It printed `2026-09-27 55f973a572fa6b4d91a8c1d49d7fc59f3dd2043f pass; intact, 3 decision records`.

| step | result |
| --- | --- |
| 1 import | 3 Sessions, 18 accepted, 0 duplicates, 0 failed |
| 2 overview, no Policy | no Policy; Action 18, evaluable 18; analyzability 14 / 3 / 1 |
| 3 first Policy | draft version 1 replaced with policy A (`36aeb353…a0d2`), validation passed |
| 4 adoption preview | kind `adoption`, no baseline; evaluated 18; allow 6, ask 9, deny 3; 6 ask and 1 deny Adoption Groups; resultHash `d9b3a37b…ed6e` equals the local computation on two runs |
| 5 group detail | `deny · read · credentials` and `ask · fetch · unknown_remote` return a Headline and samples |
| 6 verdicts | 7 Adoption Groups set to `expected`; `adoption_unreviewed` blocks the Gate until the last one |
| 7 adopt | review `accepted`, version 1 `accepted` |
| 8 report | adoption Evidence Report carries resultHash `d9b3a37b…ed6e` |
| 9 conformance | 2 spool copies sent; conformance Replay Run completed with 7 Conformance Findings, resultHash `8cc351df…942f` |
| 10 change review B' | draft version 2 with B' (`2648730f…04d9`); changed 4, Widening group 3; resultHash `aa9885ff…bd42` equals the local run |
| 11 unexpected, reject, B, accept | 1 `unexpected` Verdict raises `widening_unexpected` and accept is refused; rejected; draft version 3 with B (`e7134289…5588`): changed 4, Widening group 2, resultHash `88118f6e…9860` equals the local run; accepted |
| 12 audit | `verify-audit` intact, 3 Decision Records |

## Browser journeys

Each language ran on the compose project `authority-demo` from the seed procedure in `docs/demo.md`: `docker compose -p authority-demo up -d --build --wait` on a newly created volume, `pnpm authority import` of the fixture transcripts, the web app from `pnpm --filter @authority/web dev`, and `docker compose -p authority-demo down -v` afterwards.
The Korean run started only after the English volume was removed, so it began from an empty database again.
The language was switched with the header language toggle; every step read the rendered screen.
Step 9 staged conformance off screen as `docs/demo.md` describes (`spool-flush` from a scratch home, then a `conformance` Replay Run request), then read `/conformance`.

| step | English | Korean |
| --- | --- | --- |
| 1 import | pass: 3 Sessions, 18 accepted, 0 duplicates, 0 failed | pass: same summary |
| 2 overview, no Policy | pass: Actions 18, evaluable 18, analyzability 14 / 3 / 1, "No organization policy yet" | pass: same figures, "<!-- ko-product-output -->아직 조직 정책이 없습니다" |
| 3 first Policy | pass: content hash `36aeb353…a0d2`, "Validation: passed" | pass: same hash, "<!-- ko-product-output -->검증: 통과" |
| 4 adoption preview | pass: evaluated 18; allow 6 (33.3%), ask 9 (50.0%), deny 3 (16.7%); "Ask groups (6)", "Deny groups (1)"; baseline "None (initial adoption)" | pass: same figures; "<!-- ko-product-output -->확인 필요 group (6)", "<!-- ko-product-output -->차단 group (1)" |
| 5 group detail | pass: the deny group (3 Actions) and the `fetch · unknown_remote` ask group (4 Actions) show a Headline and Program Summary outside the sample panel | pass: same groups, Headlines rendered in Korean |
| 6 verdicts | pass: the blocker counts down to "1 group not judged", then "Gate: open"; adopt stays disabled until then | pass: same, ending in "Gate: <!-- ko-product-output -->열림" |
| 7 adopt | pass: status "Accepted", the Decision Record, verdict controls disabled, `/` shows "Accepted policy: version #1" | pass: status "<!-- ko-product-output -->채택됨", `/` shows version #1 |
| 8 report | pass: the downloaded Evidence Report carries contentHash `36aeb353…a0d2`, resultHash `d9b3a37b…ed6e`, allow / ask / deny 6 / 9 / 3, both group tables, the decision, and the Notice | pass: same report content |
| 9 conformance | pass: 2 files sent, run completed with resultHash `8cc351df…942f`; `/conformance` lists 7 findings | pass: same resultHash, 7 findings |
| 10 change review B' | pass: B' content hash `2648730f…04d9`; 4 widened Actions, 3 critical Widening groups; resultHash `aa9885ff…bd42` | pass: same figures and resultHash |
| 11 unexpected, reject, B, accept | pass: 1 unexpected group gives "Gate: 1 blocker" with accept disabled; rejected; version 3 with B (`e7134289…5588`): 4 widened Actions, 2 Widening groups, resultHash `88118f6e…9860`; accepted | pass: same, blocker copy in Korean |
| 12 audit | pass: `verify-audit` intact, `checkedCount` 3; `/` shows version #3 with allow / ask / deny 10 / 5 / 3 | pass: same |

The browser console logged no errors in either run.

## Visual suite

The suite ran in a clean export of the commit inside the pinned image on linux/amd64, with `CI=true`, `pnpm install --frozen-lockfile`, and `pnpm e2e:visual`.
All 12 screenshots (six screens, light and dark) matched the committed baselines; no baseline was regenerated.

## Freeze gate rerun - 2026-09-27

The release-commit check ran on origin/main at `060c6d6cbc6c7279fb410c55fd6433fa1f9774c3`, after the probe fixture record and adapter-level normalization merge. The first run above remains the record of `55f973a572fa6b4d91a8c1d49d7fc59f3dd2043f`.

| item | value |
| --- | --- |
| date | 2026-09-27 |
| commit | `060c6d6cbc6c7279fb410c55fd6433fa1f9774c3` (origin/main) |
| fixture | `tests/fixtures/journey`, classifier 0.2.6 |
| host | macOS 15.5, arm64 |
| Node (host) | 22.23.3 (`.nvmrc` 22) |
| pnpm | 12.5.1 |
| Docker Engine | 29.4.0, linux/arm64 |
| Docker Compose | 5.1.2 |
| server image | `apps/server/Dockerfile` (`node:22`), built for each fresh-volume compose project |
| visual image | `mcr.microsoft.com/playwright:v1.63.0-noble`, linux/amd64, `CI=true` |

| gate | command | result |
| --- | --- | --- |
| API journey, fresh volume | `pnpm tsx tools/local-pipeline/journey-check.ts --out .local/freeze-check/api-journey` | pass; all 12 steps match `expected.md`; printed `2026-09-27 060c6d6cbc6c7279fb410c55fd6433fa1f9774c3 pass; intact, 3 decision records` |
| browser journey, English | seed procedure in `docs/demo.md` with the synthetic fixture, then the steps in `docs/evidence/adoption-preview.md` | pass, 12 of 12 steps; initial review evaluated 18 Actions, allow / ask / deny 6 / 9 / 3, with 6 ask and 1 deny groups; change review B' widened 4 Actions in 3 groups, and B widened 4 in 2 groups |
| browser journey, Korean | same procedure, on a second fresh volume after `docker compose -p authority-demo down -v` | pass, 12 of 12 steps with the same counts; no browser console errors |
| verify-audit | `pnpm authority verify-audit` at step 12 of the API journey and of each browser journey | pass; `isIntact` true, `checkedCount` 3 on all three volumes |
| check:evidence | `pnpm check:evidence` | pass, exit 0 |
| check:doc-invariance | `pnpm check:doc-invariance` | pass, exit 0 |
| probe fixture contract | `pnpm exec vitest run packages/probe/tests/decision-provider.test.ts packages/probe/tests/probe.test.ts` | pass, 15 passed and 1 skipped in 2 files |
| probe fixture replay | `pnpm dev:policy-init` then `pnpm authority probe --policy .local/freeze-check/default-policy-v2.json` (default fixture provider) | pass; schemaVersion 2 default template, report sha256/resultHash `f12dc94ff6173d17e2caf2f6116a5beac78d40df978ea06d6c99274d8ae709df` |
| e2e:visual | `pnpm e2e:visual` with `CI=true` inside `mcr.microsoft.com/playwright:v1.63.0-noble` on linux/amd64, after `pnpm install --frozen-lockfile` | pass, all 12 screenshots matched; no baselines regenerated |

The API journey used its own `authority-remeasure-<time>` compose project and removed its volume with `down -v`. Both browser journeys used `authority-demo`, built the server image, imported the fixture transcripts and served the web app; the project and volume were removed with `down -v` after each language. The fixture replay used the recorded responses, not a live provider. No runtime policy deployment or enforcement was tested.

Conclusion: every rerun gate passed on `060c6d6cbc6c7279fb410c55fd6433fa1f9774c3`; no freeze finding blocks the V1 release.
