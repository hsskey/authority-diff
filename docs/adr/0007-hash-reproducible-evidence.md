# ADR-0007 Approval evidence must be reproducible from hashes

Status: accepted (Target + V1). Source: docs/design.md chapter 34.

- Context: An approval record is meaningful only if what was seen at approval time can be proved later.
- Decision: A Policy Version has `contentHash`, a Replay Run has `inputsHash` and `resultHash`, and the approval audit event carries these values. Replay must produce the same result for the same input.
- Alternatives: Store a screen snapshot from approval time. Store a full copy of the result.
- Consequences: Replay cannot include non-deterministic elements (clock, random, model calls). This constraint meshes with ADR-0005.
- Reversal trigger: None. Dropping this decision means the product's approval records are not evidence.
- V1 note: kernel `lib/domain` and `lib/app` forbid `new Date()`, `Date.now()`, and `Math.random()` by lint and obtain time only through a Clock port. That rule forces determinism.
