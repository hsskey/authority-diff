# ADR-0004 Order-independent evaluation with restriction first, default Effect ask, own engine

Status: accepted (Target + V1). Source: docs/design.md chapter 34.

- Context: Depending on Rule order makes diffs hard to interpret and splits agent implementations. Off-the-shelf engines exist: OPA and Cedar.
- Decision: `deny > ask > allow`; if nothing matches, `ask`. Implement it directly as a pure function of about 100 lines.
- Alternatives: First-match ordered evaluation. Embed Cedar (permit/forbid, default deny) as WASM.
- Consequences: I1 and I2 can be proved with property tests. Narrowing a broad `ask` requires editing that Rule directly. Effect has 3 values, so it does not map onto Cedar's 2-value model as-is.
- Reversal trigger: Move to Cedar when Rules exceed 200 or Principal / team hierarchy conditions are needed.
