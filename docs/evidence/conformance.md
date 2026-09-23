corpus snapshot: transcripts-2026-09-23-1036 (2026-09-23, 1,036 files, 34,940 Actions); classifier 0.2.1

# Conformance (policy A)

Conformance replay compares candidate policy A against observed runtime Disposition over a fixed window.
Every number below is labelled **classifier 0.2.1, policy A**.
No repository names, host paths, or raw command text appear below.

## Method

- Candidate is policy A from the v2 environment profile, not the default template.
- Window: 2026-09-22T12:00:00.000Z .. 2026-09-23T05:10:14.000Z.
- Import: 1,036 sessions, 34,036 agent_actions accepted, 196 duplicates, 7 sessions failed import (NUL in jsonb; out of window).
- Spool: copies of hook observations flushed into an isolated scratch home; only copies were renamed.
- Run completed in 69 ms; classifierVersion 0.2.1.

## Findings by kind

| kind | groups | Actions |
| --- | ---: | ---: |
| violation | 3 | 6 |
| under_asked | 83 | 2,123 |
| over_asked | 0 | 0 |

Stats: total 4,440 window Actions, evaluated 3,189, excluded 1,251, changed 2,133.
Transitions (observed Disposition Effect → candidate Effect): allow→allow 1,056, allow→ask 2,123, allow→deny 3, deny→ask 7, all others 0.

## Violations (6 Actions)

Same six Actions as the first default-template conformance run:

- 3 credential-path reads via grep (1 Action) and ls (2 Actions).
- 3 shared-remote rewrites via git (3 Actions in 2 sessions), all `--force-with-lease` pushes to the agent's own pull request feature branch.

See `conformance-limitations.md` for the first-run narrative and hook-outage context.

## under_asked

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

### Why host under_asked stays at 2,030

This harness has the agent routinely visiting sibling worktrees and the supervisor home.
Both the default template and policy A ask on read, write, and execute outside the workspace.
The `workspace` Zone is the Action's workspace root, not the remote lists; policy A does not move sibling-worktree paths into `workspace`.
Host under_asked therefore does not fall under policy A.
An organization that needs this volume to drop must narrow the runtime or widen the spec; that is an environment-profile or Zone-rule change, not a re-run artifact.

Policy A lists 40 public remotes instead of the template's `github.com/**`, so public_remote under_asked drops from 40 to 38 and unknown_remote rises from 8 to 10.

## over_asked (0)

`over_asked` remains structurally 0.
The PermissionRequest hook input carries no `toolUseId`, so no `permission_request` observation can pair with an Action.
The runtime having asked is not recorded for pairing purposes; see `conformance-limitations.md` and ACR-0007.
This is a V1 limitation of the hook input, not a pairing defect on this run.

## Disposition (window Actions)

| Disposition | count |
| --- | ---: |
| auto_executed | 3,202 |
| executed_prompt_unknown | 1,231 |
| blocked | 7 |
| prompted | 0 |
| hook_approved | 0 |

Identical to the default-template first run.
Joined pre_tool_use observations: 3,205 joined, 2,117 not joined (mostly after snapshot cutoff or sessions not in snapshot).
