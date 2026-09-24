corpus snapshot: s1-synthetic (seed 1, 40 Principals, 30 days, 300,000 Actions; sampler weights from transcripts-2026-09-23-1036 published distributions); classifier 0.2.4; measured 2026-09-24; 30-day resultHash `d4f921e6…d782`
<!-- evidence-numbers
s1.principals: 40
s1.days: 30
s1.actions: 300,000
s1.evaluated: 296,084
s1.window.1d.actions: 10,000
s1.window.1d.ms: 28.4
s1.window.7d.actions: 70,000
s1.window.7d.ms: 111.1
s1.window.30d.actions: 300,000
s1.window.30d.ms: 473
s1.us-per-action: 0.79
ch17.us-per-action: 50
s1.resultHash: d4f921e6…d782
-->

# Synthetic organization S1 replay performance

S1 is the synthetic organization in `docs/design.md` chapter 36.1: 40 Principals, 30 days, about 300,000 Actions, with the published R1 mix as the sampler seed.
This run generated exactly 300,000 Actions (seed 1) and timed in-memory `computeDiff` of the default Policy template against a candidate that allows `fetch` on `unknown_remote` (the Gate 2 B shape).
Fragments, paths, hosts, and Session identifiers are synthetic; the generator never reads transcripts.

Re-run: `pnpm exec tsx tools/local-pipeline/s1.ts`.

## Generator

| item | value |
| --- | ---: |
| Principals | 40 |
| days | 30 |
| Actions | 300,000 |
| evaluated | 296,084 |
| excluded (no Operation) | 3,916 |
| origin | 2026-01-01T00:00:00.000Z |

Sampler weights are the published R1 Action counts on classifier 0.2.4 (`docs/evidence/adoption-preview.md`: allow 17,509, ask and deny 16,981, excluded 450, analyzability none 6,848 of 34,490 evaluated).
Each Action carries one deciding Operation (a trailing `none` execute is added on a slice of already-ask Actions so Action-level none stays near the published 19.9% share).
That is fewer Operations per Action than R1 (~5), so the µs/Action figures below are a lower bound relative to recorded traces.

## Window timings against chapter 17

Chapter 17 estimates replay evaluation at 50 µs per Action per Policy Version (two Versions), so 12,000 Actions in 1.2 s and 231,000 Actions in 23 s.
The table uses the same 50 µs model on each S1 window (`50 × 2 × Action count`).

| window | Actions | evaluated | changed | measured `computeDiff` | chapter 17 estimate | µs/Action/Version |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 day | 10,000 | 9,881 | 54 | 28.4 ms | 1,000 ms | 1.42 |
| 7 days | 70,000 | 69,104 | 375 | 111.1 ms | 7,000 ms | 0.79 |
| 30 days | 300,000 | 296,084 | 1,666 | 473 ms | 30,000 ms | 0.79 |

30-day `resultHash` `d4f921e6439da395d6f932a30067d0d35feafdc8ddb041af15181825a311d782` (`d4f921e6…d782`).
1-day `a1d1ddf6…d0a9`; 7-day `0896c52b…ab50`.

Steady-state cost on the 30-day window is 0.79 µs per Action per Version, about 60× below the chapter 17 figure of 50 µs.
A 10,000 Action day is 28.4 ms against the 1 s (10,000) / 1.2 s (12,000) envelope; 300,000 Actions are 473 ms against 30 s (and against the 23 s figure for 231,000).
The measured times stay in the same order of magnitude as each other (tens to hundreds of milliseconds) and are two orders below the envelope-of-seconds model.
Replay at S1 size is still a batch job in the product sense of chapter 17.3, but the 50 µs/Action constant overstates cost on this machine and this Operation mix.

## Limits

- Wall time is `computeDiff` only, after Actions are already in memory. It does not include classify, import, or PostgreSQL reads (chapter 17's 600 B/Action read of 139 MB).
- One (sometimes two) Operations per Action, synthetic fragments, default Environment Profile rather than the corrected policy A profile.
- Changed-Action counts (54 / 375 / 1,666) follow the S1 sample of unknown-remote fetch, not the 166 recorded Gate 2 rows.
- Timings are from one local run on 2026-09-24; they are not a CI bound.
