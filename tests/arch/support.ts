import { expect } from 'vitest';
import {
  projectFiles,
  EmptyTestViolation,
  ViolatingFileDependency,
  ViolatingCycle,
  ViolatingNode,
  CustomFileViolation,
} from 'archunit';
import type { Checkable, Violation } from 'archunit';

// Architecture rules are executed by archunit against this tsconfig. It spans the
// real packages/apps/tools plus the pass/fail fixtures used to prove each rule.
export const ARCH_TSCONFIG = 'tsconfig.arch.json';

export const project = (): ReturnType<typeof projectFiles> => projectFiles(ARCH_TSCONFIG);

type ViolationKind = 'dependency' | 'cycle' | 'naming' | 'custom';

function isRealMatch(violation: Violation, kind: ViolationKind): boolean {
  switch (kind) {
    case 'dependency':
      return violation instanceof ViolatingFileDependency;
    case 'cycle':
      return violation instanceof ViolatingCycle;
    case 'naming':
      return violation instanceof ViolatingNode;
    case 'custom':
      return violation instanceof CustomFileViolation;
  }
}

// A clean rule returns no violations. archunit reports an EmptyTestViolation when a
// rule matched zero files, so an empty result also proves the rule bound to real
// files (request: "zero matched files must not prove architecture safety").
export async function passes(rule: Checkable): Promise<void> {
  const violations = await rule.check();
  expect(violations, 'expected the rule to hold and to match at least one file').toEqual([]);
}

// The real repository tree must contain no architecture violations. Rules whose
// subject or forbidden target does not exist yet (future packages) are tolerated
// here via allowEmptyTests - their firing is proven separately by fixtures - but any
// real violation still fails.
export async function noRealViolations(rule: Checkable): Promise<void> {
  const violations = await rule.check({ allowEmptyTests: true });
  const real = violations.filter((violation) => !(violation instanceof EmptyTestViolation));
  expect(real, 'real tree must have no architecture violations').toEqual([]);
}

// A violating fixture must fail for the intended reason: at least one violation of the
// expected kind, and never a bare EmptyTestViolation (which would be a vacuous pass).
export async function fires(rule: Checkable, kind: ViolationKind): Promise<void> {
  const violations = await rule.check();
  expect(
    violations.some((violation) => violation instanceof EmptyTestViolation),
    'rule matched zero files (vacuous) instead of firing',
  ).toBe(false);
  expect(
    violations.some((violation) => isRealMatch(violation, kind)),
    `expected a ${kind} violation to fire`,
  ).toBe(true);
}
