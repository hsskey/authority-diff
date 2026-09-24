# ADR-0011 (draft, not a decision to begin implementation) Restore Mandate Exception in PolicyDocument schemaVersion 2 and connect it to the gate through probe interpretation stability

Status: Proposed. This is not a decision to begin implementation. Sources: docs/design.md 13.5, 14, 15, 16.4, 24.4, 24.6 and docs/cutline.md chapters 6, 12. It builds on ADR-0005 and ADR-0009.

- Context:
  ADR-0009 removed `PolicyRule.mandateException` and `Decision.isMandateDependent` in schemaVersion 1, and decided that if a natural-language Mandate condition becomes necessary it would be added through an explicit schemaVersion 2 migration.
  ADR-0005 decided to use the Decision Provider for offline probe only and not to evaluate Mandate Exception in replay.
  The V1 probe is an exploratory step (docs/evidence/probe-exploratory.md).
  The default template has no Mandate Exception, so all 35 Scenarios matched their expected Effect, and 32 had an Effect margin of 1.00.
  The Effect question barely moved, and the place where interpretations diverged was the `mandate_reading` question.
  Of the 8 Mandates with delegated phrasing, 4 were read as `implied` and 4 as `not_authorized`.
  The same document also recorded a limitation: the policy prose omitted the Rule's reversibility and analyzability conditions, so the Rule reads broader than it actually is.
  There is no repeated run and no second-reader comparison.
  That is, the current probe shows only a ranking, with no cutting threshold and no gate connection.
  Reviving Mandate Exception requires deciding four things together.
  the schema and migration, the sentence conditions the probe can measure, the golden set and threshold that justify trusting that measurement, and how the measurement result connects to the Change Review gate.
  This document is a draft of those four.

- Decision (schemaVersion 2):
  `PolicyDocument.schemaVersion` becomes a `1 | 2` discriminated union.
  The schemaVersion 2 `PolicyRule` has design doc 24.4's `mandateException: { clause: string(10..300) } | null`.
  The field is nullable, not optional, and when it has a value that Rule's Effect must be `ask`.
  A Rule has at most 1 Mandate Exception.
  Restore `OperationDecision.isMandateDependent` and `Decision.isMandateDependent`.
  `isMandateDependent` is true only when the Effect is `ask` and every matched `ask` Rule has a Mandate Exception.
  It is false if an `ask` Rule without an exception is also matched.
  decidingRule selection returns to design doc 13.5's "Rule without a Mandate Exception first, then ruleId lexical order".
  In a schemaVersion 1 document no Rule has a Mandate Exception, so this rule produces the same result as ruleId lexical order.
  Replay does not evaluate Mandate Exception (ADR-0005).
  A Mandate-dependent Action's Effect stays `ask` and only gets the `isMandateDependent` marker.
  Diff Group and Adoption Group do not change their signature and carry `mandateDependentCount` as evidence within the group.
  The Adoption Group signature `[effect, capability, zone]` (ADR-0010) stays the same.
- Decision (migration):
  A stored schemaVersion 1 Policy Version is not rewritten.
  That is because its `contentHash` is referenced by the Replay Run's `inputsHash` and the Decision Record's hash chain.
  A schemaVersion 1 document keeps parsing, and the evaluator reads every Rule's `mandateException` as null.
  The one way to raise to schemaVersion 2 is to create a new `draft` Policy Version.
  The conversion is a pure function that adds `mandateException: null` to each Rule, and the new version must go through the same Change Review as any other version to become `accepted`.
  A Replay Run that takes only schemaVersion 1 documents as input must have the same `inputsHash` and `resultHash` before and after the restoration.
  How to keep this invariant (how to treat the new field in the hash input) is decided in the implementation ACR.
  `renderPolicyProse` renders the Mandate Exception clause inside the Rule sentence in schemaVersion 2.
  In the same change it also renders the reversibility and analyzability conditions.
  If the prose omits a condition, the probe ends up measuring the renderer's omission rather than the policy sentence.

- Decision (the sentence conditions the probe measures):
  A "Mandate Exception whose interpretation is stable" is a clause that satisfies all of the conditions below.
  The conditions must be computable using only Probe Run results (design doc 24.6's `ProbeResult`) and comparisons between Probe Runs.
  The provider's `confidence` is not used (design doc 2.3). Only `pTop` and `margin` computed directly from the distribution are used.
  - S1 structure: the Rule the clause is attached to has Effect `ask` and a rationale. This condition is judged by schema validation and uses no model.
  - S2 match: for each Scenario that targets the clause (whose `targetRuleId` is that Rule), the top choice of Q1 `effect` equals the expected Effect.
  - S3 read one way: in the same Scenario, Q1 `pTop >= thresholdTop`. If there is no `thresholdTop` (`advisory_only`, `uncalibrated`) this condition is not judged and only the margin ranking is shown.
  - S4 agreement of the two questions: if Q1 is `allow`, the top choice of Q2 `mandate_reading` is `explicit`. If Q1 `allow` and Q2 `not_authorized` appear together, the agreement is broken. This is because the definition of Mandate Exception is "`allow` if the Mandate explicitly permits".
  - S5 locality: after fixing one clause and re-running all Scenarios, none of the Scenarios targeting a different Rule had their top choice change or their `pTop` drop below `thresholdTop`. It is computed by comparing two Probe Runs Scenario by Scenario (design doc 15.4's "neighboring item" observation, docs/cutline.md chapter 12's extension evidence).
  - S6 repeatability: running the Probe Run 3 times with the same Policy Version, the same Scenario, and the same provider model version, the Q1 top choice is the same every time. The range of `pTop` (max - min) is not a condition but is recorded alongside as a measured value, and the allowed span is decided after repeated-measurement data exists.
  Only Q1 is a calibration target.
  Whether a Mandate Exception applies to an ask Rule is already shown by Q1's `allow` vs `ask`, so Q2 is used only for the S4 agreement check.
  What the probe cannot measure is also written down.
  Whether an actual Session's Mandate satisfied the clause is not measured (ADR-0005, no trace is sent).
  Whether the runtime Agent reads the clause with the same meaning is also not measured.
  Whether two people read it with the same meaning is confirmed by the golden set label procedure, not the probe.

- Decision (golden set composition):
  The golden set is the set of `isGolden` Precedents.
  Every Scenario is a synthetic sentence and contains no string taken from a trace.
  Its size is 200 or more (design doc 14.1, 15.1).
  Threshold adoption needs 80 or more in the `pTop >= t` band, and the strengthening step checks whether 120 or more enter that band.
  The composition ratios below are draft values and subject to review.
  - 100 or more target `ask` Rules that have a Mandate Exception. Within those, each of the 4 Mandate expressions (explicit, implied, delegated, absent) is 20 or more. The expression classification follows the definitions in docs/evidence/probe-exploratory.md.
  - The rest target every Rule of the policy at least once, and the expected Effects `allow`, `ask`, `deny` are each 30 or more. It also includes default-Effect (`ask`) Scenarios whose `targetRuleId` is null.
  - In the exploratory run, margin 1.00 was 32/35. If most are easy Scenarios without a Mandate Exception, the threshold comes out easily but tells us nothing about the interpretation stability of the clause. The ratios above are lower bounds to prevent that bias.
  The label procedure is as follows.
  - The expected Effect is decided by the policy owner (design doc 15.5's limitation: the match rate is a match with the owner's intent).
  - The person or agent who wrote the Scenario sentence does not decide the expected Effect. This is because the exploratory run recorded as a limitation that the author also decided the expected Effect.
  - A second person independently labels every golden candidate. If the label differs from the owner's, that Scenario is removed from the golden set and recorded as a "case where interpretation diverged between people". This record is docs/cutline.md chapter 12's third extension evidence.
  1 calibration stores the golden set's hash together.
  Adding or removing a Scenario from the golden set is a new calibration.

- Decision (threshold derivation, design doc chapter 15):
  `thresholdTop` is not a constant; it is derived from the golden set per provider and per provider model version.
  The procedure is exactly design doc 15.2.
  Judge the entire golden set to obtain `(pTop, judgedEffect)`.
  Examine candidate `t` in `{0.50, 0.55, ..., 0.95, 0.97, 0.99}` in ascending order.
  `B(t) = {pTop >= t}`, `n = |B(t)|`, and `k` is the number of matches within `B(t)`.
  Adopt the first `t` where `n >= 80` and `wilsonLowerBound(k, n) >= 0.95`.
  If there is none, `thresholdTop = null` and the provider state is `advisory_only`.
  Store coverage, ECE (equal-mass 10 bin), Brier, and the per-bin mean `pTop` and match rate together.
  The basis for the numbers is as follows.
  - For the Wilson 95% lower bound to be 0.95 or more, you need 73 at 0 errors, 110 at 1 error, 142 at 2 errors, and 173 at 3 errors.
  - In the minimum band of 80, the lower bound is 0.954 at 0 errors and 0.933 at 1 error. The 80-109 band passes only at 0 errors.
  - 30/30 is 0.887 and 35/35 is 0.901. The current exploratory result cannot claim 95%.
  - The cost of 1 missed ambiguity (30 minutes or more of incident investigation, irreversible if sent externally) is 30 times or more the cost of 1 unnecessary confirmation (about 1 minute) (design doc 15.3). So the threshold is set toward demanding more confirmation and is adopted even if coverage is below 0.4.
  - `trusted` is entered at a lower bound of 0.95 and exits to `degraded` below 0.93. This is the gap that keeps the state from flipping repeatedly at the boundary (design doc 15.5).
  When the provider model version changes it is `degraded` until re-measurement.
  The re-measurement cycle is design doc 14.1's 1/week.

- Decision (gate connection):
  The probe blocker applies only when the candidate document has 1 or more Mandate Exceptions.
  A schemaVersion 1 document and a schemaVersion 2 document with no clause stay on the current gate. This is because replay determines every Effect.
  A Probe Run is bound to the candidate's `contentHash`. Fixing the policy in one place makes a new Policy Version and re-runs all Scenarios.
  Scenario verdicts use design doc 15.4's `pass`, `conflict`, `ambiguous`, `suggested`, `unevaluated`.
  The blocker codes are the three below.
  - `probe_incomplete`: there is no completed Probe Run for the candidate `contentHash`, or there is an `unevaluated` Scenario and no exemption (design doc 16.4).
  - `precedent_conflict`: there is a `conflict` verdict among the Precedents (design doc 16.4). You must fix the policy sentence or the expected Effect and make a new review.
  - `probe_unconfirmed`: there remains a Scenario that needs a person's confirmation. If the provider is not `trusted`, every Scenario is a target; if `trusted`, an `ambiguous` one with no expected Effect is the target. This code is not in design doc 16.4 and is added to make design doc 15.4 and 15.5's "confirmation requirement" visible at the gate.
  A Scenario whose S4 agreement is broken and a Scenario whose S5 locality is broken are carried as warnings in the Evidence Report, not as blockers. They are not used as a condition to close the gate before the judgment-criteria data has accumulated.
  An exemption is allowed only for `unevaluated` (provider call failure). `conflict` and `probe_unconfirmed` cannot be exempted.
  The exemption reason, the Probe Run's `resultHash`, the calibration id, and the provider state are put into the Decision Record and left in the audit hash chain (an extension of `docs/acr/0006-review-decision-hash-chain.md` and a target for the implementation ACR).
  The probe result does not change the replay Effect, the Diff Group, or the Adoption Group. It is used only as the basis for closing or opening a review.
  The gate connection is turned on only after there is 1 or more calibration record.

- Decision (start conditions):
  It carries over the three extension evidences of docs/cutline.md chapter 12 as is.
  1. In the exploratory run, there are 3 or more cases where the author actually fixed the policy sentence because of a low margin or a mismatch with expectation, and after the fix a full re-run moved that item's distribution as intended without worsening the neighboring item.
  2. After schemaVersion 2, Mandate Exception is used 2 or more times in an actual policy.
  3. In 1 or more of the Scenarios the probe flagged, a second person's interpretation actually differs from the author's.
  This draft is turned into accepted step by step in the following order.
  - schemaVersion 2 restoration: when conditions 1 and 3 are confirmed. This corresponds to ADR-0009's reversal trigger ("the probe shows value").
  - golden set and calibration: when condition 2 is also confirmed.
  - gate connection: after a calibration record exists.
  In the current state none of the three conditions can be met. This is because the default template has no Mandate-dependent Rule.
  Without a Mandate-dependent Rule the Effect follows the Rule as is, so the exploratory run had 0 expected-Effect mismatches (35/35) and there is no basis to fix a sentence (condition 1).
  schemaVersion 1 has no Mandate Exception field (condition 2).
  There is no Scenario with a mismatch or low margin for the probe to flag, so there is nothing to compare with a second person either (condition 3).

- Alternatives:
  Express it with a narrower `allow` Rule without a Mandate Exception. It is deterministic, but the condition "when the Principal explicitly requested" cannot be expressed with Capability, Zone, or reversibility.
  Evaluate Mandate Exception with the Decision Provider in replay. The actual Mandate and commands go outside and there is no ground-truth label (ADR-0005).
  Extend schemaVersion 1 in place (add the field then recompute `contentHash`). The hashes referenced by the stored version, Replay Run, and Decision Record break.
  Use the provider `confidence` or a fixed constant as the threshold. `confidence` is not the probability of being correct (design doc 2.3), and a constant does not reflect the different calibration per provider and model version.
  Also make Q2 `mandate_reading` a calibration target. It would additionally need an expected `mandate_reading` label, and the same information is already in Q1's `allow` vs `ask`.
  Apply the probe blocker to all schemaVersion 2 documents. For a document with no clause replay determines every Effect, so the probe has no basis to block.
  Make S4 and S5 blockers from the start. There is not yet the repeated-measurement data to set the criteria values.
- Consequences:
  `PolicyDocumentSchema`, `DecisionSchema`, `OperationDecisionSchema`, `GateBlockerCodeSchema`, and `review_decisions` change. All are schema contracts, so an ACR is needed before implementation.
  schemaVersion 1 and 2 coexist. The evaluator, prose renderer, and policy editor must read both versions.
  The Change Review of a policy that uses Mandate Exception assumes a golden set of 200 and labels from two people. The first confirmation costs a person's time, but a confirmed Scenario remains as a Precedent and becomes the regression baseline for later versions.
  Since the threshold is chosen from the same golden set and the match rate is reported on that set, the reported match rate is an in-sample value. Re-measurement 1/week and re-measurement on model version change compensate for this.
  The probe speaks only to the stability of sentence interpretation. The Evidence Report carries a fixed notice in the probe section: "Whether the Mandate Exception was applied in an actual Session was not evaluated".
- Reversal trigger:
  If calibration repeatedly ends in `advisory_only` (the provider cannot derive a threshold from the golden set), withdraw the gate connection and return the probe to a reference section.
  If the second person's label disagreement accounts for a substantial part of the golden candidates, re-examine the sentence form of Mandate Exception ("a conservative default plus 1 specific exception", design doc 13.5) first.
  If Mandate Exception is not used in an actual policy, do not introduce schemaVersion 2 and keep ADR-0009.

- Open questions:
  The values of the golden set composition ratios (100 targeting Mandate Exception, 20 per expression, 30 per Effect).
  Whether to make `probe_unconfirmed` a separate code or include it in `probe_incomplete`.
  The S6 repetition count of 3 and the allowed span of the `pTop` range.
  Whether to put the second labeler on every golden candidate or only on a sample.
