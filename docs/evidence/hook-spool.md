# Hook spool known limitations (V3 observation)

This document records known limits of `authority hook` and `authority install-hooks` in the pre-bundle behavior.
Judgement is out of scope; observation data is sent to the server with `authority spool-flush`.

## tsx startup (superseded by bundle)

When `pnpm build:cli` produces `apps/cli/dist/authority.mjs`, install-hooks uses the bundle path.
Measurements are in `docs/evidence/hook-bundle-startup.md`.
The tsx fallback remains only when there is no bundle.

## Workspace link (superseded by bundle)

The bundle includes workspace packages in a single file.
If there is no bundle and no workspace link, the tsx fallback can fail before module resolution.
`authority install-hooks --print` prints a warning when there is no link.

## Shell fail-open

The command install-hooks registers is of the form `sh -c '… 2>>$HOME/.authority/hook-errors.log || exit 0'`.
A module-load failure is also stopped by the shell at exit 0, and stderr does not appear on the caller screen.
The 400ms fail-open guard inside the hook process applies only after main has started.

## PermissionRequest observation

Two kinds of evidence are separated.
"direct hook-command verification" below was reproduced in this environment.
"live end-to-end firing" can be confirmed only in an authenticated Session, so it is deferred.

### direct hook-command verification (reproduced in this environment)

The exact hook command that `authority install-hooks` registers in `~/.claude/settings.json`
was run directly with a realistic PermissionRequest payload.
Results:

- The hook command finished with exit status 0 and empty stdout. It does not print a Decision.
- A `permission_request` line was appended to the spool.
- Fields the hook reads are `session_id`, `cwd`, `tool_name`, `tool_input`, `tool_use_id`, `permission_mode`.
  That matches the shape of a Claude Code PermissionRequest payload.
  `permission_mode` is recorded as-is on the spool's `permissionMode`, or `null` if absent (basis ACR-0008).
- When the payload has `tool_use_id` it is recorded as-is on the spool's `toolUseId`;
  otherwise `toolUseId` is `null`. The `toolUseId` field is nullable.
- Raw commands and arguments were not left in the spool or in this document. `tool_input` remains as a hash only.

### live end-to-end firing (deferred)

The end-to-end flow in which a real `claude` child Session attempts a write outside the workspace and the hook actually fires
could not be reproduced in this environment.
A new `claude` child process in this environment fails authentication.
That check is deferred until an authenticated Session is available.
This document does not claim that live Session was reproduced.

## PreToolUse observation hook

A plugin's PermissionRequest Decision can skip later hooks, so
a PreToolUse observation hook was added so no tool-call attempt is missed.
This hook records one line on the spool with `tool_use_id` for every tool-call attempt.
It does not print a Decision, exits 0 on every path, and finishes inside the existing 400ms handler budget.
`install-hooks` manages the PreToolUse `*` matcher entry together with PermissionRequest and SessionEnd.
This hook's spool line was also verified by running the hook command directly.

in this environment the plugin hook auto-approves Bash

The plugin automatically `allow`s only Bash Actions it classifies as safe.
This auto-approve is a real V3 observation case in a user environment, and this document does not change omc plugin config.

## Node path pinning

install-hooks pins the hook command's node path at registration time.
If the running node is a versioned path inside a `.vite-plus`, `.volta`, or `.nvm` version-manager folder, it pins that manager's shim.
Shims are `~/.vite-plus/bin/node`, `~/.volta/bin/node`, and nvm's `~/.nvm/current/bin/node` (exists only when `NVM_SYMLINK_CURRENT` is on).
A shim picks a node version from cwd and manager settings at hook run time, so the hook can run a different version than at registration.
If there is no shim it uses the versioned path as-is, and if that version is deleted the hook stops quietly via shell fail-open.
The `node` line of `authority install-hooks --print` shows the chosen path and the reason.
Homebrew Cellar rules are in `docs/evidence/hook-bundle-startup.md`.

## Spool from another machine

`authority spool-flush --from <dir>` sends a spool directory copied from another machine instead of the local spool.
Sent files are renamed to `.sent` inside that directory; the local spool is not touched.
If `<dir>` cannot be read, it ends with exit 1.
`docs/evidence/spool-ingestion.md` records a `--from` load of one device's spool copy and the conformance run over it; spools from more than one device have not been loaded together yet.
