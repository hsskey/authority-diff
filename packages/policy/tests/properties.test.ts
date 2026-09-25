import { describe, expect, test } from 'vitest';
import fc from 'fast-check';
import type { Analyzability, Capability, Operation, Target } from '@authority/action/schema';
import type { Effect } from '@authority/kernel';
import type {
  Decision,
  EnvironmentProfile,
  PolicyDocumentV1,
  PolicyDocumentV2,
  Reversibility,
  Zone,
} from '../schema.ts';
import { evaluateAction } from '../evaluate.ts';
import { hostTarget, pathTarget, vcsRemoteTarget } from './support/factories.ts';

const CAPABILITIES: readonly Capability[] = [
  'read',
  'write',
  'delete',
  'execute',
  'install',
  'fetch',
  'send',
  'commit',
  'push',
  'rewrite',
  'deploy',
];
const ZONES: readonly Zone[] = [
  'workspace',
  'host',
  'credentials',
  'agent_config',
  'trusted_remote',
  'public_remote',
  'unknown_remote',
  'protected',
];
const REVERSIBILITIES: readonly Reversibility[] = ['reversible', 'recoverable', 'irreversible'];
const ANALYZABILITIES: readonly Analyzability[] = ['full', 'partial', 'none'];
const EFFECTS: readonly Effect[] = ['allow', 'ask', 'deny'];
const EFFECT_RANK: Record<Effect, number> = { allow: 0, ask: 1, deny: 2 };

const ENV: EnvironmentProfile = {
  credentialPaths: ['~/.secrets/**'],
  agentConfigPaths: ['.claude/**'],
  trustedRemotes: ['trusted.example', 'trusted.example/**'],
  publicRemotes: ['public.example', 'public.example/**'],
  protectedBranches: ['main'],
  productionMarkers: ['\\bproduction\\b'],
};

const TARGETS: readonly Target[] = [
  pathTarget('~/.secrets/token', false),
  pathTarget('.claude/settings.json', true),
  pathTarget('~/ws/file.ts', true),
  pathTarget('/etc/hosts', false),
  vcsRemoteTarget('trusted.example/owner/repo', 'main'),
  vcsRemoteTarget('public.example/owner/repo', null),
  vcsRemoteTarget('other.example/owner/repo', null),
  hostTarget('trusted.example'),
  hostTarget('other.example'),
  { kind: 'deploy_target', label: 'prod' },
  { kind: 'unknown' },
];

const arbOperation: fc.Arbitrary<Operation> = fc.record({
  index: fc.nat({ max: 20 }),
  capability: fc.constantFrom(...CAPABILITIES),
  target: fc.constantFrom(...TARGETS),
  analyzability: fc.constantFrom(...ANALYZABILITIES),
  program: fc.constant<string | null>(null),
  fragment: fc.constantFrom<string>('', 'deploy to production cluster', 'ordinary fragment'),
  signals: fc.constant<string[]>([]),
});

const arbOperations = fc.array(arbOperation, { minLength: 1, maxLength: 4 });

const arbMatch = fc.record({
  capabilities: fc.oneof(
    fc.constant<'*'>('*'),
    fc.uniqueArray(fc.constantFrom(...CAPABILITIES), { minLength: 1 }),
  ),
  zones: fc.oneof(
    fc.constant<'*'>('*'),
    fc.uniqueArray(fc.constantFrom(...ZONES), { minLength: 1 }),
  ),
  reversibility: fc.oneof(
    fc.constant(null),
    fc.uniqueArray(fc.constantFrom(...REVERSIBILITIES), { minLength: 1 }),
  ),
  analyzability: fc.oneof(
    fc.constant(null),
    fc.uniqueArray(fc.constantFrom(...ANALYZABILITIES), { minLength: 1 }),
  ),
});

const arbRuleCore = fc.record({ match: arbMatch, effect: fc.constantFrom(...EFFECTS) });

const arbDocument = fc.array(arbRuleCore, { maxLength: 6 }).map((cores): PolicyDocumentV1 => ({
  schemaVersion: 1,
  environment: ENV,
  rules: cores.map((core, index) => ({
    ruleId: `rule_${index}`,
    match: core.match,
    effect: core.effect,
    rationale: 'synthetic property test rule rationale',
  })),
}));

// Every ask Rule may carry a Mandate Exception; other Effects cannot.
const arbDocumentV2 = arbDocument.chain((document) =>
  fc
    .array(fc.boolean(), { minLength: document.rules.length, maxLength: document.rules.length })
    .map((flags): PolicyDocumentV2 => ({
      schemaVersion: 2,
      environment: document.environment,
      rules: document.rules.map((rule, index) => ({
        ...rule,
        mandateException:
          rule.effect === 'ask' && flags[index] === true
            ? { clause: 'the Mandate explicitly names this synthetic act' }
            : null,
      })),
    })),
);

function withoutMandateExceptions(document: PolicyDocumentV2): PolicyDocumentV1 {
  return {
    schemaVersion: 1,
    environment: document.environment,
    rules: document.rules.map(({ mandateException: _mandateException, ...rule }) => rule),
  };
}

function withoutMandateDependence(decision: Decision | null): unknown {
  if (decision === null) {
    return null;
  }
  const { isMandateDependent: _isMandateDependent, operations, ...rest } = decision;
  return {
    ...rest,
    operations: operations.map(
      ({ isMandateDependent: _operationIsMandateDependent, ...operation }) => operation,
    ),
  };
}

function rank(effect: Effect): number {
  return EFFECT_RANK[effect];
}

describe('I1: Decision is independent of Rule order', () => {
  test('any permutation of the Rules yields the same Decision', () => {
    const arbDocumentWithPermutation = arbDocument.chain((document) =>
      fc.tuple(
        fc.constant(document),
        fc
          .array(fc.double({ min: 0, max: 1, noNaN: true }), {
            minLength: document.rules.length,
            maxLength: document.rules.length,
          })
          .map((keys) =>
            document.rules
              .map((rule, index) => ({ rule, key: keys[index] ?? 0 }))
              .sort((left, right) => left.key - right.key)
              .map((entry) => entry.rule),
          ),
      ),
    );

    fc.assert(
      fc.property(arbDocumentWithPermutation, arbOperations, ([document, permuted], operations) => {
        const reordered: PolicyDocumentV1 = { ...document, rules: permuted };
        expect(evaluateAction(operations, reordered)).toEqual(evaluateAction(operations, document));
      }),
    );
  });
});

describe('I2: added Rules move restrictiveness monotonically', () => {
  test('adding an ask or deny Rule never makes an Action less restrictive', () => {
    fc.assert(
      fc.property(
        arbDocument,
        arbOperations,
        arbMatch,
        fc.constantFrom<Effect>('ask', 'deny'),
        (document, operations, match, effect) => {
          const extended: PolicyDocumentV1 = {
            ...document,
            rules: [
              ...document.rules,
              {
                ruleId: 'rule_added',
                match,
                effect,
                rationale: 'synthetic added restrictive rule',
              },
            ],
          };
          const base = evaluateAction(operations, document);
          const withAdded = evaluateAction(operations, extended);
          if (base === null || withAdded === null) {
            throw new Error('a non-empty Action always yields a Decision');
          }
          expect(rank(withAdded.effect)).toBeGreaterThanOrEqual(rank(base.effect));
        },
      ),
    );
  });

  test('adding an allow Rule never makes an Action more restrictive', () => {
    fc.assert(
      fc.property(arbDocument, arbOperations, arbMatch, (document, operations, match) => {
        const extended: PolicyDocumentV1 = {
          ...document,
          rules: [
            ...document.rules,
            {
              ruleId: 'rule_added',
              match,
              effect: 'allow',
              rationale: 'synthetic added permissive rule',
            },
          ],
        };
        const base = evaluateAction(operations, document);
        const withAdded = evaluateAction(operations, extended);
        if (base === null || withAdded === null) {
          throw new Error('a non-empty Action always yields a Decision');
        }
        expect(rank(withAdded.effect)).toBeLessThanOrEqual(rank(base.effect));
      }),
    );
  });
});

describe('I3: the Action Effect is the most restrictive Operation Effect', () => {
  test('the Action Effect equals the maximum Operation Effect', () => {
    fc.assert(
      fc.property(arbDocument, arbOperations, (document, operations) => {
        const decision = evaluateAction(operations, document);
        if (decision === null) {
          throw new Error('a non-empty Action always yields a Decision');
        }
        const operationEffects = operations.map((operation) => {
          const single = evaluateAction([operation], document);
          if (single === null) {
            throw new Error('a single Operation always yields a Decision');
          }
          return single.effect;
        });
        const expected = operationEffects.reduce<Effect>(
          (worst, effect) => (rank(effect) > rank(worst) ? effect : worst),
          'allow',
        );
        expect(decision.effect).toBe(expected);
      }),
    );
  });
});

describe('I4: a Mandate Exception changes nothing but isMandateDependent', () => {
  test('a document with Mandate Exceptions decides like the same Rules without them', () => {
    fc.assert(
      fc.property(arbDocumentV2, arbOperations, (document, operations) => {
        expect(withoutMandateDependence(evaluateAction(operations, document))).toEqual(
          withoutMandateDependence(evaluateAction(operations, withoutMandateExceptions(document))),
        );
      }),
    );
  });

  test('a schemaVersion 1 document never yields a Mandate-dependent Decision', () => {
    fc.assert(
      fc.property(arbDocument, arbOperations, (document, operations) => {
        expect(evaluateAction(operations, document)?.isMandateDependent).toBe(false);
      }),
    );
  });
});
