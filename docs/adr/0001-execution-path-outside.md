# ADR-0001 Keep it off the execution path

Status: accepted (Target + V1). Source: docs/design.md chapter 34.

- Context: An Agent permission product first suggests intercepting tool calls and judging them. Claude Code Auto Mode already occupies that place, and the base rate of detection targets in real records was close to 0.
- Decision: This product never blocks, approves, or delays any tool call. The hook observes only and always exits 0.
- Alternatives: A `PreToolUse` gateway (direction B).
- Consequences: No availability burden, and adoption is easy. There is no live-blocking demo. Enforcement depends on vendor features.
- Reversal trigger: When a runtime with a high rate of adversarial input must be supported and the vendor classifier cannot be used.
