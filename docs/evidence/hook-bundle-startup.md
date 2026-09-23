# Hook CLI bundle startup (H03)

`pnpm build:cli` produces `apps/cli/dist/authority.mjs`, a single-file bundle with no workspace link or tsx dependency.
`authority install-hooks` prefers this bundle when present and registers a shell-wrapped fail-open command:

`sh -c 'mkdir -p $HOME/.authority 2>/dev/null; <node> <entry> hook <event> 2>>$HOME/.authority/hook-errors.log || exit 0'`

## Measurement

Method: 50 cold-ish runs per path on Node 22, `hook pre-tool-use`, empty stdin, `performance.now()` wall time including process spawn (median and p95).

| Entry | p50 (ms) | p95 (ms) |
| --- | ---: | ---: |
| tsx (`node …/tsx/dist/cli.mjs …/apps/cli/src/main.ts`) | 158.7 | 169.6 |
| bundle (`node …/apps/cli/dist/authority.mjs`) | 31.6 | 33.4 |

The bundle path is within the 60 ms hook startup target in `docs/design.md` §18.2.
The `mkdir -p` runs before the shell opens the redirect, so on a fresh machine the log directory exists and stderr goes only to `~/.authority/hook-errors.log`, never to the caller's screen.
The shell wrapper ensures module-load failures also exit 0.

After deploy, re-run `authority install-hooks` so `~/.claude/settings.json` picks up the new command shape.
