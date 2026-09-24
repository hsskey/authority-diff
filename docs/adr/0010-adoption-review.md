# ADR-0010 First-adoption review is a single evaluation with no baseline, and an Adoption Group is the policy-judgement unit

Status: accepted (V1). Source: docs/cutline.md chapters 5, 6, and 18 and the Initial Adoption review contract. Collects decisions fixed across replay core, policy lifecycle, adoption review (gate, decision record), and Activity Overview. Measurement is docs/evidence/adoption-preview.md.

- Context:
  V1's first Policy Version was seeded already `accepted`, and Change Review only had `version_diff`, which compares an accepted baseline with a candidate.
  The question V1 set out to prove was "if we apply this policy change, which past Actions get a different Effect", and that comparison needed a baseline. Gate 2 and Gate 3 ran on accepted version 1 created by `seedAcceptedPolicy`, and how to review and adopt the first policy was undefined.
  When an organization introduces a policy for the first time there is no baseline, and a transcript alone does not say whether the past runtime actually approved each Action.
  So a separate Replay Run kind was needed to show "if we apply this first policy to past Agent behavior, which of allow/ask/deny each Action becomes going forward".
  The signature of the unit a person judges in that preview (Adoption Group) also had to be fixed.
  Pre-measurement on the frozen corpus: signature A `[effect, capability, zone, program]` made 237 ask/deny groups (67 of size 1); signature B `[effect, capability, zone]` made 23 (the top 3 cover 95.4% of ask/deny Actions); both signatures had exactly 1 deciding Rule per group.
- Decision:
  An `adoption` Replay Run is a single evaluation that applies one candidate Policy Version to past Actions with no baseline.
  `baselineVersionId` is null and `inputsHash` is made from `['adoption', candidateContentHash, window, classifierVersion, actionCount, lastActionKey]`.
  Do not turn the transcript's observedOutcome (`executed`, `rejected_by_human`, `blocked_by_runtime`) into an Effect. `executed` may have run after a person approved it, so it cannot be a baseline.
  Do not add a Decision Source such as `historical_activity`. Adoption is not a comparison; it is an evaluation of one candidate.
  An Adoption Group's signature is B `[effect, capability, zone]`. A Rule does not look at program, so one Policy judgement is one group, which matches what an adoption verdict judges: "is this restriction intended".
  program is evidence inside the group, not the group key. Put `programSummary` (top 10) and `distinctProgramCount` on the group and include them in `resultHash`. The group's `program` field is always null.
  A Change Review (`version_diff`) Diff Group signature still includes program. The two reviews answer different questions. Adoption asks "is this restriction intended"; change asks "was this widened behavior expected", and the latter must be concrete through program. Do not change `computeDiffWith`'s signature or `resultHash`.
  An Adoption Group has no severity. Do not reuse `critical` from widening. `allow` Actions are counted only and are not made into groups. Sort is deny → ask → actionCount descending → sessionCount descending → groupKey.
- Decision (policy lifecycle):
  `createPolicy` makes version 1 as `draft`. accepted arises only from a review decision.
  `getBaseline` returns only the most recent `accepted` version; if there is none, `policy.no_accepted_version`. It does not fall back to version 1.
  The organization has one Policy. The policy module's `createPolicy` rejects with `policy.organization_policy_exists` when a Policy already exists, and does not pick one even if several exist.
  This invariant lives in the application layer (policy module). The store (`createPolicyRepository`) allows several Policy rows because integration tests isolate each test to one Policy on a shared database. Put the database constraint after that isolation method changes.
  `seedAcceptedPolicy` is legacy/test only. An accepted version 1 row seeded on that path remains valid.
  `accepted` is a review result, not a deployment or enforcement status. Lifecycle is drawn `draft → in_review → accepted → [outside Authority Diff] apply managed settings → runtime observation → conformance`. Application is done by the organization's settings-deployment tooling; Authority Diff does not store whether it was applied. Do not use accepted as active, applied, or enforced.
- Decision (adoption review):
  Store `kind` (`change` | `adoption`) on Change Review; `baselineVersionId` is null only for `adoption` (migration 0009 CHECK).
  The request does not receive kind. The server derives it: `adoption` (adoption run) when there is no accepted version, `change` (version_diff run) when there is. If the candidate is the accepted version itself, reject the transition with 409.
  One open review (`computing` or `ready`) per Policy regardless of kind (`review.open_review_exists`).
  The adoption gate requires a verdict on every ask group and deny group. Only `expected` passes; unreviewed, `investigate`, and `unexpected` close with `adoption_unreviewed`, `adoption_investigate`, and `adoption_unexpected`. The `widening_*` computation for kind `change` is unchanged.
  Adoption accept makes the candidate accepted, and the Decision Record's `baselineContentHash` is null. The audit hash chain serializes that null as-is, so existing record verification does not change.
  An adoption Evidence Report carries the policy hash, window, analysis scale, allow/ask/deny counts and shares, the needs-confirmation group table, the deny group table, verdicts, the decision record, the Decision Record hash, the fixed notices, and "these figures apply the policy to past behavior and do not recover whether the past runtime approved".
- Decision (Activity Overview):
  A screen with no Policy shows Activity Overview from imported Actions only (Session count, Action count, Capability and Target Kind distributions, Analyzability, top programs, Remote Key hosts). It does not emit Effect or Zone because there is no Environment Profile.
  `/` has three states: no Policy, draft only, and accepted present. If there are 2 or more Policies, show an unsupported state and do not pick automatically.
- Alternatives:
  Signature A. Each group has one program, so it is the most specific, but the same Rule judgement scatters into as many as 117 groups, and the group does not match the unit on which a "policy needs a fix" verdict can be applied to the Policy (a Rule or a Zone setting).
  A `historical_activity` Decision Source that uses observedOutcome as baseline. That would invent transitions from a value that never recovered approval.
  Putting the one-Policy constraint on the `policies` table as a database constraint. That requires changing the 5 integration-test files that isolate by Policy on a shared test database first.
  Receiving review kind on the request. Both kinds would be possible in the same Policy state, so separate checks would be needed to block a change review with no baseline or an adoption review when accepted exists.
  Dropping program from the Change Review signature to match adoption. Change Review evidence is still too thin to judge.
- Consequences:
  Grouping units differ by review kind. UI and documents must write the two groupings apart.
  `/` fills with Activity Overview even without a Change Review replay. Effect distribution appears only after an accepted version exists.
  `ReplayRunSchema` becomes a discriminated union by kind, and an `adoption` run's `stats` is `AdoptionStats`. Existing `version_diff` and `conformance` rows parse with no backfill.
  One Adoption Group can mix several programs. Group detail must show `programSummary` so an "expected" verdict reveals what it is endorsing.
  Store tables `replay_adoption_groups` and `replay_adoption_assignments` are added (migration 0008).
  `change_reviews.kind` and nullable `baseline_version_id`, nullable `review_decisions.baseline_content_hash` are added (migration 0009). Existing review rows are `change`.
- Reversal trigger:
  Unify both signatures on B if Change Review evidence accumulates enough to confirm program is not actually needed for Diff Group judgement.
  Conversely, revisit putting program on the Adoption Group signature if cases where an adoption verdict splits by program repeat in the real corpus.
  Either way, groupKey and resultHash change, so compatibility of stored runs and verdicts must be fixed first.
