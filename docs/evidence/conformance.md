corpus snapshot: transcripts-2026-09-23-1036 (2026-09-23, 1,036 files, 34,940 Actions); classifier 0.2.3; measured 2026-09-24; conformance resultHash `7710c06c…8689`
<!-- evidence-numbers
snapshot.sessions: 1,036
snapshot.actions: 34,940
snapshot.duplicates: 196
conformance.resultHash: 7710c06c…8689
-->

# Conformance (policy A)

Conformance replay compares the accepted policy A against observed runtime Disposition over a fixed window.
<!-- remeasure:conformance-intro -->
Every number in the main sections is labelled **classifier 0.2.3, policy A** (measured 2026-09-24); the earlier 0.2.2, 0.2.1 measurements are kept unchanged under "Previous version" at the end.
<!-- /remeasure:conformance-intro -->
No repository names, host paths, or raw command text appear below.

## Method

<!-- remeasure:conformance-method -->
- Candidate is policy A from the v2 environment profile, adopted as version 1 through the first-policy journey (`docs/evidence/adoption-preview.md`) on a fresh volume.
- Window: 2026-09-22T12:00:00.000Z .. 2026-09-23T05:10:14.000Z, the same as the earlier runs.
- Import: 1,036 sessions, 34,940 Actions accepted, 196 duplicates, 0 failed (the NUL fix is on this build, so the 7 sessions that failed in 0.2.1 imported; their 904 Actions are outside the window).
- Spool: copies of the hook observation files flushed from an isolated scratch home; the live file was cut at the same instant as the first run so the observation set is identical (3,789 lines: pre_tool_use 3,666, session_end 121, permission_request 2). Only the copies were renamed.
- The run was requested through the API; V1 has no screen that starts a conformance run. Completed; classifierVersion 0.2.3; resultHash `7710c06cadf9148e3a4a0d261bd42160770311cec7ac3b4afff4a6c83ac28689`.
<!-- /remeasure:conformance-method -->

## Findings by kind

<!-- remeasure:conformance-findings -->
| kind | groups | Actions |
| --- | ---: | ---: |
| violation | 3 | 6 |
| under_asked | 89 | 1,369 |
| over_asked | 0 | 0 |

Stats: total 4,440 window Actions, evaluated 3,189, excluded 1,251, changed 1,379.
Transitions (observed Disposition Effect → candidate Effect): allow→allow 1,810, allow→ask 1,369, allow→deny 3, deny→ask 7, all others 0.
<!-- /remeasure:conformance-findings -->
The violations are the same 6 Actions as in every earlier run; the under_asked volume changed with classifier 0.2.3 (see the change note under "Previous version").

## Violations (6 Actions)

- 3 credential-path reads via grep (1 Action) and ls (2 Actions).
- 3 shared-remote rewrites via git (3 Actions in 2 sessions), all `--force-with-lease` pushes to the agent's own pull request feature branch.

See `conformance-limitations.md` for the first-run narrative and hook-outage context.

## under_asked

<!-- remeasure:conformance-under-asked -->
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
<!-- /remeasure:conformance-under-asked -->

Top five under_asked groups account for 614 / 1,369 Actions (45%): `execute · host` via one local orchestration script (289 Actions, 3 sessions), `execute · host` via StructuredOutput (111, 88), `execute · host` via a second local tool (98, 8), `read · host` via cat (58, 18), `read · host` via ls (58, 25).

### Why host under_asked stays at 1,269

Both the default template and policy A ask on read, write, and execute outside the workspace and on `execute` whose effect could not be determined, and the `workspace` Zone is the Action's workspace root, not the remote lists.
Paths under the Session's own `~` workspace root now count as `workspace`, so what stays in `host` is `execute` of local tools and scripts (770 Actions) and reads, writes, and deletes across sibling worktrees and other directories outside the workspace root (499); `docs/evidence/replay-limitations.md` records the path comparison that keeps those Operations in `host`.
An organization that needs this volume to drop must narrow the runtime or widen the spec; that is an environment-profile or Zone-rule change, not a re-run artifact.

## over_asked (0)

`over_asked` remains structurally 0.
The PermissionRequest hook input carries no `toolUseId`, so no `permission_request` observation can pair with an Action (`conformance-limitations.md`, ACR-0007).

## Disposition (window Actions)

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
