# ACR-0010 Diff Group sample Target keys and rule rationales

Status: proposed (2026-09-23).
Procedure: docs/design.md 33.3.

Each Diff Group sample gains `targetKeys`, `baselineRuleRationales`, and `candidateRuleRationales`.
This touches `packages/replay/lib/app/module.ts` (`DiffGroupSample`), `packages/contracts` (`DiffGroupSampleSchema`), and the group detail screen in `apps/web`.

## Context

The group detail Operations list rendered each Operation's full Target, such as a full path, next to its analyzability and signals.
Full paths and command text belong only in the redacted tool input panel.
The decision tables showed `decidingRuleId`, which names a rule but does not say why it decided the Operation.
`apps/web` may import only `@authority/contracts` and `@authority/kernel`, so it cannot call `deriveTargetKey` or read rule rationales without a wire field.

## Decision

- `targetKeys[i]` is `deriveTargetKey(action.operations[i].target)`, the same key the Target Summary uses.
- `baselineRuleRationales` and `candidateRuleRationales` map `ruleId` to `rationale` for the rules that decided an Operation in that Decision, taken from the Policy Documents the samples are evaluated with.
- The Operations list shows capability, Zone (baseline to candidate), and Target key only.
- The decision tables show the rationale; `decidingRuleId` sits behind a <!-- ko-product-output -->"기술 세부" toggle.
- The fields are required: the server and the web app ship together, and no other client reads the samples route.

## Alternatives

- Deriving the Target key in `apps/web`: duplicates `deriveTargetKey`, which may still change before the diff review verdict, so the two could drift.
- Fetching both Policy Versions from `apps/web` to look up rationales: two more requests and loading states on the screen, and nothing ties them to the Documents the samples were evaluated with.

## Consequences

- The samples response grows by one string per Operation and one rationale per deciding rule.
- Diff Groups, groupKey, `resultHash`, and Verdicts are unchanged.
