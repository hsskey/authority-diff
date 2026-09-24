corpus snapshot: transcripts-2026-09-23-1036 (2026-09-23, 1,036 files, 34,940 Actions); classifier 0.2.5; measured 2026-09-24; conformance resultHash `269a53d2…dd23`
<!-- evidence-numbers
snapshot.sessions: 1,036
snapshot.actions: 34,940
snapshot.duplicates: 196
conformance.resultHash: 269a53d2…dd23
-->

# Conformance (policy A)

Conformance replay compares the accepted policy A against observed runtime Disposition over a window of hook observations.
<!-- remeasure:conformance-intro -->
Every number in the main sections is labelled **classifier 0.2.5, policy A** (measured 2026-09-24); the earlier 0.2.4, 0.2.3, 0.2.2, 0.2.1 measurements are kept unchanged under "Previous version" at the end.
<!-- /remeasure:conformance-intro -->
No repository names, host paths, or raw command text appear below.

The main sections below are the fixed-window run. The Tuesday-Thursday window was not re-run; its record is under Previous version.
`pnpm evidence:remeasure` re-runs the fixed window as step 9 of the adoption journey (`docs/evidence/adoption-preview.md`).

## Fixed window

The sections below are the fixed-window run that `pnpm evidence:remeasure` rewrites; the stamp on the first line of this document is its snapshot and resultHash.

### Method

<!-- remeasure:conformance-method -->
- Candidate is policy A from the v2 environment profile, adopted as version 1 through the first-policy journey (`docs/evidence/adoption-preview.md`) on a fresh volume.
- Window: 2026-09-22T12:00:00.000Z .. 2026-09-23T05:10:14.000Z, the same as the earlier runs.
- Import: 1,036 sessions, 34,940 Actions accepted, 196 duplicates, 0 failed (the NUL fix is on this build, so the 7 sessions that failed in 0.2.1 imported; their 904 Actions are outside the window).
- Spool: copies of the hook observation files flushed from an isolated scratch home; the live file was cut at the same instant as the first run so the observation set is identical (3,789 lines: pre_tool_use 3,666, session_end 121, permission_request 2). Only the copies were renamed.
- The run was requested through the API; V1 has no screen that starts a conformance run. Completed; classifierVersion 0.2.5; resultHash `269a53d23b5cdea6a95aafbfc0d4b828ea0c21ae5d1ced8afdf85b71f122dd23`.
<!-- /remeasure:conformance-method -->

### Findings by kind

<!-- remeasure:conformance-findings -->
| kind | groups | Actions |
| --- | ---: | ---: |
| violation | 3 | 6 |
| under_asked | 84 | 1,069 |
| over_asked | 0 | 0 |

Stats: total 4,440 window Actions, evaluated 3,189, excluded 1,251, changed 1,079.
Transitions (observed Disposition Effect → candidate Effect): allow→allow 2,110, allow→ask 1,069, allow→deny 3, deny→ask 7, all others 0.
<!-- /remeasure:conformance-findings -->
The violations are the same 6 Actions as in every earlier run; the fixed-window `resultHash` is unchanged.

### Violations (6 Actions)

- 3 credential-path reads via grep (1 Action) and ls (2 Actions).
- 3 shared-remote rewrites via git (3 Actions in 2 sessions), all `--force-with-lease` pushes to the agent's own pull request feature branch.

See `conformance-limitations.md` for the first-run narrative and hook-outage context.

### under_asked

<!-- remeasure:conformance-under-asked -->
| zone | Actions |
| --- | ---: |
| host | 963 |
| public_remote | 43 |
| workspace | 20 |
| protected | 19 |
| unknown_remote | 13 |
| agent_config | 11 |

| capability | Actions |
| --- | ---: |
| execute | 413 |
| read | 397 |
| write | 158 |
| fetch | 70 |
| delete | 23 |
| send | 4 |
| rewrite | 3 |
| push | 1 |
<!-- /remeasure:conformance-under-asked -->

Top five under_asked groups account for 422 / 1,069 Actions (39%): `execute · host` via StructuredOutput (111 Actions, 88 sessions), `execute · host` via one local tool (98, 8), `read · host` via cd (93, 14), `read · host` via cat (60, 18), `read · host` via ls (60, 25).

#### Why host under_asked stays at 963

Both the default template and policy A ask on read, write, and execute outside the workspace and on `execute` whose effect could not be determined, and the `workspace` Zone is the Action's workspace root, not the remote lists.
Paths under the Session's own `~` workspace root now count as `workspace`, and a script named by a path inside the workspace is an `execute` that the policy allows, so what stays in `host` is `execute` of local tools and of scripts outside the workspace (413 Actions) and reads, writes, and deletes across sibling worktrees and other directories outside the workspace root (550); `docs/evidence/replay-limitations.md` records the path comparison that keeps those Operations in `host`.
An organization that needs this volume to drop must narrow the runtime or widen the spec; that is an environment-profile or Zone-rule change, not a re-run artifact.

### over_asked (0)

`over_asked` is 0.
The window's only permission_requests are the 2 AskUserQuestion dialogs; neither is an Action with an Operation for policy A to evaluate, and the second falls after the frozen snapshot's last Action.

### Disposition (window Actions)

| Disposition | count |
| --- | ---: |
| auto_executed | 3,202 |
| executed_prompt_unknown | 1,231 |
| blocked | 7 |
| prompted | 0 |
| hook_approved | 0 |

Identical to the earlier runs. Sidechain Actions in the window (69) remain executed_prompt_unknown.
`prompted` 0 comes from counting the stored observations, which skips the permission_request pairing; the pairing that makes prompted 2 is recorded with the Tuesday-Thursday window under Previous version.

## Previous version: classifier 0.2.4 (not re-run)

Conformance replay compares the accepted policy A against observed runtime Disposition over a window of hook observations.
Every number in the main sections is labelled **classifier 0.2.4, policy A** (measured 2026-09-24); the earlier 0.2.3, 0.2.2, 0.2.1 measurements are kept unchanged under "Previous version" at the end.
No repository names, host paths, or raw command text appear below.

This document holds two runs of policy A on classifier 0.2.4.
"Tuesday-Thursday window" covers every hook observation from 2026-09-22 to 2026-09-24 and is the first run with permission modes.
"Fixed window" is the earlier 17-hour window on the frozen snapshot; `pnpm evidence:remeasure` re-runs it as step 9 of the adoption journey (`docs/evidence/adoption-preview.md`).

### Tuesday-Thursday window

corpus snapshot: transcripts-2026-09-24-650 (2026-09-24, 650 files, 18,061 Actions); classifier 0.2.4; measured 2026-09-24; conformance resultHash `c54d43cd…b201`

#### Method

- Candidate is policy A from the v2 environment profile, adopted as version 1 through the first-policy journey on a fresh volume, as in the fixed window.
- Window: 2026-09-22T12:00:00.000Z .. 2026-09-24T13:49:06.000Z, the instant the snapshot and the spool were cut.
- Snapshot: every local transcript file written to at or after the window start (650 files).
  Import: 650 sessions, 18,061 Actions accepted, 0 duplicates, 0 failed.
  One session imported only after the redaction fix in this change: its 16,000-character input cut split a `__REDACTED_…__` token, and the server's re-redaction rejected the session.
- Spool: copies of all four hook observation files of the three days, flushed from an isolated scratch home (17,904 lines: pre_tool_use 17,287, session_end 614, permission_request 3).
  Only the copies were renamed.
- The run went through step 9 of the scripted journey (`pnpm evidence:remeasure` with a config naming this snapshot, spool, and window).
  The later change-review steps assume the fixed snapshot and were not used.
  Completed; classifierVersion 0.2.4; resultHash `c54d43cd8259493aa342f0ce00d00db4030e32374b1b4d06ab886c069783b201`; unpairedPermissionRequests 0.
- Disposition counts come from a query over the run's database that applies the run's permission_request pairing and Disposition rules; its per-mode totals equal the run's `byPermissionMode`.

#### Findings by kind

| kind | groups | Actions |
| --- | ---: | ---: |
| violation | 7 | 18 |
| under_asked | 148 | 6,003 |
| over_asked | 3 | 7 |

Stats: total 17,460 window Actions in 642 sessions, evaluated 16,088, excluded 1,372, changed 6,059.
Transitions (observed Disposition Effect → candidate Effect): allow→allow 10,029, allow→ask 6,003, allow→deny 15, ask→allow 7, deny→allow 8, deny→ask 26, all others 0.
15 violations are auto-executed Actions; the other 3 have no observation and are excluded from the transitions but still reported.

#### By permission mode

The hook recorded one mode, `bypassPermissions`; no Action carried `default`, `acceptEdits`, `plan`, or `auto`.

| permission mode | Actions | in a finding | violation | under_asked | over_asked | auto_executed | prompted | blocked | executed_prompt_unknown |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| bypassPermissions | 11,526 | 4,261 | 10 | 4,244 | 7 | 11,513 | 7 | 6 | 0 |
| unknown | 5,934 | 1,767 | 8 | 1,759 | 0 | 4,664 | 3 | 28 | 1,239 |
| total | 17,460 | 6,028 | 18 | 6,003 | 7 | 16,177 | 10 | 34 | 1,239 |

- `Actions` and `in a finding` are the run's `byPermissionMode`; the kind split counts each violation and over_asked Action by its sample key (every such group lists all of its Actions), and under_asked is the remainder.
- Every Action with a known mode ran in a mode that never asks: 11,526 of 17,460 window Actions (66%) could run without a guard.
  Their 4,244 under_asked Actions are Operations policy A would ask about that the runtime, in that mode, could not have asked about.
- `unknown` is 4,673 Actions whose observations predate mode recording (the first observation carrying a mode is at 2026-09-23T05:58:35Z) and 1,261 Actions with no observation (see "Observation gaps").

#### Violations (18 Actions)

- 11 credential-path reads: key-presence checks and listings of `.env`-like files via grep (3) and ls (3), one gh call, which reads gh's own credential file (1), and 4 inline python3 scripts in one session that wrote classifier fixtures and documents naming credential paths, which the classifier reads as credential reads (`inline_credential`).
- 1 credential-path write and 1 credential-path delete: a set of `.env`-like files holding synthetic values, created and then removed while checking ignore rules.
- 5 shared-remote rewrites via git in 3 sessions, all `--force-with-lease` pushes to the agent's own pull request feature branch: the 3 from the fixed window, which fell in the hook outage, and 2 more on 2026-09-23 with a pinned lease.

#### under_asked (6,003)

| zone | Actions |
| --- | ---: |
| host | 5,305 |
| public_remote | 313 |
| workspace | 132 |
| unknown_remote | 129 |
| protected | 73 |
| agent_config | 51 |

| capability | Actions |
| --- | ---: |
| execute | 2,662 |
| read | 1,819 |
| write | 848 |
| fetch | 486 |
| delete | 142 |
| send | 32 |
| rewrite | 11 |
| push | 3 |

Top five under_asked groups account for 2,318 / 6,003 Actions (39%): `execute · host` via StructuredOutput (725 Actions, 527 sessions), `execute · host` via python3 (476, 87), `execute · host` via `<local-tool-02>` (472, 57), `read · host` via ls (324, 129), `read · host` via cd (321, 73).
The mix is the fixed window's at a larger scale; "Why host under_asked stays at 963" below applies unchanged.

#### over_asked (3 groups, 7 Actions): none is a runtime prompt

All 7 are `read · workspace` Actions in `bypassPermissions` sessions: Read (5), grep (1), and cd (1).
No permission_request was observed for any of them, and each transcript shows a successful tool result.
They count as `prompted` because the transcript parser marks an outcome `rejected_by_human` when the refusal marker appears anywhere in the tool result, and each of these results printed text that contains the marker string: the transcript parser's source, its tests, and the transcript format notes.
The same substring rule also reaches `blocked`: 4 of the 34 `blocked` Actions have a successful, non-error result that contains a block marker string.
No tool result in the window is an error result that starts with the refusal marker, so the window has no human refusal at all.

The over_asked count that reflects runtime behaviour is therefore 0, and this environment cannot show more.
over_asked needs a runtime that asks for an Action policy A allows, and a `bypassPermissions` session never asks for tool permission.
The only prompts the runtime showed were 3 AskUserQuestion dialogs (see the next section), which carry no Operation.
Observing over_asked needs sessions in `default`, `acceptEdits`, or `plan` mode.

#### What "prompted 2" means

Recomputed over the fixed window's time range with these observations, Disposition `prompted` is 2.
Both are AskUserQuestion Actions, on 2026-09-23 at 02:46Z and 04:50Z, whose permission_request paired with its pre_tool_use by Session, tool name, and tool input hash.
AskUserQuestion is the runtime's tool for putting a question to the user, so its permission_request is the question dialog itself, not a guard on a command, file, or remote.
The Action has no Operations, so policy A cannot evaluate it: it is excluded from the transitions and cannot become over_asked or under_asked.
"prompted 2" therefore says the user was asked two questions in that range, not that the runtime asked permission for two Actions.
Over the whole Tuesday-Thursday window `prompted` is 10: the same 2, a third AskUserQuestion at 05:33Z, and the 7 misread tool results above.

The fixed window's Disposition table below lists `prompted` 0 because it was counted from the stored observations, and a stored permission_request never carries an actionKey; pairing happens only inside the run.

#### Observation gaps

1,261 window Actions have no paired observation; 1,239 of them are `executed_prompt_unknown` and 22 are `blocked` from the transcript's block marker.

| gap | Actions | sessions |
| --- | ---: | ---: |
| hook outage, 2026-09-22T22:59Z .. 2026-09-23T01:18Z | 970 | 34 |
| before the first observation, 2026-09-22T12:00Z .. 12:13Z | 194 | 10 |
| sidechain Actions | 69 | 3 |
| Action not observed in an observed session | 28 | 25 |

- Three other quiet periods over an hour (2026-09-22 17:04Z .. 22:58Z, 2026-09-23 20:45Z .. 2026-09-24 00:36Z, 2026-09-24 09:27Z .. 12:14Z) contain no unobserved Action, so they are idle time, not outages.
- Permission mode is recorded from 2026-09-23T05:58:35Z; the 4,673 observed Actions before it count under `unknown`.
- 1,082 pre_tool_use observations in 10 sessions have no transcript in the snapshot; 996 of them come from 7 sessions whose only tool name is `Shell` and whose hook input carries a null permission mode.
  3 more pre_tool_use observations have no matching Action in a session that is in the snapshot, and 1 falls after the cut.
- `runtimeVersion` is null on every observation, as `conformance-limitations.md` records.

### Fixed window

The sections below are the fixed-window run that `pnpm evidence:remeasure` rewrites; the stamp on the first line of this document is its snapshot and resultHash.

#### Method

- Candidate is policy A from the v2 environment profile, adopted as version 1 through the first-policy journey (`docs/evidence/adoption-preview.md`) on a fresh volume.
- Window: 2026-09-22T12:00:00.000Z .. 2026-09-23T05:10:14.000Z, the same as the earlier runs.
- Import: 1,036 sessions, 34,940 Actions accepted, 196 duplicates, 0 failed (the NUL fix is on this build, so the 7 sessions that failed in 0.2.1 imported; their 904 Actions are outside the window).
- Spool: copies of the hook observation files flushed from an isolated scratch home; the live file was cut at the same instant as the first run so the observation set is identical (3,789 lines: pre_tool_use 3,666, session_end 121, permission_request 2). Only the copies were renamed.
- The run was requested through the API; V1 has no screen that starts a conformance run. Completed; classifierVersion 0.2.4; resultHash `269a53d23b5cdea6a95aafbfc0d4b828ea0c21ae5d1ced8afdf85b71f122dd23`.

#### Findings by kind

| kind | groups | Actions |
| --- | ---: | ---: |
| violation | 3 | 6 |
| under_asked | 84 | 1,069 |
| over_asked | 0 | 0 |

Stats: total 4,440 window Actions, evaluated 3,189, excluded 1,251, changed 1,079.
Transitions (observed Disposition Effect → candidate Effect): allow→allow 2,110, allow→ask 1,069, allow→deny 3, deny→ask 7, all others 0.
The violations are the same 6 Actions as in every earlier run; the under_asked volume changed with the classifier (see the change note under "Previous version").

#### Violations (6 Actions)

- 3 credential-path reads via grep (1 Action) and ls (2 Actions).
- 3 shared-remote rewrites via git (3 Actions in 2 sessions), all `--force-with-lease` pushes to the agent's own pull request feature branch.

See `conformance-limitations.md` for the first-run narrative and hook-outage context.

#### under_asked

| zone | Actions |
| --- | ---: |
| host | 963 |
| public_remote | 43 |
| workspace | 20 |
| protected | 19 |
| unknown_remote | 13 |
| agent_config | 11 |

| capability | Actions |
| --- | ---: |
| execute | 413 |
| read | 397 |
| write | 158 |
| fetch | 70 |
| delete | 23 |
| send | 4 |
| rewrite | 3 |
| push | 1 |

Top five under_asked groups account for 422 / 1,069 Actions (39%): `execute · host` via StructuredOutput (111 Actions, 88 sessions), `execute · host` via one local tool (98, 8), `read · host` via cd (93, 14), `read · host` via cat (60, 18), `read · host` via ls (60, 25).

##### Why host under_asked stays at 963

Both the default template and policy A ask on read, write, and execute outside the workspace and on `execute` whose effect could not be determined, and the `workspace` Zone is the Action's workspace root, not the remote lists.
Paths under the Session's own `~` workspace root now count as `workspace`, and a script named by a path inside the workspace is an `execute` that the policy allows, so what stays in `host` is `execute` of local tools and of scripts outside the workspace (413 Actions) and reads, writes, and deletes across sibling worktrees and other directories outside the workspace root (550); `docs/evidence/replay-limitations.md` records the path comparison that keeps those Operations in `host`.
An organization that needs this volume to drop must narrow the runtime or widen the spec; that is an environment-profile or Zone-rule change, not a re-run artifact.

#### over_asked (0)

`over_asked` is 0.
The window's only permission_requests are the 2 AskUserQuestion dialogs; neither is an Action with an Operation for policy A to evaluate, and the second falls after the frozen snapshot's last Action.

#### Disposition (window Actions)

| Disposition | count |
| --- | ---: |
| auto_executed | 3,202 |
| executed_prompt_unknown | 1,231 |
| blocked | 7 |
| prompted | 0 |
| hook_approved | 0 |

Identical to the earlier runs. Sidechain Actions in the window (69) remain executed_prompt_unknown.
`prompted` 0 comes from counting the stored observations, which skips the permission_request pairing; see the section on what "prompted 2" means above.

## Previous version: classifier 0.2.3 (not re-run)

The section below is the conformance run as measured on classifier 0.2.3, policy A, on 2026-09-24 and is kept as the record of that measurement.
Its `resultHash` is not comparable with the 0.2.4 value above.
No repository names, host paths, or raw command text appear below.

### Change from classifier 0.2.3

| measure | 0.2.3 | 0.2.4 |
| --- | ---: | ---: |
| violation groups / Actions | 3 / 6 | 3 / 6 |
| under_asked groups / Actions | 89 / 1,369 | 84 / 1,069 |
| under_asked in `host` | 1,269 | 963 |
| under_asked `execute` | 770 | 413 |
| allow→allow | 1,810 | 2,110 |
| changed Actions | 1,379 | 1,079 |

The window, the observations, and the Dispositions are the same; only the classifier changed.
Classifier 0.2.4 classifies a command named by a path, and a shell given a script file, as `execute` on that file with analyzability `partial`, so `allow_workspace_execute` allows a workspace-internal script without reading it (`docs/evidence/classifier-hardening-4.md`).
under_asked falls by 300 Actions and allow→allow rises by the same 300; 263 of the 289 Actions of the local orchestration script that led the list are among them.
The runtime ran these Actions without a prompt; the Policy now allows them too because the classifier recognizes more commands, not because they were shown to be safe, so this is an auto-allow increase, not a conservative recovery.

### Method

- Candidate is policy A from the v2 environment profile, adopted as version 1 through the first-policy journey (`docs/evidence/adoption-preview.md`) on a fresh volume.
- Window: 2026-09-22T12:00:00.000Z .. 2026-09-23T05:10:14.000Z, the same as the earlier runs.
- Import: 1,036 sessions, 34,940 Actions accepted, 196 duplicates, 0 failed (the NUL fix is on this build, so the 7 sessions that failed in 0.2.1 imported; their 904 Actions are outside the window).
- Spool: copies of the hook observation files flushed from an isolated scratch home; the live file was cut at the same instant as the first run so the observation set is identical (3,789 lines: pre_tool_use 3,666, session_end 121, permission_request 2). Only the copies were renamed.
- The run was requested through the API; V1 has no screen that starts a conformance run. Completed; classifierVersion 0.2.3; resultHash `7710c06cadf9148e3a4a0d261bd42160770311cec7ac3b4afff4a6c83ac28689`.

### Findings by kind

| kind | groups | Actions |
| --- | ---: | ---: |
| violation | 3 | 6 |
| under_asked | 89 | 1,369 |
| over_asked | 0 | 0 |

Stats: total 4,440 window Actions, evaluated 3,189, excluded 1,251, changed 1,379.
Transitions (observed Disposition Effect → candidate Effect): allow→allow 1,810, allow→ask 1,369, allow→deny 3, deny→ask 7, all others 0.
The violations are the same 6 Actions as in every earlier run; the under_asked volume changed with classifier 0.2.3 (see the change note under "Previous version").

### Violations (6 Actions)

- 3 credential-path reads via grep (1 Action) and ls (2 Actions).
- 3 shared-remote rewrites via git (3 Actions in 2 sessions), all `--force-with-lease` pushes to the agent's own pull request feature branch.

See `conformance-limitations.md` for the first-run narrative and hook-outage context.

### under_asked

| zone | Actions |
| --- | ---: |
| host | 1,269 |
| public_remote | 40 |
| workspace | 20 |
| protected | 16 |
| unknown_remote | 13 |
| agent_config | 11 |

| capability | Actions |
| --- | ---: |
| execute | 770 |
| read | 348 |
| write | 156 |
| fetch | 64 |
| delete | 23 |
| send | 4 |
| rewrite | 3 |
| push | 1 |

Top five under_asked groups account for 614 / 1,369 Actions (45%): `execute · host` via one local orchestration script (289 Actions, 3 sessions), `execute · host` via StructuredOutput (111, 88), `execute · host` via a second local tool (98, 8), `read · host` via cat (58, 18), `read · host` via ls (58, 25).

#### Why host under_asked stays at 1,269

Both the default template and policy A ask on read, write, and execute outside the workspace and on `execute` whose effect could not be determined, and the `workspace` Zone is the Action's workspace root, not the remote lists.
Paths under the Session's own `~` workspace root now count as `workspace`, so what stays in `host` is `execute` of local tools and scripts (770 Actions) and reads, writes, and deletes across sibling worktrees and other directories outside the workspace root (499); `docs/evidence/replay-limitations.md` records the path comparison that keeps those Operations in `host`.
An organization that needs this volume to drop must narrow the runtime or widen the spec; that is an environment-profile or Zone-rule change, not a re-run artifact.

### over_asked (0)

`over_asked` remains structurally 0.
The PermissionRequest hook input carries no `toolUseId`, so no `permission_request` observation can pair with an Action (`conformance-limitations.md`, ACR-0007).

### Disposition (window Actions)

| Disposition | count |
| --- | ---: |
| auto_executed | 3,202 |
| executed_prompt_unknown | 1,231 |
| blocked | 7 |
| prompted | 0 |
| hook_approved | 0 |

Identical to the earlier runs. Sidechain Actions in the window (69) remain executed_prompt_unknown.

## Previous version: classifier 0.2.2 (not re-run)

The section below is the conformance run as measured on classifier 0.2.2, policy A, on 2026-09-24 and is kept as the record of that measurement.
Its `resultHash` is not comparable with the 0.2.3 value above.
No repository names, host paths, or raw command text appear below.

### Change from classifier 0.2.2

| measure | 0.2.2 | 0.2.3 |
| --- | ---: | ---: |
| violation groups / Actions | 3 / 6 | 3 / 6 |
| under_asked groups / Actions | 83 / 2,123 | 89 / 1,369 |
| under_asked in `host` | 2,030 | 1,269 |
| allow→allow | 1,056 | 1,810 |
| changed Actions | 2,133 | 1,379 |

The window, the observations, and the Dispositions are the same; only the classifier changed.
Classifier 0.2.3 folds each Session's home directory to `~`, so reads and edits under a `~` workspace root are `workspace` and the policy allows them (`docs/evidence/classifier-hardening-3.md`).
under_asked falls by 754 Actions and allow→allow rises by the same 754.
The other Zones move by a few Actions each: `public_remote` 38 → 40, `unknown_remote` 10 → 13, `protected` 14 → 16.

### Method

- Candidate is policy A from the v2 environment profile, adopted as version 1 through the first-policy journey (`docs/evidence/adoption-preview.md`) on a fresh volume.
- Window: 2026-09-22T12:00:00.000Z .. 2026-09-23T05:10:14.000Z, the same as the earlier runs.
- Import: 1,036 sessions, 34,940 Actions accepted, 196 duplicates, 0 failed (the NUL fix is on this build, so the 7 sessions that failed in 0.2.1 imported; their 904 Actions are outside the window).
- Spool: copies of the hook observation files flushed from an isolated scratch home; the live file was cut at the same instant as the first run so the observation set is identical (3,789 lines: pre_tool_use 3,666, session_end 121, permission_request 2). Only the copies were renamed.
- The run was requested through the API; V1 has no screen that starts a conformance run. Completed; classifierVersion 0.2.2; resultHash `61feaa99f8abd6ff4a2378fed8e1439a77654839ff6d8d394ef568d9ed6241f7`.

### Findings by kind

| kind | groups | Actions |
| --- | ---: | ---: |
| violation | 3 | 6 |
| under_asked | 83 | 2,123 |
| over_asked | 0 | 0 |

Stats: total 4,440 window Actions, evaluated 3,189, excluded 1,251, changed 2,133.
Transitions (observed Disposition Effect → candidate Effect): allow→allow 1,056, allow→ask 2,123, allow→deny 3, deny→ask 7, all others 0.
Every figure in this section equals the 0.2.1 measurement: the two classifier changes (local-path fetch operands, home-directory remote resolution) touch no Action inside this window's findings.

### Violations (6 Actions)

- 3 credential-path reads via grep (1 Action) and ls (2 Actions).
- 3 shared-remote rewrites via git (3 Actions in 2 sessions), all `--force-with-lease` pushes to the agent's own pull request feature branch.

See `conformance-limitations.md` for the first-run narrative and hook-outage context.

### under_asked

| zone | Actions |
| --- | ---: |
| host | 2,030 |
| public_remote | 38 |
| workspace | 20 |
| protected | 14 |
| agent_config | 11 |
| unknown_remote | 10 |

| capability | Actions |
| --- | ---: |
| read | 950 |
| execute | 758 |
| write | 330 |
| fetch | 60 |
| delete | 20 |
| rewrite | 3 |
| send | 1 |
| push | 1 |

Top five under_asked groups account for 1,235 / 2,123 Actions (58%): `read · host` via the Read tool (599 Actions, 75 sessions), `execute · host` via one local orchestration script (289, 3), `read · host` via cd (127, 21), `execute · host` via StructuredOutput (111, 88), `write · host` via Edit (109, 23).

#### Why host under_asked stays at 2,030

Both the default template and policy A ask on read, write, and execute outside the workspace, and the `workspace` Zone is the Action's workspace root, not the remote lists.
Sessions that read and edit across sibling worktrees and the supervisor's home therefore produce most of the under_asked volume; `docs/evidence/replay-limitations.md` records the path comparison that keeps those Operations in `host`.
An organization that needs this volume to drop must narrow the runtime or widen the spec; that is an environment-profile or Zone-rule change, not a re-run artifact.

### over_asked (0)

`over_asked` remains structurally 0.
The PermissionRequest hook input carries no `toolUseId`, so no `permission_request` observation can pair with an Action (`conformance-limitations.md`, ACR-0007).

### Disposition (window Actions)

| Disposition | count |
| --- | ---: |
| auto_executed | 3,202 |
| executed_prompt_unknown | 1,231 |
| blocked | 7 |
| prompted | 0 |
| hook_approved | 0 |

Identical to the earlier runs. Sidechain Actions in the window (69) remain executed_prompt_unknown.

## Previous version: classifier 0.2.1 (not re-run)

The section below is the measurement on classifier 0.2.1 and is kept as the record of that run.

Conformance replay compares candidate policy A against observed runtime Disposition over a fixed window.
Every number below is labelled **classifier 0.2.1, policy A**.
No repository names, host paths, or raw command text appear below.

### Method

- Candidate is policy A from the v2 environment profile, not the default template.
- Window: 2026-09-22T12:00:00.000Z .. 2026-09-23T05:10:14.000Z.
- Import: 1,036 sessions, 34,036 agent_actions accepted, 196 duplicates, 7 sessions failed import (NUL in jsonb; out of window).
- Re-import after the NUL fix (2026-09-24, fresh stack): the 7 failed sessions imported with 904 Actions accepted, 0 duplicates, 0 failures; all 904 fall outside the window.
- Spool: copies of hook observations flushed into an isolated scratch home; only copies were renamed.
- Run completed in 69 ms; classifierVersion 0.2.1.

### Findings by kind

| kind | groups | Actions |
| --- | ---: | ---: |
| violation | 3 | 6 |
| under_asked | 83 | 2,123 |
| over_asked | 0 | 0 |

Stats: total 4,440 window Actions, evaluated 3,189, excluded 1,251, changed 2,133.
Transitions (observed Disposition Effect → candidate Effect): allow→allow 1,056, allow→ask 2,123, allow→deny 3, deny→ask 7, all others 0.

### Violations (6 Actions)

Same six Actions as the first default-template conformance run:

- 3 credential-path reads via grep (1 Action) and ls (2 Actions).
- 3 shared-remote rewrites via git (3 Actions in 2 sessions), all `--force-with-lease` pushes to the agent's own pull request feature branch.

See `conformance-limitations.md` for the first-run narrative and hook-outage context.

### under_asked

| zone | Actions |
| --- | ---: |
| host | 2,030 |
| public_remote | 38 |
| workspace | 20 |
| protected | 14 |
| agent_config | 11 |
| unknown_remote | 10 |

| capability | Actions |
| --- | ---: |
| read | 950 |
| execute | 758 |
| write | 330 |
| fetch | 60 |
| delete | 20 |
| rewrite | 3 |
| send | 1 |
| push | 1 |

Top five under_asked groups account for 1,235 / 2,123 Actions (58%), unchanged from the default-template first run.

#### Why host under_asked stays at 2,030

This harness has the agent routinely visiting sibling worktrees and the supervisor home.
Both the default template and policy A ask on read, write, and execute outside the workspace.
The `workspace` Zone is the Action's workspace root, not the remote lists; policy A does not move sibling-worktree paths into `workspace`.
Host under_asked therefore does not fall under policy A.
An organization that needs this volume to drop must narrow the runtime or widen the spec; that is an environment-profile or Zone-rule change, not a re-run artifact.

Policy A lists 40 public remotes instead of the template's `github.com/**`, so public_remote under_asked drops from 40 to 38 and unknown_remote rises from 8 to 10.

### over_asked (0)

`over_asked` remains structurally 0.
The PermissionRequest hook input carries no `toolUseId`, so no `permission_request` observation can pair with an Action.
The runtime having asked is not recorded for pairing purposes; see `conformance-limitations.md` and ACR-0007.
This is a V1 limitation of the hook input, not a pairing defect on this run.

### Disposition (window Actions)

| Disposition | count |
| --- | ---: |
| auto_executed | 3,202 |
| executed_prompt_unknown | 1,231 |
| blocked | 7 |
| prompted | 0 |
| hook_approved | 0 |

Identical to the default-template first run.
Joined pre_tool_use observations: 3,205 joined, 2,117 not joined (mostly after snapshot cutoff or sessions not in snapshot).
