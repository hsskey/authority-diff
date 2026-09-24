# ADR-0002 An intent-level spec is canonical; runtime settings are an implementation

Status: accepted (Target + V1). Source: docs/design.md chapter 34.

- Context: Replay had to choose its baseline: "our spec" or "the result of emulating Claude Code settings". Claude Code's permission-check logic changes every week.
- Decision: Treat the Capability- and Zone-based spec as the baseline and do not emulate runtime matchers. Measure the gap between spec and runtime with conformance observation.
- Alternatives: Emulating the `settings.json` rule matcher.
- Consequences: Less shaken by vendor changes, and adding a runtime is easier. A replay result is a "difference on the spec", not a "prediction of actual runtime behavior", and that gap must show up as a fidelity metric.
- Reversal trigger: When fidelity stays below 0.8 and the cause is a limit of the spec's expressiveness.
- V1 note: Conformance and fidelity measurement are Tier 3, so they are absent from V1. The R3 wording rule (docs/cutline.md chapter 1) limits speech to "difference on the spec".
