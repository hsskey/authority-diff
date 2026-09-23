# Conformance known limitations

In V1, execution after a permission_request cannot be distinguished between human approval and plugin approval.
`hook_approved` is recorded only when the hook input carries a decision, and it is not observed in the current Claude Code environment.
PermissionRequest hooks run in parallel, and this hook's stdin carries only tool information, not other plugins' decisions, so `hook_approved` effectively never fires.
An execution auto-approved by another plugin is therefore recorded as a `permission_request` plus an executed outcome, that is `prompted`.
This is a V1 limitation, not a defect.
`over_asked` still holds, because it depends only on the runtime having asked, not on who answered.
See ACR-0007 for the Disposition derivation.
