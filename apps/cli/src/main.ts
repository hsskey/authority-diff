import { runHook } from './commands/hook.command.ts';
import { runInstallHooks } from './commands/install-hooks.command.ts';

const args = process.argv.slice(2);

if (args[0] === 'hook' && args[1] === 'permission-request') {
  runHook('permission_request');
} else if (args[0] === 'hook' && args[1] === 'session-end') {
  runHook('session_end');
} else if (args[0] === 'install-hooks') {
  runInstallHooks({ printOnly: args.includes('--print') });
} else {
  process.exit(1);
}
