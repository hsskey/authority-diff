# ADR-0005 Use a meaning-judgement provider only for offline probe; do not send traces

Status: accepted (Target). V1 status: probe is Tier 2. Source: docs/design.md chapter 34.

- Context: Jev is fast and cheap but early access, and it processes data in the United States. The use that personal experiments confirmed was checking policy sentences.
- Decision: The provider receives only policy prose and synthetic Scenarios. The only concepts that leave the boundary are bounded questions and distributions; the provider's `confidence` is not used.
- Alternatives: Judging Mandate scope in replay. Real-time judgement.
- Consequences: It can be introduced without a privacy review, and swapping the provider does not affect other modules. Replay cannot evaluate Mandate Exception; it only displays it.
- Reversal trigger: When a calibrated judgement model that can live inside the organization exists and 100 or more out-of-scope labels have been collected.
- V1 note: Probe and the Mandate / Mandate Exception concepts are outside V1 scope (docs/cutline.md chapter 12; mandateException is excluded from schemaVersion 1). Confirm Jev API access only at the Tier 2 review point.
