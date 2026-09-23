import { describe, expect, test } from 'vitest';
import { z } from 'zod';
import { ActionForReplaySchema } from '@authority/trace/schema';
import { PolicyDocumentSchema } from '@authority/policy/schema';
import { computeDiff } from '../diff.ts';
import actionFixture from '../../../tests/fixtures/action-for-replay.json' with { type: 'json' };
import baselineFixture from '../../../tests/fixtures/baseline-policy.json' with { type: 'json' };
import candidateFixture from '../../../tests/fixtures/candidate-policy.json' with { type: 'json' };

const actions = z.array(ActionForReplaySchema).parse(actionFixture);
const baseline = PolicyDocumentSchema.parse(baselineFixture);
const candidate = PolicyDocumentSchema.parse(candidateFixture);

describe('computeDiff integration (shared synthetic fixtures)', () => {
  test('produces one critical widening push group with the expected stats', () => {
    const result = computeDiff({ actions, baseline, candidate });

    expect(result.groups).toHaveLength(1);
    const group = result.groups[0];
    if (group === undefined) {
      throw new Error('expected one group');
    }
    expect({
      direction: group.direction,
      capability: group.capability,
      fromZone: group.fromZone,
      toZone: group.toZone,
      fromEffect: group.fromEffect,
      toEffect: group.toEffect,
      severity: group.severity,
    }).toEqual({
      direction: 'widening',
      capability: 'push',
      fromZone: 'unknown_remote',
      toZone: 'trusted_remote',
      fromEffect: 'ask',
      toEffect: 'allow',
      severity: 'critical',
    });
    expect(result.changedActions).toHaveLength(1);
    expect([result.stats.evaluatedActions, result.stats.excludedActions]).toEqual([3, 0]);
  });

  test('resultHash is identical across two runs', () => {
    const first = computeDiff({ actions, baseline, candidate });
    const second = computeDiff({ actions, baseline, candidate });
    expect(second.resultHash).toBe(first.resultHash);
  });

  test('headline is plain Korean with no ruleId, raw command, or regex', () => {
    const result = computeDiff({ actions, baseline, candidate });
    const group = result.groups[0];
    if (group === undefined) {
      throw new Error('expected one group');
    }
    expect(group.headline).toBe(
      'example.invalid/synthetic/project 1곳으로의 push 1건이 ' +
        "'확인 필요'에서 '허용'으로 바뀝니다. " +
        '기준 정책에서는 신뢰 목록에 없는 원격이었고 변경안에서는 신뢰하는 원격으로 분류됩니다.',
    );
    expect(group.headline.includes('push_policy')).toBe(false);
  });
});
