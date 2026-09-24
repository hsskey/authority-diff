# ADR-0009 PolicyDocument schemaVersion 1 holds V1 concepts only

Status: accepted (V1). Source: docs/cutline.md chapter 6 (contract change that drops mandateException from schemaVersion 1). A record of an already adopted decision, not a new decision.

- Context: A natural-language Mandate condition (Mandate Exception) is a Target Architecture concept, but V1 does not evaluate it. We had to choose whether to reserve the unused field for hash stability or omit it and migrate later.
- Decision: schemaVersion 1 holds only concepts V1 evaluates. Drop `PolicyRule.mandateException` and `Decision.isMandateDependent`. When a natural-language Mandate condition is needed, add it with an explicit schemaVersion 2 migration.
- Alternatives: Leave the field and have V1 ignore it (hash-stable reservation). Keep the Target concept as-is.
- Consequences: Stored documents and `contentHash` honestly reflect V1 concepts only. Hard to reverse (stored documents and hashes). A reader of design 13.5 and 24.4 expects the field to exist. The trade-off is schema honesty in exchange for giving up hash-stable reservation.
- Reversal trigger: When meaning judgement (probe, Tier 2) shows value and schemaVersion 2 is introduced. Target Architecture (docs/design.md 13.5, 24.4, ADR-0005) keeps this concept.
