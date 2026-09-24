# Secret scan

Scanned 2026-09-25 with gitleaks 8.30.1 in git mode over the full history of the public repository at `e7428bb` (402 commits).

Result: 22 findings, 0 real secrets.

| rule | findings | source |
| --- | ---: | --- |
| `gitlab-pat`, `generic-api-key`, `curl-auth-header` | 20 | synthetic canary values in `packages/trace/tests` that the redaction tests feed in |
| `curl-auth-header` | 2 | `local-dev-token`, the compose development token, in the `docs/demo.md` curl example |
