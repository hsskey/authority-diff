/** Text with emphasized values; the screen renders each `em` part in bold. */
export type Emphasized = readonly (string | { readonly em: string | number })[];

/** The structured fields a Diff Group Headline is composed from, already in words. */
export interface DiffHeadlineWords {
  readonly target: string | null;
  readonly targetCount: number;
  readonly targetCountIsFloor: boolean;
  readonly capability: string;
  readonly actionCount: number;
  readonly fromEffect: string;
  readonly toEffect: string;
  readonly zoneChange: { readonly from: string; readonly to: string } | null;
}

/** The structured fields an Adoption Group Headline is composed from, already in words. */
export interface AdoptionHeadlineWords {
  readonly zone: string;
  readonly capability: string;
  readonly actionCount: number;
  readonly effect: string;
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

export const en = {
  common: {
    loading: 'Loading',
    unknownError: 'Unknown error',
    replayRunNotLinked: 'The replay run is not linked yet',
    view: 'View',
    creating: 'Creating…',
    period: 'Period',
    baselineVersion: 'Baseline version',
  },
  layout: {
    skipToContent: 'Skip to main content',
    mainMenu: 'Main menu',
    overview: 'Activity',
    conformance: 'Conformance',
    login: 'Log in',
    logout: 'Log out',
    languageName: 'English',
  },
  apiError: {
    tokenMissing: 'Log in first. Enter a token.',
    tokenInvalid: 'The token is not valid. Log in again.',
    reviewNotOpen: 'This review is already decided and can no longer change.',
    openReviewExists: 'This policy already has a review in progress. Decide that review first.',
    gateBlocked: 'The gate is closed, so this cannot be adopted. Resolve the blockers first.',
    draftExists: 'This policy already has an open draft.',
    organizationPolicyExists: 'An organization policy already exists.',
    versionNotDraft: 'Only a draft version can be edited.',
    contentConflict: 'This document was saved elsewhere first. Refresh, then save again.',
    transitionNotAllowed: 'A review cannot be created in this version status.',
    classifierVersionMismatch:
      'Some Actions in the period were classified by another classifier version. Run reclassify, then try again.',
    networkFailed: 'The network request failed',
    errorResponseMismatch: 'The error response does not match the contract',
    responseMismatch: 'The response does not match the contract',
  },
  effect: {
    allow: 'Allow',
    ask: 'Ask',
    deny: 'Deny',
  },
  verdict: {
    none: 'Not judged',
    label: 'Verdict',
    selectFor: (groupLabel: string) => `Verdict for ${groupLabel}`,
    change: {
      expected: 'Expected change',
      investigate: 'Needs investigation',
      unexpected: 'Unexpected',
    },
    adoption: {
      expected: 'Intended limit',
      investigate: 'On hold',
      unexpected: 'Needs policy fix',
    },
  },
  blocker: {
    replay_incomplete: (count: number) => `Replay has not finished yet (${count})`,
    replay_failed: (count: number) => `Replay failed (${count})`,
    widening_unreviewed: (count: number) => `${plural(count, 'group', 'groups')} not judged`,
    widening_investigate: (count: number) =>
      `${plural(count, 'group', 'groups')} left as Needs investigation`,
    widening_unexpected: (count: number) =>
      `${plural(count, 'group', 'groups')} judged Unexpected. Fix the policy and create a new review`,
    adoption_unreviewed: (count: number) => `${plural(count, 'group', 'groups')} not judged`,
    adoption_investigate: (count: number) => `${plural(count, 'group', 'groups')} left On hold`,
    adoption_unexpected: (count: number) =>
      `${plural(count, 'group', 'groups')} judged Needs policy fix. Fix the policy and create a new review`,
  },
  headline: {
    capability: {
      read: 'read',
      write: 'write',
      delete: 'delete',
      execute: 'execute',
      install: 'install',
      fetch: 'fetch',
      send: 'send',
      commit: 'commit',
      push: 'push',
      rewrite: 'history rewrite',
      deploy: 'deploy',
    },
    zone: {
      workspace: 'workspace',
      host: 'host',
      credentials: 'credentials',
      agent_config: 'agent config',
      trusted_remote: 'trusted remote',
      public_remote: 'public remote',
      unknown_remote: 'remote outside the trusted list',
      protected: 'protected',
    },
    diff: (words: DiffHeadlineWords) => {
      const others = words.targetCount - 1;
      const where =
        words.target === null
          ? ''
          : others === 0
            ? ` on ${words.target}`
            : ` on ${words.target} and ${words.targetCountIsFloor ? 'at least ' : ''}${plural(others, 'other target', 'other targets')}`;
      const sentence =
        `${words.actionCount} ${words.capability} ${words.actionCount === 1 ? 'action' : 'actions'}${where} ` +
        `${words.actionCount === 1 ? 'changes' : 'change'} from '${words.fromEffect}' to '${words.toEffect}'.`;
      return words.zoneChange === null
        ? sentence
        : `${sentence} Zone: ${words.zoneChange.from} in the baseline policy, ${words.zoneChange.to} in the candidate.`;
    },
    adoption: (words: AdoptionHeadlineWords) =>
      `${words.actionCount} ${words.capability} ${words.actionCount === 1 ? 'action' : 'actions'} in ${words.zone} ` +
      `${words.actionCount === 1 ? 'gets' : 'get'} '${words.effect}' under this policy.`,
  },
  groupLabel: {
    noProgram: 'no program',
  },
  traceSources: (counts: { transcript: number; synthetic: number; hook: number }) => {
    const line = `Record sources: ${counts.transcript} from real transcripts / ${counts.synthetic} synthetic`;
    return counts.hook === 0 ? line : `${line} / ${counts.hook} from hooks`;
  },
  login: {
    title: 'Log in',
    token: 'Bearer token',
    save: 'Save token',
  },
  overview: {
    title: 'Activity',
    analyzability: {
      full: 'Fully analyzable',
      partial: 'Partially analyzable',
      none: 'Not analyzable',
    },
    targetKind: {
      workspace_path: 'Workspace path',
      other_path: 'Path outside the workspace',
      vcs_remote: 'VCS remote',
      host: 'host',
      package: 'package',
      mcp: 'MCP tool',
      deploy_target: 'Deploy target',
      unknown: 'Unrecognized',
    },
    loadingOverview: 'Aggregating imported activity',
    overviewLoadFailed: 'Could not load the activity overview',
    loadingPolicies: 'Checking policies',
    policiesLoadFailed: 'Could not load policies',
    overviewTitle: (days: number) => `Imported activity overview (last ${days} days)`,
    overviewHint:
      'Counts only Actions imported from transcripts. Effect and Zone need a policy to compute.',
    sessions: 'Session',
    actionsDeduplicated: 'Actions (deduplicated)',
    evaluableActions: 'Evaluable Actions',
    emptyTitle: 'No Actions were imported in this period',
    emptyMessage: 'Import transcripts with authority import to see activity here.',
    analyzabilityTitle: 'Analyzability (by Action)',
    capabilityCaption: (operations: number) =>
      `Capability distribution (${plural(operations, 'Operation', 'Operations')})`,
    capability: 'Capability',
    operation: 'Operation',
    share: 'Share',
    targetKindCaption: 'Target kind distribution (by Operation)',
    targetKindHeader: 'Target kind',
    topProgramsCaption: (count: number) => `Top ${count} programs`,
    program: 'Program',
    noPrograms: 'No Operation has a recognized program.',
    remoteHostsCaption: (count: number) =>
      `VCS remote hosts (from the top ${count} Remote Keys, repository names hidden)`,
    host: 'Host',
    repositories: 'Repositories',
    noRemotes: 'No Operation has a recognized Remote Key.',
    multiplePoliciesTitle: 'Unsupported state: there is more than one organization policy',
    multiplePoliciesMessage:
      'Authority Diff handles a single organization policy. It never picks one automatically; keep only one policy, then start again.',
    firstPolicyTitle: 'No organization policy yet',
    firstPolicyHint:
      'Creates draft version 1 of the first policy from the default template and opens the editor. Nothing is judged before adoption.',
    createFirstPolicy: 'Create the first organization policy',
    createPolicyFailed: 'Policy creation failed',
    loadingVersions: 'Checking policy versions',
    versionsLoadFailed: 'Could not load policy versions',
    noPolicyStateTitle: 'No accepted policy and no open draft',
    noPolicyStateHint:
      'The initial adoption review was rejected. Create a new draft from the last version and review it again.',
    viewVersion: (versionNumber: number) => `View version #${versionNumber}`,
    initialSetupTitle: 'Initial policy setup in progress',
    initialSetupHint: (versionNumber: number) =>
      `Draft version #${versionNumber} exists and no version is accepted yet. Apply the proposed policy to past Actions, judge the Ask and Deny groups, then adopt it.`,
    continueInitialSetup: 'Continue initial policy setup',
    adoptionPreview: 'Adoption preview',
    loadingAdoptionReview: 'Checking the adoption review',
    adoptionReviewLoadFailed: 'Could not load the adoption review',
    noAdoptionReview:
      'No initial adoption review yet. Press "Create initial adoption review" on the draft editor to see the proposed policy\'s results here.',
    applyingProposedPolicy: 'Applying the proposed policy to past Actions.',
    openReview: 'Open the review',
    resultsLoadFailed: 'Could not load the results',
    continueAdoptionReview: 'Continue the initial adoption review',
    adoptionTilesHint: (evaluated: number) =>
      `Under the proposed policy, each of the ${plural(evaluated, 'evaluated Action', 'evaluated Actions')} gets one of the Effects below.`,
    acceptedTitle: (versionNumber: number) => `Accepted policy: version #${versionNumber}`,
    acceptedHint:
      'Adoption is a review record. Applying it to the runtime happens outside Authority Diff.',
    viewAccepted: 'View the accepted version',
    continueChangeDraft: (versionNumber: number) => `Continue change draft #${versionNumber}`,
    mapTitle: 'Activity under the accepted policy',
    loadingMap: 'Loading activity',
    mapLoadFailed: 'Could not load activity',
    mapEmptyTitle: 'No completed replay run',
    mapEmptyMessage:
      "The Effect distribution appears here once the accepted version's initial adoption review or a change review replay completes.",
    replayRun: 'Replay Run',
    mapAnalyzabilityTitle: 'Analyzability (by evaluated Action)',
    mapCaption: (actions: number, cells: number) =>
      `${plural(actions, 'evaluated Action', 'evaluated Actions')}, ${plural(cells, 'Capability × Zone cell', 'Capability × Zone cells')}`,
    zone: 'Zone',
    effect: 'Effect',
    action: 'Action',
  },
  conformance: {
    title: 'Conformance',
    loading: 'Loading Conformance Findings',
    loadFailed: 'Could not load Conformance Findings',
    permissionModeTitle: 'Actions by permission mode',
    noPermissionModes: 'This run has no permission mode counts.',
    unguarded: 'Actions that can run without a guard',
    unguardedValue: (unguarded: number, total: number, modes: string) =>
      `${unguarded} / ${total} (${modes})`,
    permissionModeCaption: (count: number) =>
      `${plural(count, 'permission mode', 'permission modes')}; observations without a mode are unknown`,
    permissionMode: 'permission mode',
    action: 'Action',
    findingAction: 'finding Action',
    noObservations: (from: string, to: string) => `No observations from ${from} to ${to}.`,
    noRunTitle: 'No runtime observations compared yet',
    noRunMessage:
      'Findings appear here once a conformance run compares runtime observations with a Policy Version.',
    policyVersion: 'Policy Version',
    replayRun: 'Replay Run',
    noFindingsTitle: 'No findings',
    noFindingsMessage: 'Every Action observed in this run matched the Policy Version.',
    findingsCaption: (count: number) => `${plural(count, 'finding', 'findings')}, times in UTC`,
    kind: 'Kind',
    capability: 'Capability',
    zone: 'Zone',
    program: 'Program',
    first: 'First',
    last: 'Last',
  },
  review: {
    pendingTitle: 'Review',
    title: {
      change: 'Change review',
      adoption: 'Initial adoption review',
    },
    status: {
      computing: 'Computing',
      ready: 'Awaiting decision',
      accepted: 'Accepted',
      rejected: 'Rejected',
      failed: 'Failed',
      withdrawn: 'Withdrawn',
    },
    decision: {
      change: {
        accept: 'Accept policy change',
        reject: 'Reject policy change',
        title: 'Policy change decision',
      },
      adoption: {
        accept: 'Adopt initial policy',
        reject: 'Reject initial policy',
        title: 'Initial policy adoption decision',
      },
    },
    loading: 'Loading the review',
    loadFailed: 'Could not load the review',
    groupsLoadFailed: 'Could not load groups',
    computingChange: 'Applying both versions to past Actions. The screen updates when done.',
    computingAdoption:
      'Applying the proposed policy to past Actions. The screen updates when done.',
    askGroups: 'Ask groups',
    denyGroups: 'Deny groups',
    meta: {
      review: 'Review',
      status: 'Status',
      proposedVersion: 'Proposed version',
      candidateVersion: 'Candidate version',
      noBaseline: 'None (initial adoption)',
    },
    computing: 'computing',
    evaluatedActions: (count: string | number): Emphasized => [
      { em: count },
      count === 1 ? ' action evaluated' : ' actions evaluated',
    ],
    widenedActions: (actions: number, groups: number): Emphasized => [
      { em: actions },
      actions === 1 ? ' widened action, ' : ' widened actions, ',
      { em: groups },
      groups === 1 ? ' widening group' : ' widening groups',
    ],
    narrowedActions: (actions: number, groups: number): Emphasized => [
      { em: actions },
      actions === 1 ? ' narrowed action, ' : ' narrowed actions, ',
      { em: groups },
      groups === 1 ? ' narrowing group' : ' narrowing groups',
    ],
    adoptionEvaluated: (evaluated: number, total: number, excluded: number): Emphasized => [
      { em: evaluated },
      `${evaluated === 1 ? ' action' : ' actions'} evaluated (${total} total, ${excluded} excluded for having no Operation)`,
    ],
    adoptionNotAnalyzable: (count: number, share: string): Emphasized => [
      { em: count },
      `${count === 1 ? ' action' : ' actions'} not analyzable (analyzability none) (${share})`,
    ],
    loadingResults: 'Loading the results',
    resultsLoadFailed: 'Could not load the results',
    adoptionEffectsTitle: 'Effect under the proposed policy',
    adoptionEffectsHint:
      'These are the results of applying the proposed policy to past Actions, not a reconstruction of past runtime approvals.',
    transitionsTitle: 'Effect transitions',
    transitionsCorner: 'Baseline \\ Candidate',
    wideningTitle: (count: number) => `Widening groups (${count})`,
    noWidening: 'No groups widened.',
    narrowingTitle: (count: number) => `Narrowing groups (${count})`,
    severity: 'Severity',
    capability: 'Capability',
    zone: 'Zone',
    effect: 'Effect',
    program: 'Program',
    programs: 'Programs',
    action: 'Action',
    session: 'Session',
    verdict: 'Verdict',
    detail: 'Detail',
    noAdoptionGroups: (effect: string) => `No groups get '${effect}' under this policy.`,
    gateTitle: (isOpen: boolean, blockers: number) =>
      `Gate: ${isOpen ? 'open' : plural(blockers, 'blocker', 'blockers')}`,
    gateOpen: 'No blocker prevents approval.',
    decisionRecord: 'Decision record',
    decisionTerm: 'Decision',
    decidedBy: 'Decided by',
    decidedAt: 'Time',
    reason: 'Reason',
    notRecorded: 'Not recorded',
    adoptionAcceptedHint:
      'Adoption is a review record. Applying it to the runtime settings happens outside Authority Diff.',
    reviewerName: 'Reviewer name',
    decisionFailed: 'Decision failed',
    withdrawnTitle: 'Review withdrawn',
    withdrawnHint:
      'This review closed without a decision and the version returned to draft. Fix the draft, then create a new review.',
    openDraft: 'Open the draft version',
    withdrawTitle: 'Withdraw review',
    withdrawHint:
      'Closes this review without a decision and returns the version to draft. No decision record is kept.',
    withdraw: 'Withdraw review',
    withdrawFailed: 'Withdrawal failed',
    reportTitle: 'Report',
    reportHint: 'Downloads the Evidence Report in Markdown to keep as the basis for the decision.',
    downloadReport: 'Download report',
    downloadFailed: 'Report download failed',
  },
  group: {
    title: 'Group',
    diffTitle: 'Diff Group',
    adoptionTitle: 'Adoption Group',
    loadingDiff: 'Loading the Diff Group',
    diffLoadFailed: 'Could not load the Diff Group',
    diffNotFound: 'Diff Group not found',
    diffNotFoundMessage: (groupKey: string) => `This change review has no group ${groupKey}.`,
    loadingAdoption: 'Loading the Adoption Group',
    adoptionLoadFailed: 'Could not load the Adoption Group',
    adoptionNotFound: 'Adoption Group not found',
    adoptionNotFoundMessage: (groupKey: string) =>
      `This initial adoption review has no group ${groupKey}.`,
    direction: 'Direction',
    capability: 'Capability',
    zone: 'Zone',
    effect: 'Effect',
    program: 'Program',
    actionSession: 'Action / Session',
    notAnalyzable: 'Non-analyzable Actions',
    backPrefix: 'To finish the review, ',
    backToChange: 'return to the change review',
    backToAdoption: 'return to the initial adoption review',
    backSuffix: '.',
    programMixCaption: (distinct: number, shown: number) =>
      `Program mix: ${plural(distinct, 'distinct program', 'distinct programs')}, top ${shown} shown`,
    unrecognized: 'Unrecognized',
    noSamples: 'No samples',
    noReplayRun: 'Samples are unavailable until a replay run is linked.',
    loadingSamples: 'Loading samples',
    samplesLoadFailed: 'Could not load samples',
    samplesExpired: 'The actions may have been deleted after the retention period.',
    samplesTitle: (count: number) => `Samples (${count})`,
    toolInput: 'Tool input (redacted)',
    operationsTitle: (count: number) => `Operations (${count})`,
    baselineDecision: 'Baseline decision',
    candidateDecision: 'Candidate decision',
    proposedDecision: 'Proposed policy decision',
    perOperation: 'Decision per Operation',
    operation: 'Op',
    reversibility: 'Reversibility',
    rationale: 'Rationale',
    technicalDetails: 'Technical details',
  },
  policy: {
    title: 'Policy Version',
    loading: 'Loading the Policy Version',
    loadFailed: 'Could not load the Policy Version',
    status: {
      draft: 'draft',
      in_review: 'in review',
      accepted: 'accepted',
      rejected: 'rejected',
    },
    notJson: 'Not JSON',
    invalidDocument: 'The policy document is not valid',
    document: 'Policy document',
    documentJson: 'Policy document JSON',
    readOnlyHint:
      'Only a draft version can be edited. To change it, create a draft from this version.',
    documentValid: 'The document matches the contract.',
    saving: 'Saving…',
    saveDraft: 'Save draft',
    validating: 'Validating…',
    validate: 'Validate',
    createDraft: 'Create a draft from this version',
    dirtyHint: 'Validation checks the saved document. Save the draft before validating.',
    saveFailed: 'Save failed',
    validateFailed: 'Validation request failed',
    createDraftFailed: 'Draft creation failed',
    version: 'Version',
    contentHash: 'Content hash',
    updatedAt: 'Updated at',
    rulesTitle: (count: number) => `Rules (${count})`,
    noRules: "This document has no Rules. Without Rules, every Operation's Effect is Ask.",
    ruleId: 'Rule ID',
    capability: 'Capability',
    zone: 'Zone',
    reversibility: 'Reversibility',
    analyzability: 'Analyzability',
    effect: 'Effect',
    rationale: 'Rationale',
    mandateException: 'Mandate Exception',
    any: 'Any',
    validationTitle: (isValid: boolean, issues: number) =>
      `Validation: ${isValid ? 'passed' : plural(issues, 'issue', 'issues')}`,
    noIssues:
      'No static issues were found in the saved draft. This is a document check, not a safety judgment.',
    loadingReviewState: 'Checking review status',
    reviewStateLoadFailed: 'Could not load review status',
    createChangeReview: 'Create change review',
    createAdoptionReview: 'Create initial adoption review',
    changeReviewHint:
      'Applies this candidate and the accepted baseline version to past Actions in the same period to find the Effects that differ.',
    adoptionReviewHint:
      'Computes whether each past Action would be Allow, Ask, or Deny under this proposed policy. Past runtime approvals are not reconstructed.',
    reviewInProgress: 'A review of this version is already in progress.',
    openChangeReview: 'Open the change review',
    openAdoptionReview: 'Open the initial adoption review',
    windowStart: 'Start',
    windowEnd: 'End',
    draftOnly: (status: string) =>
      `A review can be created only from a draft version. This version is ${status}.`,
    failed: (action: string) => `${action} failed`,
  },
};

type Shape<T> = T extends string
  ? string
  : T extends (...args: infer A) => infer R
    ? (...args: A) => R
    : { readonly [K in keyof T]: Shape<T[K]> };

/** Every language's catalog has exactly the English catalog's keys and call signatures. */
export type Messages = Shape<typeof en>;
