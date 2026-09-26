# ACR-0019 Governed document wording

Status: accepted (2026-09-26).
Procedure: docs/design.md 33.3.
Scope: CONTEXT.md, Verdict; docs/design.md 16.3.

Two sentences in change-controlled documents no longer match the shipped product.
docs/design.md 33.3 puts every change to `CONTEXT.md` under an ACR, so both edits are recorded here.
A person approved the exact wording of both edits before they were made.

## Context

- CONTEXT.md, Verdict, says "The Korean screen strings live in the web app (`apps/web`), not in this file."
  The web app now renders every screen string from both an English and a Korean catalog (ADR-0012), so the sentence names only one of them.
- docs/design.md 16.3 says "Authority Diff does not store whether it was applied."
  ACR-0014 added the Policy Activation declaration, which stores an operator's statement that they applied a Policy Version, so the sentence is no longer true.

## Decision

- In CONTEXT.md, Verdict, the sentence becomes "The screen strings live in the web app (`apps/web`), not in this file."
- In docs/design.md 16.3, "Authority Diff does not store whether it was applied." becomes "Authority Diff stores only the record of an operator declaring that they applied a Policy Version; it does not verify or store whether the policy was actually applied."
- Nothing else changes in either file.

## Alternatives

- Leave both sentences as they are: the glossary and the Target Architecture would contradict the shipped catalogs and ACR-0014.
- Also change the similar sentence in docs/cutline.md 5: the approved scope is these two edits only.
  A later follow-up extended the same wording to docs/cutline.md 5 and added a dated amendment note to ADR-0010.

## Consequences

- No code, schema, contract, table, or test changes.
- No term is added to or removed from `CONTEXT.md`.
