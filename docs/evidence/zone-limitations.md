# Zone known limitations

## Zone does not distinguish publish from fetch

Zone looks only at whether a target is trusted, not at the direction of the Operation (fetch or publish).
The classifier records a package publish (`npm publish`, `pnpm publish`, `yarn publish`, `bun publish`) as capability `push` with a `package` target whose value is the registry host, and `docker push` as capability `push` with a `host` target whose value is the image registry host.
Zone resolution compares that value against `trustedRemotes` in the same way it compares a VCS Remote Key.
If a registry is listed in `trustedRemotes`, for example so that installs from it resolve to `trusted_remote`, then a Rule that allows `push` on `trusted_remote` also allows publishing to that registry.
In V1 the behavior is kept, and the reviewer stops such a change by giving the Widening group an `unexpected` Verdict.
A later change resolves it either with a separate publish Capability or by adding the Capability direction to Zone calculation (`docs/cutline.md` chapter 17, Tier 3).

## Publish counts in the corpus

Counted on snapshot `transcripts-2026-09-23-1036` (2026-09-23, 1036 transcript files, 34940 Actions) with classifier version `0.2.0` at commit `8fb8ca3`.
An Action counts when at least one of its Operations is a `push` on a `package` target, or a `push` by `docker` or `podman`.

| program | registry | Actions | of which `--dry-run` |
| --- | --- | --- | --- |
| `npm publish` | `registry.npmjs.org` | 10 | 8 |
| `npm publish` | other (masked) | 2 | 2 |
| `pnpm publish` | - | 0 | 0 |
| `yarn publish` | - | 0 | 0 |
| `bun publish` | - | 0 | 0 |
| `docker push` | - | 0 | 0 |

Two Actions ran `npm publish` against `registry.npmjs.org` without `--dry-run`; the other ten were dry runs.
Mentions of these commands inside file writes or searches are not publishes and are not counted.
