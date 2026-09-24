corpus snapshot: transcripts-2026-09-23-1036 (2026-09-23, 1,036 files, 34,940 Actions); classifier 0.2.3; measured 2026-09-24

# Classifier known limitations

## A git refspec operand is read as a remote URL

Closed in classifier 0.2.3: only the repository operand is tested as a URL, and refspecs are judged as operands (`docs/evidence/classifier-hardening-3.md`).
The two adversarial corpus cases that recorded this miss (`ls-remote-refspec-is-not-a-remote`, `push-refspec-is-not-a-remote`) run as expected results.

## Stored Target keys can hold an operating-system user name

Closed for the Session's own home in classifier 0.2.3: the trace parser folds the home directory derived from the transcript `cwd` to `~` before classification, so stored Target keys and tool input carry `~` instead (`docs/evidence/classifier-hardening-3.md`).
A path under another user's home stays absolute and keeps that user's name.
Actions imported before this change keep their stored keys until they are imported again.
