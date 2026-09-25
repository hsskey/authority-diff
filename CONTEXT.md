# Authority Diff - V1 glossary

This file is a glossary only; it does not carry implementation detail.
File, symbol, table, and HTTP names use the words here.
The source is `docs/design.md` 13.1, with Tier 2/3 concepts removed to match V1 scope (`docs/cutline.md`).
Target Architecture-only terms (Scenario, Precedent, Probe Run, Decision Provider) are not in the V1 glossary.
Finishing the glossary is human work at contract freeze; this list is the input to that work.

**Principal**:
The person who gave the Agent the work.
_Avoid_: user, developer, owner

**Session**:
One Agent execution from start to end in one runtime.
In Claude Code, one transcript file.
_Avoid_: conversation, run

**Parsed Session**:
A Session whose transcript lines have been parsed and redacted in memory.
It also carries the count of lines that could not be parsed and the observed Actions.

**Action**:
One tool call the Agent tried to run.
It names the attempt, whether or not it executed.
_Avoid_: command, event, tool use

**Action Key**:
An Action identifier derived deterministically from the runtime's tool-use identifier.
When that identifier is absent, it uses the Session identifier and a sequence number.

**Operation**:
The smallest unit obtained by splitting an Action.
It exercises one Capability on one Target.
One Bash Action has several Operations.
_Avoid_: fragment, step, sub-command

**Capability**:
The kind of power an Operation exercises.
A fixed enum.
_Avoid_: permission, action type, verb

**Target**:
The object an Operation's effect reaches, written as the runtime read it.
A path, host, VCS remote, package, MCP tool, and so on.
_Avoid_: resource, object

**Remote Key**:
A VCS remote normalized to `host/owner/repo`.
It does not include scheme, user, port, or a trailing `.git`.

**Zone**:
A Target classified against the organization's trust boundary.
A fixed enum.
_Avoid_: scope, boundary, trust level

**Environment Profile**:
The organization's statement of fact used to compute Zone.
Trusted hosts, credential paths, protected branches, and so on.
_Avoid_: config, trusted infrastructure, context

**Analyzability**:
How firmly the classifier established the Operation's effect.
`full`, `partial`, `none`.
_Avoid_: opacity, confidence

**Reversibility**:
How far an Operation can be undone after it runs.
_Avoid_: risk, severity

**Effect**:
The outcome the spec assigns to an Operation or Action.
`allow`, `ask`, `deny`.
_Avoid_: decision (used alone), verdict, permission

**Rule**:
One sentence that attaches one Effect to Capability, Zone, Reversibility, and Analyzability conditions.
_Avoid_: policy (when pointing at a single rule), statement

**Policy**:
The vessel that holds the organization's permission spec.
A bundle of Versions.

**Policy Version**:
One immutable document.
It includes the Rule list and the Environment Profile, and is identified by content hash.
Status is `draft`, `in_review`, `accepted`, `rejected`.
`accepted` is a review result, not a deployment or enforcement status.
_Avoid_: revision, snapshot, active / applied / enforced for accepted

**Policy Activation**:
A declaration that an operator applied an accepted Policy Version outside Authority Diff, with a reason and the operator's name.
It does not change Policy Version status, and replay and evaluation do not read it.
The daily conformance schedule reads the one in effect at the start of the day it checks, to choose which Policy Version it checks, and skips a day on which a different Policy Version was declared.
_Avoid_: deployment, enforcement, active version

**Mandate**:
The instruction the Principal gave the Agent for the work.
_Avoid_: prompt, request, task

**Mandate Exception**:
One clause on an `ask` Rule of a schemaVersion 2 Policy Version that names when the Mandate itself makes the Action `allow`.
Replay does not evaluate it; the Effect stays `ask`.
_Avoid_: override, waiver

**Mandate-dependent**:
A Decision whose `ask` rests only on Rules with a Mandate Exception.
It is recorded on the Decision only and does not enter a Diff Group, an Adoption Group, the Gate, or `resultHash`.
_Avoid_: conditional ask, soft ask

**Decision**:
The evaluation of one Policy Version against one Action.
It includes the Effect and the Rule it rests on.
_Avoid_: result, outcome

**Replay Run**:
One execution that applies a Decision Source to the same Action set.
`version_diff` compares two Policy Versions; `conformance` compares `observed_runtime` with a Policy Version.
`adoption` applies one candidate Policy Version with no baseline.
No kind infers whether the past runtime approved the Action.

**Decision Source**:
The side that produces an Effect in a Replay.
A Policy Version, or `observed_runtime` (an observed Disposition).

**Disposition**:
What the runtime actually did with the Action.
`auto_executed`, `prompted`, `hook_approved`, `blocked`, `executed_prompt_unknown`.
_Avoid_: observed decision, runtime state

**Conformance Finding**:
A bundle of Actions whose Disposition disagrees with the Policy Version's Effect.
`violation`, `under_asked`, `over_asked`.
State is `open` or `acknowledged`; leave a note when acknowledging.
_Avoid_: drift, incident, alert

**Diff Group**:
Actions whose Effect changed, bundled by the same signature.
The unit a person judges.
_Avoid_: cluster, bucket

**Group Key**:
An identifier derived deterministically from a Diff Group or Adoption Group signature.

**Adoption Group**:
A bundle of Actions to which the candidate Policy Version, in an `adoption` Replay Run, gave the same Effect (`ask` or `deny`) on the same Capability and Zone.
The unit a person judges in first-adoption review; the signature has no program and no severity.
`allow` Actions are counted only and are not made into Adoption Groups.
_Avoid_: adoption cluster, ask bucket

**Program Summary**:
The top 10 programs of the signature Operations in an Adoption Group, with counts.
_Avoid_: top programs

**Widening / Narrowing**:
Widening when the candidate's Effect is less restrictive than the baseline; Narrowing when it is more restrictive.
_Avoid_: loosening, tightening, regression

**Headline**:
One plain-language sentence from a fixed template that describes a Diff Group or Adoption Group.
_Avoid_: summary, description

**Target Summary**:
The top 5 Target keys in a Diff Group or Adoption Group, with counts.
_Avoid_: top targets

**Verdict**:
The judgement a person records on a Diff Group or Adoption Group.
`expected`, `investigate`, `unexpected`.
Screen labels differ by Review Kind.
The Korean screen strings live in the web app (`apps/web`), not in this file.
`change` uses expected change / needs investigation / unexpected; `adoption` uses intended restriction / hold / policy needs a fix.

**Change Review**:
The unit that decides whether to accept one Policy Version.
It binds a Replay Run, Verdicts, and the decision record.
The screen label is change review when Review Kind is `change`, and first-adoption review when it is `adoption`.
When Review Kind is `adoption` there is no baseline Policy Version.
_Avoid_: approval request, PR

**Review Kind**:
The kind of Change Review.
`change` compares an accepted baseline and a candidate Policy Version with `version_diff`; `adoption` evaluates one candidate with an `adoption` Replay Run when there is no accepted version.
The request does not choose the kind; the server sets it from whether the Policy has an accepted version.
_Avoid_: review type, review mode

**Accept Policy Change / Reject Policy Change**:
The two actions that leave a decision on a Change Review.
When Review Kind is `adoption` they are called adopt first policy / reject first policy.
_Avoid_: Approve Review, Mark Reviewed, activate

**Withdraw Review**:
The action by which a person closes a `computing` or `ready` Change Review without a decision.
The screen label is withdraw review and review status becomes `withdrawn`.
The candidate Policy Version returns to `draft` via the withdrawal transition, no Decision Record is written, and a withdrawn review does not count as an open review.
_Avoid_: cancel, delete, discard

**Decision Record**:
The immutable record of one accept or reject of a policy change or a first adoption.
When Review Kind is `adoption` the baseline content hash is null.
_Avoid_: approval, activation, deployment record

**Evidence Report**:
A Markdown artifact an engineering lead reads, carrying the Change Review decision and the evidence hashes.
_Avoid_: approval document, audit report

**Trace Import**:
One record of loading one transcript file onto the server. It has accepted, duplicate, rejected, and redaction counts.
_Avoid_: upload, ingest batch

**Runtime Observation**:
One event a runtime hook reported (pre_tool_use, permission_request, session_end). It is not used for judgement; it is used only for conformance comparison. It is joined to an Action by the tool-use identifier. A permission_request with no tool-use identifier is paired with the preceding pre_tool_use that has the same Session, the same tool, and the same input hash.

_Avoid_: event, log entry

**Gate**:
The computed result of whether a Change Review may be accepted. It opens when the blocker list is empty. A rule computes it, not a person.
When Review Kind is `change` it looks at Verdicts on Widening groups; when `adoption` it looks at Verdicts on every Adoption Group.
_Avoid_: approval check, guard

**Activity Overview**:
An activity summary aggregated from imported Actions with no Policy.
It holds Session count, Action count, Capability distribution, Target Kind distribution, Analyzability share, top programs, and Remote Key hosts.
Effect and Zone are absent because they need a Policy.
_Avoid_: Activity Shape, dashboard

**Target Kind**:
A value that groups Targets by kind in Activity Overview.
`workspace_path`, `other_path`, `vcs_remote`, `host`, `package`, `mcp`, `deploy_target`, `unknown`.
Unlike Zone, it is decided from the Target itself with no Environment Profile.
_Avoid_: target type, resource kind

Relations:

- A Session has several Actions.
- An Action has zero or more Operations.
  An Action with 0 Operations is excluded from evaluation.
- A Decision's Effect is the most restrictive Effect among the Operations.
- A Change Review refers to 1 Replay Run.
- The organization has one Policy.
  When there is no accepted version, Review Kind is `adoption`; otherwise `change`.
- `accepted` on a Policy Version is a review record.
  Applying it to runtime settings happens outside Authority Diff; Runtime Observation and Conformance Finding after that are what speak to actual behavior.
