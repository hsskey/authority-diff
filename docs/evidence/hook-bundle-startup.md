# Hook CLI bundle startup (H03)

`pnpm build:cli` produces `apps/cli/dist/authority.mjs`, a single-file bundle with no workspace link or tsx dependency.
`authority install-hooks` prefers this bundle when present and registers a shell-wrapped fail-open command:

`sh -c 'mkdir -p $HOME/.authority 2>/dev/null; <node> <entry> hook <event> 2>>$HOME/.authority/hook-errors.log || exit 0'`

`<node>` is the interpreter path `install-hooks` resolves at registration time.
When the running node lives in a versioned Homebrew Cellar directory, `install-hooks` pins `<node>` to a stable symlink (`<prefix>/bin/node`, the formula's `opt/<formula>/bin/node`, or `/usr/local/bin/node`) that resolves to the same binary, so `brew upgrade` cannot delete the path out from under every installed hook; otherwise it keeps the running interpreter.
`authority install-hooks --print` reports the chosen path and the reason on a `node` line.

A vite-plus managed node, `~/.vite-plus/js_runtime/node/<version>/bin/node`, is not a Homebrew Cellar path, so the stable-symlink rule does not apply and `install-hooks` pins that versioned path as-is.
Known limitation: after that node version is upgraded, the hook silently stops working until `install-hooks` is re-run.

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
