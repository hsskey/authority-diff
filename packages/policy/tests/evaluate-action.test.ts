import { describe, expect, test } from 'vitest';
import type { Effect } from '@authority/kernel';
import type { Operation } from '@authority/action/schema';
import { DEFAULT_POLICY_DOCUMENT, createEvaluator, evaluateAction } from '../evaluate.ts';
import { hostTarget, makeOperation, pathTarget, vcsRemoteTarget } from './support/factories.ts';

// One example Operation decided by each Rule of the default template.
const RULE_EXAMPLES: ReadonlyArray<readonly [string, Operation, Effect]> = [
  [
    'deny_credentials_access',
    makeOperation({ capability: 'read', target: pathTarget('~/.ssh/id_rsa', false) }),
    'deny',
  ],
  [
    'deny_shared_history_rewrite',
    makeOperation({
      capability: 'rewrite',
      target: vcsRemoteTarget('other.example.com/o/r', null),
    }),
    'deny',
  ],
  [
    'ask_agent_config_change',
    makeOperation({ capability: 'write', target: pathTarget('~/.claude/settings.json', false) }),
    'ask',
  ],
  [
    'ask_irreversible_local',
    makeOperation({ capability: 'delete', target: pathTarget('/tmp/scratch', false) }),
    'ask',
  ],
  [
    'ask_unanalyzable',
    makeOperation({ capability: 'execute', target: { kind: 'unknown' }, analyzability: 'none' }),
    'ask',
  ],
  [
    'ask_external_disclosure',
    makeOperation({ capability: 'send', target: hostTarget('github.com') }),
    'ask',
  ],
  [
    'ask_production_deploy',
    makeOperation({
      capability: 'deploy',
      target: { kind: 'deploy_target', label: 'prod' },
      fragment: 'helm upgrade production release',
    }),
    'ask',
  ],
  [
    'allow_workspace_edit',
    makeOperation({ capability: 'write', target: pathTarget('~/ws/file.ts', true) }),
    'allow',
  ],
  [
    'allow_workspace_execute',
    makeOperation({
      capability: 'execute',
      target: pathTarget('~/ws/run.sh', true),
      analyzability: 'partial',
    }),
    'allow',
  ],
  [
    'allow_trusted_fetch',
    makeOperation({ capability: 'fetch', target: hostTarget('registry.internal') }),
    'allow',
  ],
];

describe('default template rule coverage', () => {
  test.each(RULE_EXAMPLES)('%s decides its example Operation', (ruleId, operation, effect) => {
    const decision = evaluateAction([operation], DEFAULT_POLICY_DOCUMENT);
    expect(decision?.operations[0]?.effect).toBe(effect);
    expect(decision?.operations[0]?.matchedRuleIds).toContain(ruleId);
  });

  test('an uncovered combination (read in host) falls back to the default ask', () => {
    const decision = evaluateAction(
      [makeOperation({ capability: 'read', target: pathTarget('/etc/motd', false) })],
      DEFAULT_POLICY_DOCUMENT,
    );
    expect(decision?.operations[0]?.effect).toBe('ask');
    expect(decision?.operations[0]?.matchedRuleIds).toEqual([]);
    expect(decision?.operations[0]?.decidingRuleId).toBeNull();
  });
});

describe('evaluateAction', () => {
  test('an empty Operation list yields null', () => {
    expect(evaluateAction([], DEFAULT_POLICY_DOCUMENT)).toBeNull();
  });

  test('the Action Effect is the most restrictive Operation Effect', () => {
    const decision = evaluateAction(
      [
        makeOperation({ index: 1, capability: 'write', target: pathTarget('~/ws/a.ts', true) }), // allow
        makeOperation({ index: 3, capability: 'read', target: pathTarget('~/.ssh/id_rsa', false) }), // deny
        makeOperation({ index: 7, capability: 'read', target: pathTarget('~/.aws/creds', false) }), // deny
      ],
      DEFAULT_POLICY_DOCUMENT,
    );
    expect(decision?.effect).toBe('deny');
    // The smallest index among Operations carrying the Action Effect.
    expect(decision?.decidingOperationIndex).toBe(3);
  });

  test('matchedRuleIds are sorted and decidingRuleId is the first of the Effect', () => {
    // A protected deploy matches ask_irreversible_local and ask_production_deploy.
    const decision = evaluateAction(
      [
        makeOperation({
          capability: 'deploy',
          target: { kind: 'deploy_target', label: 'prod' },
          fragment: 'terraform apply production',
        }),
      ],
      DEFAULT_POLICY_DOCUMENT,
    );
    expect(decision?.operations[0]?.matchedRuleIds).toEqual([
      'ask_irreversible_local',
      'ask_production_deploy',
    ]);
    expect(decision?.operations[0]?.decidingRuleId).toBe('ask_irreversible_local');
    expect(decision?.effect).toBe('ask');
  });
});

describe('default template environment resolution', () => {
  test('an agent config path under any directory resolves to agent_config and asks', () => {
    const decision = evaluateAction(
      [
        makeOperation({
          capability: 'write',
          target: pathTarget('~/proj/.claude/settings.json', true),
        }),
      ],
      DEFAULT_POLICY_DOCUMENT,
    );
    expect(decision?.operations[0]?.zone).toBe('agent_config');
    expect(decision?.operations[0]?.effect).toBe('ask');
  });

  test('an .mcp.json under any directory resolves to agent_config and asks', () => {
    const decision = evaluateAction(
      [makeOperation({ capability: 'write', target: pathTarget('~/proj/.mcp.json', true) })],
      DEFAULT_POLICY_DOCUMENT,
    );
    expect(decision?.operations[0]?.zone).toBe('agent_config');
    expect(decision?.operations[0]?.effect).toBe('ask');
  });

  test('installing from the npm registry resolves to trusted_remote and is allowed', () => {
    const decision = evaluateAction(
      [
        makeOperation({
          capability: 'install',
          target: { kind: 'package', ecosystem: 'npm', source: 'registry.npmjs.org' },
        }),
      ],
      DEFAULT_POLICY_DOCUMENT,
    );
    expect(decision?.operations[0]?.zone).toBe('trusted_remote');
    expect(decision?.operations[0]?.effect).toBe('allow');
    expect(decision?.operations[0]?.matchedRuleIds).toContain('allow_trusted_fetch');
  });
});

describe('createEvaluator', () => {
  test('compiles once and evaluates independent Actions', () => {
    const evaluate = createEvaluator(DEFAULT_POLICY_DOCUMENT);
    const denied = evaluate([
      makeOperation({ capability: 'read', target: pathTarget('~/.ssh/id_rsa', false) }),
    ]);
    const allowed = evaluate([
      makeOperation({ capability: 'write', target: pathTarget('~/ws/file.ts', true) }),
    ]);
    expect(denied?.effect).toBe('deny');
    expect(allowed?.effect).toBe('allow');
  });
});
