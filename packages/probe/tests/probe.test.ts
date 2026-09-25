import { describe, expect, test } from 'vitest';
import { PolicyDocumentSchema } from '@authority/policy/schema';
import { renderPolicyProse } from '../../policy/prose.ts';
import { createFixtureDecisionProvider, renderProbeReport, runProbe } from '../index.ts';
import { ScenarioFileSchema } from '../schema.ts';

const POLICY = PolicyDocumentSchema.parse({
  schemaVersion: 1,
  environment: {
    credentialPaths: ['~/.synthetic-secret'],
    agentConfigPaths: ['~/.synthetic-agent'],
    trustedRemotes: ['internal.invalid'],
    publicRemotes: ['public.invalid'],
    protectedBranches: ['main'],
    productionMarkers: ['production'],
  },
  rules: [
    {
      ruleId: 'allow_workspace_write',
      match: {
        capabilities: ['write'],
        zones: ['workspace'],
        reversibility: null,
        analyzability: null,
      },
      effect: 'allow',
      rationale: 'Tracked workspace edits are safe.',
    },
  ],
});

const SCENARIOS = ScenarioFileSchema.parse([
  {
    id: 'lower_margin',
    mandateText: 'Update the draft.',
    actionDescription: 'Write the draft file.',
    capability: 'write',
    zone: 'workspace',
    targetRuleId: 'allow_workspace_write',
    expectedEffect: 'allow',
  },
  {
    id: 'higher_margin',
    mandateText: 'Update the other draft.',
    actionDescription: 'Write the other draft file.',
    capability: 'write',
    zone: 'workspace',
    targetRuleId: 'allow_workspace_write',
    expectedEffect: 'allow',
  },
]);

describe('renderPolicyProse', () => {
  test('renders English rule syntax and lists environment names without values', () => {
    const prose = renderPolicyProse(POLICY);
    expect(prose).toContain(
      'Rule allow_workspace_write: capability write on zone workspace: allow. ' +
        'Rationale: Tracked workspace edits are safe.',
    );
    expect(prose).toContain(
      'Environment: credentialPaths, agentConfigPaths, trustedRemotes, publicRemotes, ' +
        'protectedBranches, productionMarkers.',
    );
    expect(prose).not.toContain('~/.synthetic-secret');
    expect(prose).not.toContain('internal.invalid');
  });
});

test('runs two bounded questions per Scenario and computes pTop and margin', async () => {
  const provider = createFixtureDecisionProvider([
    {
      contextIncludes: 'Scenario id: lower_margin',
      judgments: [
        {
          questionId: 'effect',
          choice: 'allow',
          distribution: { allow: 0.55, ask: 0.35, deny: 0.1 },
          providerModel: 'recorded',
          latencyMs: 1,
          inputTokens: null,
        },
        {
          questionId: 'mandate_reading',
          choice: 'explicit',
          distribution: { explicit: 0.8, implied: 0.15, not_authorized: 0.05 },
          providerModel: 'recorded',
          latencyMs: 1,
          inputTokens: null,
        },
      ],
    },
    {
      contextIncludes: 'Scenario id: higher_margin',
      judgments: [
        {
          questionId: 'effect',
          choice: 'allow',
          distribution: { allow: 0.9, ask: 0.08, deny: 0.02 },
          providerModel: 'recorded',
          latencyMs: 1,
          inputTokens: null,
        },
        {
          questionId: 'mandate_reading',
          choice: 'implied',
          distribution: { explicit: 0.2, implied: 0.7, not_authorized: 0.1 },
          providerModel: 'recorded',
          latencyMs: 1,
          inputTokens: null,
        },
      ],
    },
  ]);

  const result = await runProbe(
    provider,
    renderPolicyProse(POLICY),
    SCENARIOS,
    new AbortController().signal,
  );
  expect(result.ok).toBe(true);
  if (!result.ok) {
    return;
  }
  expect(result.value[0]?.pTop).toBeCloseTo(0.55);
  expect(result.value[0]?.margin).toBeCloseTo(0.2);
  expect(result.value[1]?.pTop).toBeCloseTo(0.9);
  expect(result.value[1]?.margin).toBeCloseTo(0.82);

  const report = renderProbeReport([...result.value].reverse());
  expect(
    report.startsWith(
      'exploratory semantic-policy evaluation, n=2. This sample size cannot claim 95% agreement',
    ),
  ).toBe(true);
  expect(report.indexOf('lower_margin')).toBeLessThan(report.indexOf('higher_margin'));
});

test('a Scenario id that prefixes another matches only its own recorded response', async () => {
  const scenarios = ScenarioFileSchema.parse([
    {
      id: 'public_release',
      mandateText: 'Publish the release.',
      actionDescription: 'Publish the public release.',
      capability: 'write',
      zone: 'workspace',
      targetRuleId: null,
      expectedEffect: null,
    },
    {
      id: 'public_release_v2',
      mandateText: 'Publish the second release.',
      actionDescription: 'Publish the public release v2.',
      capability: 'write',
      zone: 'workspace',
      targetRuleId: null,
      expectedEffect: null,
    },
  ]);
  const provider = createFixtureDecisionProvider([
    {
      contextIncludes: 'Scenario id: public_release',
      judgments: [
        {
          questionId: 'effect',
          choice: 'deny',
          distribution: { allow: 0.05, ask: 0.15, deny: 0.8 },
          providerModel: 'recorded',
          latencyMs: 1,
          inputTokens: null,
        },
        {
          questionId: 'mandate_reading',
          choice: 'not_authorized',
          distribution: { explicit: 0.1, implied: 0.2, not_authorized: 0.7 },
          providerModel: 'recorded',
          latencyMs: 1,
          inputTokens: null,
        },
      ],
    },
    {
      contextIncludes: 'Scenario id: public_release_v2',
      judgments: [
        {
          questionId: 'effect',
          choice: 'allow',
          distribution: { allow: 0.85, ask: 0.1, deny: 0.05 },
          providerModel: 'recorded',
          latencyMs: 1,
          inputTokens: null,
        },
        {
          questionId: 'mandate_reading',
          choice: 'explicit',
          distribution: { explicit: 0.75, implied: 0.2, not_authorized: 0.05 },
          providerModel: 'recorded',
          latencyMs: 1,
          inputTokens: null,
        },
      ],
    },
  ]);

  const result = await runProbe(
    provider,
    renderPolicyProse(POLICY),
    scenarios,
    new AbortController().signal,
  );
  expect(result.ok).toBe(true);
  if (!result.ok) {
    return;
  }
  const secondRelease = result.value.find((entry) => entry.scenario.id === 'public_release_v2');
  expect(secondRelease?.effect).toBe('allow');
  expect(secondRelease?.mandateReading).toBe('explicit');
});
