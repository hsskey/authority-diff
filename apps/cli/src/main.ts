import { runHook } from './commands/hook.command.ts';
import { runInstallHooks } from './commands/install-hooks.command.ts';

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
} else if (args[0] === 'hook' && args[1] === 'session-end') {
  runHook('session_end');
} else if (args[0] === 'install-hooks') {
  const installArgs = parseInstallHooksArgs(args.slice(1));
  runInstallHooks(installArgs);
} else if (args[0] === 'probe') {
  void import('./commands/probe.command.ts').then(({ runProbeCommand }) =>
    runProbeCommand(args.slice(1)),
  );
} else {
  process.exit(1);
}
