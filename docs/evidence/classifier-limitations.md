corpus snapshot: transcripts-2026-09-23-1036 (2026-09-23, 1,036 files, 34,940 Actions); classifier 0.2.3; measured 2026-09-24

# Classifier known limitations

## A git refspec operand is read as a remote URL

Closed in classifier 0.2.3: only the repository operand is tested as a URL, and refspecs are judged as operands (`docs/evidence/classifier-hardening-3.md`).
The two adversarial corpus cases that recorded this miss (`ls-remote-refspec-is-not-a-remote`, `push-refspec-is-not-a-remote`) run as expected results.

## Stored Target keys can hold an operating-system user name

Closed for the Session's own home in classifier 0.2.3: the trace parser folds the home directory derived from the transcript `cwd` to `~` before classification, so stored Target keys and tool input carry `~` instead (`docs/evidence/classifier-hardening-3.md`).
A path under another user's home stays absolute and keeps that user's name.
Actions imported before this change keep their stored keys until they are imported again.

## A remote-to-local `scp` is classified as a send

`scp user@host:/path .` copies from the remote host to the local directory but is classified as a `send` to that `host`; under the default template a `fetch` and a `send` of `unknown_remote` both resolve to `ask`, so the result is the same but the direction is wrong.
This is resolved in the 0.2.6 classifier code, where a `host:path` source operand of `scp`, `rsync`, or `sftp` is a `fetch` and only a `host:path` destination is a `send`; the measured values in this document predate that remeasure.

## The operator's local tools are left out of the program table

The program table recognizes only the public tool list; the operator's local tools in the measured corpus are intentionally left out of it, so their Operations stay `none` with `program_unrecognized`.
`pnpm dev:backlog` on this snapshot with the 0.2.6 classifier (resultHash `daf23b2d…24f4`) counts 34,033 evaluated Actions and 6,009 `none` Actions (17.7%).
The only unrecognized programs whose Actions leaving `none` reach 200 are three local tools, `<local-tool-02>`, `<local-tool-08>`, and `<local-tool-04>` in the evidence legend, at 885, 363, and 320; their sole-cause Actions are disjoint, so the excluded local tools hold 1,568 of the 6,009 `none` Actions.
A table entry for them would mean nothing in another environment and would put names from one operator's environment into the repository.
A possible direction, not planned work: an Environment Profile mechanism where an organization registers its own table of local program names, each aliased to a Capability and a Target.
