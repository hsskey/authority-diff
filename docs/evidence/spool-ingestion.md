corpus snapshot: transcripts-2026-09-25-891 (2026-09-25, 891 files, 21,787 Actions); classifier 0.2.6; measured 2026-09-25; conformance resultHash `0df3f6e1…b7be`
<!-- evidence-numbers
spool-ingestion.devices: 1
spool-ingestion.observations: 22,191
spool-ingestion.observation-sessions: 964
spool-ingestion.files-sent: 5
spool-ingestion.files-failed: 0
spool-ingestion.snapshot.sessions: 891
spool-ingestion.snapshot.actions: 21,787
spool-ingestion.window-actions: 21,188
spool-ingestion.conformance.resultHash: 0df3f6e1…b7be
-->

# Spool ingestion (single device)

This document records one hook spool loaded with `authority spool-flush --from` into a fresh server and the conformance run for policy A over the same span.
multi-device merge is not yet demonstrated; evidence is single-device only.
Every number below is labelled **classifier 0.2.6, policy A** (measured 2026-09-25).
No repository names, host paths, device names, or raw command text appear below.

## Method

- Source: the hook spool of 1 device, cut at 2026-09-25T05:24:53.000Z.
  All five spool files of that device were copied into a separate directory at the cut; two of them had already been sent to another server by earlier flushes and were copied under `.jsonl` names so every observation loads once.
  Only the copies were renamed to `.sent`; the device's own spool was not touched.
- Snapshot: every local transcript file written to at or after 2026-09-22T12:00:00.000Z, cut at the same instant (891 files).
- Stack: a compose project of its own with an empty volume and a server built from the commit under test.
- Steps 1 to 8 of the scripted journey (`docs/evidence/adoption-preview.md`) ran on this snapshot: import with 0 failed sessions and 21,787 Actions accepted, policy A adopted as version 1.
- `authority spool-flush --from` with the copy directory sent the observations, then a `conformance` run for version 1 was requested through the API over 2026-09-22T12:00:00.000Z .. 2026-09-25T05:24:53.000Z.
  The change-review steps after step 9 were not run.

## Ingestion

| item | value |
| --- | ---: |
| devices | 1 |
| spool files sent / failed | 5 / 0 |
| observations stored | 22,191 |
| pre_tool_use | 21,243 |
| session_end | 945 |
| permission_request | 3 |
| sessions with an observation | 964 |
| first observation | 2026-09-22T12:13:07Z |
| last observation | 2026-09-25T05:24:52Z |

The stored count equals the line count of the five copies, so no line was dropped or stored twice.
The 3 permission_request observations are the AskUserQuestion dialogs `conformance.md` describes; the run reports 0 unpaired permission_requests.

## Conformance result

Completed; classifierVersion 0.2.6; resultHash `0df3f6e1a8bd3b6254481874571f71cd512586c8c9728cd9459e1f90a4b9b7be`.

| kind | groups | Actions |
| --- | ---: | ---: |
| violation | 7 | 25 |
| under_asked | 157 | 6,539 |
| over_asked | 7 | 28 |

Stats: total 21,188 window Actions, evaluated 18,883, excluded 2,305, changed 6,643.
Transitions (observed Disposition Effect → candidate Effect): allow→allow 12,235, allow→ask 6,539, allow→deny 22, ask→allow 28, ask→ask 5, deny→allow 15, deny→ask 39, all others 0.

| permission mode | Actions | in a finding |
| --- | ---: | ---: |
| bypassPermissions | 15,229 | 5,003 |
| unknown | 5,959 | 1,589 |

- Violations: credential-path reads (18), a credential-path write (1), a credential-path delete (1), and shared-remote rewrites (5).
  22 of them are auto-executed Actions; the other 3 have no paired observation and are reported without a transition.
- under_asked by zone: host 5,631, public_remote 406, unknown_remote 156, workspace 148, protected 125, agent_config 73.
- under_asked by capability: execute 2,368, read 2,178, write 1,125, fetch 652, delete 160, send 39, rewrite 14, push 3.
- over_asked: `read · workspace` (27) and `execute · workspace` (1).
  `conformance.md` explains earlier over_asked Actions as tool results misread as refusals; this run did not re-examine these 28.

## What this does not show

- Observations from a second device were not loaded, so this run cannot show that spools from several devices merge into one conformance window.
- `spool-flush --from` was exercised on a copy made on the same device, which checks the copy path but not a transfer between devices.
