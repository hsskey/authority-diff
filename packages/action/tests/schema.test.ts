import { describe, expect, expectTypeOf, test } from 'vitest';
import {
  CapabilitySchema,
  OperationSchema,
  type ClassifyToolCall,
  type Operation,
  type ToolCall,
} from '../schema.ts';

describe('action schema', () => {
  test('accepts a valid synthetic Operation', () => {
    expect(
      OperationSchema.safeParse({
        index: 0,
        capability: 'write',
        target: {
          kind: 'path',
          path: '~/synthetic-workspace/note.txt',
          isInsideWorkspace: true,
        },
        analyzability: 'full',
        program: null,
        fragment: 'synthetic redacted write',
        signals: [],
      }).success,
    ).toBe(true);
  });

  test('rejects an unknown Capability', () => {
    expect(CapabilitySchema.safeParse('administer').success).toBe(false);
  });

  test('exports the classifier signature', () => {
    expectTypeOf<ClassifyToolCall>().toEqualTypeOf<(call: ToolCall) => readonly Operation[]>();
  });
});
