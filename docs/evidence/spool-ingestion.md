corpus snapshot: transcripts-2026-09-25-891 (2026-09-25, 891 files, 21,787 Actions); classifier 0.2.6; measured 2026-09-25; conformance resultHash `239486f7…2f3b`
<!-- evidence-numbers
spool-ingestion.devices: 1
spool-ingestion.observations: 22,191
spool-ingestion.observation-sessions: 964
spool-ingestion.files-sent: 5
spool-ingestion.files-failed: 0
spool-ingestion.snapshot.sessions: 891
spool-ingestion.snapshot.actions: 21,787
spool-ingestion.window-actions: 21,188
spool-ingestion.conformance.resultHash: 239486f7…2f3b
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
- Stack: a compose project of its own with an empty volume; the server, the CLI, and the local computation all came from a main commit that matches refusal and block markers only on error results.
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
The 964 observed sessions exceed the snapshot's 891 because 209 of them have no transcript file in the snapshot: 198 have only session_end observations and 11 only pre_tool_use observations; the other 755 appear in both.
The 3 permission_request observations are the AskUserQuestion dialogs `conformance.md` describes; the run reports 0 unpaired permission_requests.

## Conformance result

Completed; classifierVersion 0.2.6; resultHash `239486f7de70cb67e4b1900630083c82f55a870b2afb77b8168176152d4b2f3b`.

| kind | groups | Actions |
| --- | ---: | ---: |
| violation | 7 | 25 |
| under_asked | 157 | 6,549 |
| over_asked | 0 | 0 |

Stats: total 21,188 window Actions, evaluated 18,883, excluded 2,305, changed 6,613.
Transitions (observed Disposition Effect → candidate Effect): allow→allow 12,270, allow→ask 6,549, allow→deny 22, deny→allow 8, deny→ask 34, all others 0.

| permission mode | Actions | in a finding |
| --- | ---: | ---: |
| bypassPermissions | 15,229 | 4,983 |
| unknown | 5,959 | 1,591 |

- Violations: credential-path reads (18), a credential-path write (1), a credential-path delete (1), and shared-remote rewrites (5).
  22 of them are auto-executed Actions; the other 3 have no paired observation and are reported without a transition.
- under_asked by zone: host 5,638, public_remote 407, unknown_remote 156, workspace 148, protected 126, agent_config 74.
- under_asked by capability: execute 2,369, read 2,182, write 1,128, fetch 654, delete 160, send 39, rewrite 14, push 3.
- over_asked is 0 because no evaluated Action has an observed `ask` Effect.
  Refusal and block markers now count only on error results, so a successful tool result that merely contains a marker string no longer reads as a refusal.

## What this does not show

- Observations from a second device were not loaded, so this run cannot show that spools from several devices merge into one conformance window.
- `spool-flush --from` was exercised on a copy made on the same device, which checks the copy path but not a transfer between devices.
