corpus snapshot: transcripts-2026-09-23-1036 (2026-09-23, 1,036 files, 34,940 Actions); classifier 0.2.2; measured 2026-09-24; conformance resultHash `61feaa99…41f7`

# Conformance (policy A)

Conformance replay compares the accepted policy A against observed runtime Disposition over a fixed window.
<!-- remeasure:conformance-intro -->
Every number in the main sections is labelled **classifier 0.2.2, policy A** (measured 2026-09-24); the earlier 0.2.1 measurement is kept unchanged under "Previous version" at the end.
<!-- /remeasure:conformance-intro -->
No repository names, host paths, or raw command text appear below.

## Method

<!-- remeasure:conformance-method -->
- Candidate is policy A from the v2 environment profile, adopted as version 1 through the first-policy journey (`docs/evidence/adoption-preview.md`) on a fresh volume.
- Window: 2026-09-22T12:00:00.000Z .. 2026-09-23T05:10:14.000Z, the same as the earlier runs.
- Import: 1,036 sessions, 34,940 Actions accepted, 196 duplicates, 0 failed (the NUL fix is on this build, so the 7 sessions that failed in 0.2.1 imported; their 904 Actions are outside the window).
- Spool: copies of the hook observation files flushed from an isolated scratch home; the live file was cut at the same instant as the first run so the observation set is identical (3,789 lines: pre_tool_use 3,666, session_end 121, permission_request 2). Only the copies were renamed.
- The run was requested through the API; V1 has no screen that starts a conformance run. Completed; classifierVersion 0.2.2; resultHash `61feaa99f8abd6ff4a2378fed8e1439a77654839ff6d8d394ef568d9ed6241f7`.
<!-- /remeasure:conformance-method -->

## Findings by kind

<!-- remeasure:conformance-findings -->
| kind | groups | Actions |
| --- | ---: | ---: |
| violation | 3 | 6 |
| under_asked | 83 | 2,123 |
| over_asked | 0 | 0 |

Stats: total 4,440 window Actions, evaluated 3,189, excluded 1,251, changed 2,133.
Transitions (observed Disposition Effect → candidate Effect): allow→allow 1,056, allow→ask 2,123, allow→deny 3, deny→ask 7, all others 0.
<!-- /remeasure:conformance-findings -->
Every figure in this section equals the 0.2.1 measurement: the two classifier changes (local-path fetch operands, home-directory remote resolution) touch no Action inside this window's findings.

## Violations (6 Actions)

- 3 credential-path reads via grep (1 Action) and ls (2 Actions).
- 3 shared-remote rewrites via git (3 Actions in 2 sessions), all `--force-with-lease` pushes to the agent's own pull request feature branch.

See `conformance-limitations.md` for the first-run narrative and hook-outage context.

## under_asked

<!-- remeasure:conformance-under-asked -->
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
<!-- /remeasure:conformance-under-asked -->

Top five under_asked groups account for 1,235 / 2,123 Actions (58%): `read · host` via the Read tool (599 Actions, 75 sessions), `execute · host` via one local orchestration script (289, 3), `read · host` via cd (127, 21), `execute · host` via StructuredOutput (111, 88), `write · host` via Edit (109, 23).

### Why host under_asked stays at 2,030

Both the default template and policy A ask on read, write, and execute outside the workspace, and the `workspace` Zone is the Action's workspace root, not the remote lists.
Sessions that read and edit across sibling worktrees and the supervisor's home therefore produce most of the under_asked volume; `docs/evidence/replay-limitations.md` records the path comparison that keeps those Operations in `host`.
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
