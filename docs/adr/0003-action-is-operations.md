# ADR-0003 An Action is a set of Operations, and unanalyzable is a first-class result

Status: accepted (Target + V1). Source: docs/design.md chapter 34.

- Context: 25.9% of Bash inputs contained a program in another language, and 91.3% were compound commands.
- Decision: Split a tool call into an Operation list; the Action's Effect follows the most restrictive Operation. An unrecognized fragment is `execute` + `none`. The classifier is a pure function and stores `classifierVersion` on the result. Zone is not stored; it is computed at evaluation time.
- Alternatives: Prefix matching on the command string. Reclassify on every replay. Infer meaning with an LLM.
- Consequences: Classification that bypasses a restriction with a compound command is structurally blocked. A candidate that changes the Environment Profile can be replayed without reclassification. When classification rules change, a reclassify job is required.
- Reversal trigger: When the `analyzability: none` share exceeds 40% and the diff loses meaning.
