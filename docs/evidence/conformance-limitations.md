# Conformance known limitations

In V1, execution after a permission_request cannot be distinguished between human approval and plugin approval.
`hook_approved` is recorded only when the hook input carries a decision, and it is not observed in the current Claude Code environment.
PermissionRequest hooks run in parallel, and this hook's stdin carries only tool information, not other plugins' decisions, so `hook_approved` effectively never fires.
An execution auto-approved by another plugin is therefore recorded as a `permission_request` plus an executed outcome, that is `prompted`.
This is a V1 limitation, not a defect.
`over_asked` still holds, because it depends only on the runtime having asked, not on who answered.
See ACR-0007 for the Disposition derivation.

## Permission request pairing

The PermissionRequest hook input carries no `tool_use_id`, although the `/hooks` help screen mentions it for this event.
A `permission_request` reaches its Action only by pairing with the closest earlier unpaired `pre_tool_use` of the same Session, tool name, and tool input hash, as ACR-0007 records.
A `permission_request` whose `pre_tool_use` was not observed stays unpaired and is reported as `unpairedPermissionRequests` of the conformance run.
This environment recorded only 2 `permission_request` observations, so `over_asked` stays near 0.
That is the result, not a pairing defect.

## Observation gap: hook outage

The spool has no observations from 2026-09-22T22:59Z to 2026-09-23T01:18Z.
The hook crashed because a workspace link it resolves was missing, so nothing was recorded.
The spool was not overwritten.
Actions in this window have no hook coverage, and their Disposition is `executed_prompt_unknown`.

## runtimeVersion

`runtimeVersion` is null on every observation because the hook input carries no runtime version.
This is a limitation of the hook input, and runtime version grouping is not possible from these observations.

## StructuredOutput

`StructuredOutput` is classified as `execute` on the `host` zone and is left as is.
It is a harness-only tool specific to this environment, not a tool a coding session calls on its own.

## First conformance run violations

The first conformance run under the default template reported 6 violations.

- 3 credential-path reads, all of `.env`-like files.
  They were a key-presence check with `grep` and a file listing with `ls`, run by agents while checking a provider key and preparing a validation run.
  No value was printed, but the spec denies access to the path itself.
- 3 shared-remote rewrites in 2 Sessions.
  All were `--force-with-lease` pushes to the agent's own pull request feature branch after a rebase, and none targeted the default branch.
  Whether the runtime prompted is unobserved, because they fell in the hook outage gap above.

The runtime did not stop either kind, and the agent executed them.
The hook only observes, so this records what the runtime allowed.
The shared-remote rewrites show a gap in the policy wording.
The default template's `deny_shared_history_rewrite` does not distinguish a lease push to one's own pull request branch from a force push to the default branch.
A policy change that adds an `ask` rule for rewrites of one's own branch is a candidate.
