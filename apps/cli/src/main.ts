import { runHook } from './commands/hook.command.ts';
import { runImport } from './commands/import.command.ts';
import { runInstallHooks } from './commands/install-hooks.command.ts';
import { runProbeCommand } from './commands/probe.command.ts';
import { runSpoolFlush } from './commands/spool-flush.command.ts';
import { writeStderr } from './output.ts';

function runAsync(task: Promise<void>): void {
  task.catch((error: unknown) => {
    writeStderr(String(error));
    process.exit(1);
  });
}

function parseInstallHooksArgs(args: readonly string[]): {
  readonly printOnly: boolean;
  readonly commandOverride?: string;
} {
  const printOnly = args.includes('--print');
  const commandIndex = args.indexOf('--command');
  if (commandIndex === -1) {
    return { printOnly };
  }
  const commandOverride = args[commandIndex + 1];
  if (commandOverride === undefined || commandOverride.length === 0) {
    process.exit(1);
  }
  return { printOnly, commandOverride };
}

const args = process.argv.slice(2);

if (args[0] === 'hook' && args[1] === 'permission-request') {
  runHook('permission_request');
} else if (args[0] === 'hook' && args[1] === 'pre-tool-use') {
  runHook('pre_tool_use');
} else if (args[0] === 'hook' && args[1] === 'session-end') {
  runHook('session_end');
} else if (args[0] === 'install-hooks') {
  const installArgs = parseInstallHooksArgs(args.slice(1));
  runInstallHooks(installArgs);
} else if (args[0] === 'probe') {
  runAsync(runProbeCommand(args.slice(1)));
} else if (args[0] === 'import') {
  const dir = args[1];
  if (dir === undefined || dir.length === 0) {
    process.exit(1);
  }
  runAsync(runImport(dir));
} else if (args[0] === 'spool-flush') {
  runAsync(runSpoolFlush());
} else {
  process.exit(1);
}
