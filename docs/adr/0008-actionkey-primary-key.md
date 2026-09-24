# ADR-0008 Use `actionKey` (sha256) as the primary key of agent_actions

Status: accepted (V1). Source: docs/cutline.md chapter 6 (contract change). A record of an already adopted decision, not a new decision.

- Context: When the same transcript is imported again, or when the local pipeline and the server each compute, the same Action must have the same identifier on both sides so `resultHash` can be compared.
- Decision: Remove `AgentAction.id` (ULID) and use `actionKey` (sha256) derived from content as the primary key.
- Alternatives: `act_` ULID plus a separate `actionKey` column (the original in design chapter 24). Issue a new ULID on every import.
- Consequences: Identifiers are stable across reimport and across local/server, so the determinism comparison (I6) holds. This differs from the ULID primary-key rule in design 22.3, so it looks surprising to someone who read only that rule.
- Reversal trigger: When a content collision (same actionKey, different Action) is measured, or when a multi-person organization needs Principal-separated storage.

A continued Session can copy the previous conversation into a new transcript file, so `sessionExternalId` is not always put in the key. When `toolUseId` is present use `sha256Hex(canonicalJson([runtime, toolUseId]))`; otherwise use `sha256Hex(canonicalJson([runtime, sessionExternalId, "seq", sequence]))`. When several Sessions yield the same `actionKey`, keep the Action with the earliest `occurredAt`, and on a tie keep the first Action by `sessionExternalId` UTF-16 code unit ascending. Deduplication belongs to the consumer that gathers several Sessions, not to the parser that handles one file.
