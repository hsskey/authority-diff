/**
 * Tools that change no external state and only steer the agent's own progress.
 *
 * Each name is included only with official-documentation evidence recorded in
 * `docs/evidence/control-tools.md`. `Agent` is excluded until it is confirmed
 * that a subagent's own tool calls are recorded separately; an observed name is
 * never sufficient on its own. A ToolCall with one of these names yields zero
 * Operations (and is excluded from evaluation).
 */
export const CONTROL_TOOL_NAMES: readonly string[] = [
  'AskUserQuestion',
  'ScheduleWakeup',
  'Skill',
  'TaskOutput',
  'TaskStop',
  'ToolSearch',
];

const CONTROL_SET: ReadonlySet<string> = new Set(CONTROL_TOOL_NAMES);

export function isControlTool(name: string): boolean {
  return CONTROL_SET.has(name);
}
