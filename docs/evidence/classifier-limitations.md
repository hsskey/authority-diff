corpus snapshot: transcripts-2026-09-23-1036 (2026-09-23, 1,036 files, 34,940 Actions); classifier 0.2.2; measured 2026-09-24

# Classifier known limitations

## A git refspec operand is read as a remote URL

`git ls-remote <remote> <refspec>` and `git push <remote> <refspec>` with a full refspec such as `refs/heads/main` produce a `vcs_remote` Target whose Remote Key is the refspec and whose remote name is null.
The classifier looks for a remote URL in every positional argument, not only in the repository operand, and the short `host/owner/repo` form in `looksLikeRemoteUrl` (`packages/action/lib/domain/git.ts`) also matches `refs/heads/main`.
The named remote in front of it is then not resolved, so the real Remote Key is lost.

On the frozen corpus 5 fetch Operations from `ls-remote` carry this key, and one `push` command has the same shape.
The Activity Overview remote host table shows the fetches under a host `refs`.

The miss is conservative.
The refspec key matches no `trustedRemotes` pattern, so the Target falls to `unknown_remote`, and a Rule that allows fetch or push on `trusted_remote` does not allow these Actions.
No Effect moves toward allow; the Target summary and the overview host table are wrong for these rows.

The classifier stays on 0.2.2.
Changing the operand rule changes Remote Keys and therefore `resultHash` values, so a fix goes with a classifier version bump and a re-measurement of the published figures.
`tests/corpus/adversarial.json` records both shapes with the intended Remote Key (`ls-remote-refspec-is-not-a-remote`, `push-refspec-is-not-a-remote`).
Each entry carries `skip`, so the corpus test lists it as skipped rather than pinning the current output, and the laundering test leaves it out.

## Stored Target keys can hold an operating-system user name

A local-path Target key keeps its leading path segments, and for a path under a home directory one of them is the operating-system user name.
Those keys stay as stored in the local database.
Public documents, screenshots, and screens must not show them; evidence documents mask paths (`local-path-NN`), and the review screens keep paths inside the sample panel.
The Evidence Reports still list local-path Target keys; the masking decision for them is open (`docs/evidence/adoption-preview.md`, findings).
