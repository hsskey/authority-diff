/**
 * Public entry point for the ToolCall classifier.
 *
 * `createClassifier` loads the shell grammar WASM once and returns a synchronous
 * {@link ClassifyToolCall}. The classifier is pure and deterministic: the same
 * ToolCall always yields the same Operations, and it never throws.
 */
import type { ClassifyToolCall } from './schema.ts';
import { classifyToolCall } from './lib/domain/classify.ts';
import { CONTROL_TOOL_NAMES } from './lib/domain/control-tools.ts';
import { loadBashParser } from './lib/shell/parser.ts';

/** Bumped whenever the classification rules change. */
export const CLASSIFIER_VERSION = '0.1.0';

export { CONTROL_TOOL_NAMES };

/**
 * Loads the WASM grammar and returns a synchronous classifier. Call once per
 * process and reuse the returned function for every ToolCall.
 */
export async function createClassifier(): Promise<ClassifyToolCall> {
  const parser = await loadBashParser();
  return (call) => classifyToolCall(call, parser);
}
