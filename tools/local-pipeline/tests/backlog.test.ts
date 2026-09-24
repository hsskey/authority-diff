import { describe, expect, test } from 'vitest';
import { IsoTimestampSchema } from '@authority/kernel';
import type { Analyzability, Operation, Target } from '@authority/action/schema';
import type { ActionForReplay } from '@authority/trace/schema';
import { CANDIDATES, computeBacklog } from '../lib/backlog.ts';

const UNKNOWN: Target = { kind: 'unknown' };
const PATH: Target = { kind: 'path', path: '/w/a', isInsideWorkspace: true };

function op(
  fragment: string,
  program: string | null,
  signals: readonly string[],
  analyzability: Analyzability = 'none',
  target: Target = UNKNOWN,
): Operation {
  return {
    index: 0,
    capability: 'execute',
    target,
    analyzability,
    program,
    fragment,
    signals: [...signals],
  };
}

function action(actionKey: string, operations: Operation[]): ActionForReplay {
  return {
    actionKey,
    sessionExternalId: 'synthetic-session',
    operations,
    observedOutcome: 'executed',
    occurredAt: IsoTimestampSchema.parse('2026-01-02T03:04:05.000Z'),
  };
}

describe('computeBacklog', () => {
  test('counts a signal as sole cause only when every none Operation of the Action carries it', () => {
    const backlog = computeBacklog([
      action('a1', [op('tool-a', 'tool-a', ['program_unrecognized'])]),
      action('a2', [
        op('tool-b', 'tool-b', ['program_unrecognized']),
        op('python3 -c x', 'python3', ['inline_code']),
      ]),
    ]);

    expect(backlog.noneSignals).toEqual([
      { key: 'program_unrecognized', noneOperations: 2, noneActions: 2, soleActions: 1 },
      { key: 'inline_code', noneOperations: 1, noneActions: 1, soleActions: 0 },
    ]);
  });

  test('ranks unrecognized programs by the Actions that recognizing each alone takes out of none', () => {
    const backlog = computeBacklog([
      action('a1', [op('tool-a', 'tool-a', ['program_unrecognized'])]),
      action('a2', [
        op('tool-b', 'tool-b', ['program_unrecognized']),
        op('tool-b x', 'tool-b', ['program_unrecognized']),
      ]),
      action('a3', [
        op('tool-b', 'tool-b', ['program_unrecognized']),
        op('python3 -c x', 'python3', ['inline_code']),
      ]),
    ]);

    expect(backlog.unrecognizedPrograms).toEqual([
      { key: 'tool-b', noneOperations: 3, noneActions: 2, soleActions: 1 },
      { key: 'tool-a', noneOperations: 1, noneActions: 1, soleActions: 1 },
    ]);
  });

  test('lists every unrecognized harness tool apart from unrecognized programs', () => {
    const backlog = computeBacklog([
      action('a1', [op('{}', 'ToolA', ['tool_unrecognized'])]),
      action('a2', [
        op('{}', 'ToolB', ['tool_unrecognized']),
        op('tool-c', 'tool-c', ['program_unrecognized']),
      ]),
    ]);

    expect(backlog.harnessTools).toEqual([
      { key: 'ToolA', noneOperations: 1, noneActions: 1, soleActions: 1 },
      { key: 'ToolB', noneOperations: 1, noneActions: 1, soleActions: 0 },
    ]);
  });

  test('splits each target kind by analyzability', () => {
    const backlog = computeBacklog([
      action('a1', [op('ls', 'ls', [], 'full', PATH), op('x', 'x', ['program_unrecognized'])]),
    ]);

    expect(backlog.targetKinds).toEqual([
      { key: 'path', operations: 1, full: 1, partial: 0, none: 0 },
      { key: 'unknown', operations: 1, full: 0, partial: 0, none: 1 },
    ]);
  });

  test('credits a candidate with an Action only when it matches every none Operation', () => {
    const backlog = computeBacklog([
      action('a1', [op('bash tests/run.sh', 'bash', ['inline_code'])]),
      action('a2', [
        op('bash tests/run.sh', 'bash', ['inline_code']),
        op('python3 -c x', 'python3', ['inline_code']),
      ]),
    ]);

    expect(backlog.candidates.find((row) => row.key === 'shell_script_file')).toEqual({
      key: 'shell_script_file',
      matchedOperations: 2,
      noneOperations: 2,
      noneActions: 2,
      gainActions: 1,
    });
  });
});

describe('CANDIDATES', () => {
  test.each([
    ['command -v node', 'node', [], 'command_lookup'],
    ['bash tests/run.sh --fast', 'bash', ['inline_code'], 'shell_script_file'],
    ['bash -c "echo hi"', 'bash', ['inline_code'], null],
    ['bash -s arg', 'bash', ['inline_code'], null],
    ['bash <<EOF', 'bash', ['inline_code'], null],
    ['bash --version', 'bash', ['inline_code'], null],
    ['bash tests/run.sh > out.log', 'bash', ['redirect'], null],
    ['bin/deploy.sh --dry', 'deploy.sh', ['program_unrecognized'], 'path_command_name'],
    ['~/bin/tool run', 'tool', ['program_unrecognized'], 'path_command_name'],
    ['tool run', 'tool', ['program_unrecognized'], null],
    ['"$DIR/tool" run', 'tool', ['program_unrecognized'], 'variable_path_command_name'],
    ['$G api user', '', ['program_unrecognized'], 'variable_command_name'],
  ] as const)('%s matches %s', (fragment, program, signals, expected) => {
    const operation = op(fragment, program, signals);

    const matched = CANDIDATES.filter((candidate) => candidate.matches(operation)).map(
      (candidate) => candidate.key,
    );

    expect(matched).toEqual(expected === null ? [] : [expected]);
  });
});
