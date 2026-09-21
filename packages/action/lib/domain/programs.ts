/**
 * Classifies a normalized simple command (other than `git` and `gh`) into
 * Operations.
 *
 * The recognition table is driven by capability sets (docs/design.md 13.2)
 * ordered by observed program frequency. An unrecognized program is opaque
 * execution (`execute` + unknown + `none`), never a false `read`; an interpreter
 * given inline code or a heredoc is also `execute` + `none`, with credential and
 * URL literals in the body surfaced as `read`/`send`.
 */
import type { Analyzability, Capability, Target } from '../../schema.ts';
import type { ShellWord } from '../shell/ast.ts';
import { hasFlag, nonFlagArgs, type NormalizedCommand } from './command.ts';
import { draft, type OperationDraft } from './draft.ts';
import { scanInline } from './inline.ts';
import { hostTarget, pathTarget, resolvePath, unknownTarget } from './targets.ts';

type Ecosystem = 'npm' | 'pypi' | 'cargo' | 'go' | 'system' | 'other';

/** Readers whose arguments are file paths. */
const FILE_READERS: ReadonlySet<string> = new Set([
  'cat',
  'tac',
  'nl',
  'head',
  'tail',
  'wc',
  'less',
  'more',
  'ls',
  'dir',
  'vdir',
  'tree',
  'file',
  'stat',
  'du',
  'df',
  'diff',
  'cmp',
  'cut',
  'sort',
  'uniq',
  'tr',
  'column',
  'jq',
  'yq',
  'comm',
  'fold',
  'rev',
  'base64',
  'xxd',
  'od',
  'hexdump',
  'strings',
  'md5sum',
  'sha256sum',
  'sha1sum',
  'cksum',
]);
/** Readers that take no path (or only manipulate strings): read the cwd. */
const NO_FILE_READERS: ReadonlySet<string> = new Set([
  'pwd',
  'which',
  'whereis',
  'type',
  'date',
  'whoami',
  'id',
  'hostname',
  'uname',
  'printenv',
  'seq',
  'sleep',
  'tty',
  'groups',
  'nproc',
  'uptime',
  'ps',
  'echo',
  'printf',
  'true',
  'false',
  ':',
  'test',
  '[',
  'export',
  'set',
  'unset',
  'alias',
  'declare',
  'local',
  'readonly',
  'expr',
  'let',
  'wait',
  'jobs',
  'history',
  'realpath',
  'readlink',
  'dirname',
  'basename',
  'env',
]);
/** POSIX shells invoked without `-c`: opaque execution of stdin or a script. */
const SHELLS: ReadonlySet<string> = new Set(['bash', 'sh', 'dash', 'zsh', 'ksh']);
const PATTERN_FIRST: ReadonlySet<string> = new Set([
  'grep',
  'egrep',
  'fgrep',
  'rg',
  'ag',
  'ack',
  'awk',
  'gawk',
  'mawk',
  'sed',
]);
const WRITERS: ReadonlySet<string> = new Set([
  'mv',
  'cp',
  'tee',
  'touch',
  'mkdir',
  'mkfifo',
  'ln',
  'chmod',
  'chown',
  'chgrp',
  'install',
  'truncate',
  'dd',
  'patch',
  'tar',
  'zip',
  'unzip',
  'gzip',
  'gunzip',
  'bzip2',
]);
const DELETERS: ReadonlySet<string> = new Set(['rm', 'rmdir', 'unlink', 'shred']);
const DEST_LAST: ReadonlySet<string> = new Set(['mv', 'cp', 'ln']);

const INTERPRETERS: ReadonlySet<string> = new Set([
  'python',
  'python3',
  'python2',
  'node',
  'nodejs',
  'ruby',
  'perl',
  'php',
  'deno',
  'bun',
  'rscript',
  'osascript',
  'pwsh',
  'powershell',
  'lua',
  'tclsh',
  'groovy',
]);
const INLINE_FLAGS: ReadonlySet<string> = new Set(['-c', '-e', '-p', '--eval', '--print', '-r']);

const BUILD_RUNNERS: ReadonlySet<string> = new Set([
  'vitest',
  'jest',
  'mocha',
  'ava',
  'tsc',
  'tsx',
  'ts-node',
  'make',
  'pytest',
  'tox',
  'turbo',
  'eslint',
  'oxlint',
  'prettier',
  'oxfmt',
  'ruff',
  'black',
  'mypy',
  'flake8',
  'gofmt',
  'rustfmt',
  'clippy',
  'cmake',
  'gradle',
  'mvn',
  'gulp',
  'grunt',
  'webpack',
  'vite',
  'rollup',
  'esbuild',
  'tsup',
  'biome',
  'just',
  'ninja',
  'bazel',
  'rake',
  'sbt',
]);
const PKG_MANAGERS: ReadonlySet<string> = new Set(['pnpm', 'npm', 'yarn', 'bun']);
const PKG_EXEC: ReadonlySet<string> = new Set(['npx', 'pnpx', 'bunx', 'pnpm-exec']);
const INSTALL_SUBS: ReadonlySet<string> = new Set([
  'add',
  'install',
  'i',
  'ci',
  'remove',
  'uninstall',
  'rm',
  'un',
]);

const INSTALLERS: ReadonlyMap<string, Ecosystem> = new Map([
  ['pip', 'pypi'],
  ['pip3', 'pypi'],
  ['pipx', 'pypi'],
  ['poetry', 'pypi'],
  ['conda', 'system'],
  ['gem', 'other'],
  ['brew', 'system'],
  ['apt', 'system'],
  ['apt-get', 'system'],
  ['yum', 'system'],
  ['dnf', 'system'],
  ['apk', 'system'],
]);

const DEPLOYERS: ReadonlySet<string> = new Set([
  'vercel',
  'netlify',
  'flyctl',
  'fly',
  'pulumi',
  'ansible-playbook',
  'serverless',
  'sam',
  'cdk',
]);

export function classifyProgram(cmd: NormalizedCommand): OperationDraft[] {
  const p = cmd.program;

  if (INTERPRETERS.has(p)) return interpreterOps(cmd);
  if (PKG_EXEC.has(p)) return pkgExecOps(cmd);
  if (PKG_MANAGERS.has(p)) return pkgManagerOps(cmd);
  if (BUILD_RUNNERS.has(p)) return runnerWithSubcommand(cmd);
  if (INSTALLERS.has(p)) return installerOps(cmd, INSTALLERS.get(p) ?? 'other');
  if (p === 'find') return findOps(cmd);
  if (p === 'curl' || p === 'wget' || p === 'http' || p === 'https') return httpOps(cmd);
  if (p === 'scp' || p === 'rsync' || p === 'sftp') return copyOps(cmd);
  if (p === 'ssh' || p === 'nc' || p === 'ncat' || p === 'telnet') return remoteExecOps(cmd);
  if (p === 'docker' || p === 'podman') return dockerOps(cmd);
  if (p === 'kubectl' || p === 'oc') return kubectlOps(cmd);
  if (p === 'terraform' || p === 'tofu') return stateToolOps(cmd, 'apply', 'destroy', 'plan');
  if (p === 'helm') return helmOps(cmd);
  if (DEPLOYERS.has(p)) return [runnerDraft('deploy', cmd, 'partial')];
  if (p === 'wrangler') return wranglerOps(cmd);
  if (p === 'cargo' || p === 'go') return cargoGoOps(cmd);
  if (p === 'source' || p === '.') return [runnerDraft('execute', cmd, 'partial')];
  if (SHELLS.has(p))
    return [draft('execute', unknownTarget(), 'none', p, cmd.raw, ['inline_code'])];
  if (p === 'sed') return sedOps(cmd);
  if (NO_FILE_READERS.has(p)) return [runnerDraft('read', cmd, 'full')];
  if (WRITERS.has(p))
    return fileOps(cmd, 'write', { patternFirst: false, destLast: DEST_LAST.has(p) });
  if (DELETERS.has(p)) return fileOps(cmd, 'delete', { patternFirst: false, destLast: false });
  if (FILE_READERS.has(p) || PATTERN_FIRST.has(p)) {
    return fileOps(cmd, 'read', { patternFirst: PATTERN_FIRST.has(p), destLast: false });
  }
  // Unrecognized program: opaque execution, never a false read.
  return [draft('execute', unknownTarget(), 'none', p, cmd.raw, ['program_unrecognized'])];
}

function interpreterOps(cmd: NormalizedCommand): OperationDraft[] {
  const inlineIdx = cmd.args.findIndex((a) => INLINE_FLAGS.has(a.text));
  const inlineBody = inlineIdx === -1 ? null : (cmd.args[inlineIdx + 1]?.text ?? '');
  const heredoc = cmd.heredocBodies[0] ?? null;
  const body = inlineBody ?? heredoc;
  if (body !== null) return inlineCodeOps(cmd, body);
  // Interpreter running a script file, or a REPL: opaque but bounded execution.
  return [runnerDraft('execute', cmd, 'partial')];
}

/** Inline code to an interpreter: opaque execute plus literal-derived effects. */
function inlineCodeOps(cmd: NormalizedCommand, body: string): OperationDraft[] {
  const ops: OperationDraft[] = [
    draft('execute', unknownTarget(), 'none', cmd.program, cmd.raw, ['inline_code']),
  ];
  const findings = scanInline(body);
  for (const path of findings.credentialPaths) {
    const resolved = resolvePath(path, cmd.cwd, cmd.workspaceRoot);
    ops.push(
      draft('read', pathTarget(resolved), 'partial', cmd.program, cmd.raw, ['inline_credential']),
    );
  }
  for (const url of findings.urls) {
    const target = hostTarget(url);
    ops.push(
      draft('send', target ?? unknownTarget(), 'partial', cmd.program, cmd.raw, ['inline_url']),
    );
  }
  return ops;
}

function pkgManagerOps(cmd: NormalizedCommand): OperationDraft[] {
  const positional = nonFlagArgs(cmd.args);
  const sub = positional[0]?.text ?? '';
  if (sub === 'publish') return [runnerDraft('push', cmd, 'partial')];
  if (sub === 'dlx' || sub === 'create') return pkgExecOps(cmd);
  if (INSTALL_SUBS.has(sub)) {
    const pkg = positional[1];
    return [installDraft(cmd, 'npm', pkg)];
  }
  // run/test/build/exec or a bare script name: bounded workspace execution.
  return [runnerDraft('execute', cmd, 'partial')];
}

function pkgExecOps(cmd: NormalizedCommand): OperationDraft[] {
  const positional = nonFlagArgs(cmd.args);
  const pkg = positional.find((w) => w.text !== 'dlx' && w.text !== 'create');
  return [installDraft(cmd, 'npm', pkg), runnerDraft('execute', cmd, 'partial')];
}

function runnerWithSubcommand(cmd: NormalizedCommand): OperationDraft[] {
  return [runnerDraft('execute', cmd, 'partial')];
}

function cargoGoOps(cmd: NormalizedCommand): OperationDraft[] {
  const sub = nonFlagArgs(cmd.args)[0]?.text ?? '';
  if (sub === 'install')
    return [installDraft(cmd, cmd.program === 'go' ? 'go' : 'cargo', nonFlagArgs(cmd.args)[1])];
  if (sub === 'publish') return [runnerDraft('push', cmd, 'partial')];
  return [runnerDraft('execute', cmd, 'partial')];
}

function installerOps(cmd: NormalizedCommand, ecosystem: Ecosystem): OperationDraft[] {
  const positional = nonFlagArgs(cmd.args);
  const sub = positional[0]?.text ?? '';
  if (sub !== 'install' && sub !== 'add' && ecosystem === 'pypi') {
    // pip subcommands other than install (list, show, freeze) are reads.
    if (sub === 'list' || sub === 'show' || sub === 'freeze')
      return [runnerDraft('read', cmd, 'partial')];
  }
  const pkg = positional.find((w, i) => i > 0 && !w.text.startsWith('-'));
  return [installDraft(cmd, ecosystem, pkg)];
}

function httpOps(cmd: NormalizedCommand): OperationDraft[] {
  const sends =
    hasFlag(
      cmd.args,
      '-d',
      '--data',
      '--data-raw',
      '--data-binary',
      '--data-urlencode',
      '-F',
      '--form',
      '-T',
      '--upload-file',
    ) || postMethod(cmd.args);
  const capability: Capability = sends ? 'send' : 'fetch';
  const urlArg = findUrlArg(nonFlagArgs(cmd.args));
  const target = urlArg !== undefined && !urlArg.hasExpansion ? hostTarget(urlArg.text) : null;
  const analyzability: Analyzability = target === null ? 'partial' : 'full';
  return [draft(capability, target ?? unknownTarget(), analyzability, cmd.program, cmd.raw)];
}

/** Prefers an explicit URL; falls back to a bare hostname, ignoring `@file` data. */
function findUrlArg(args: readonly ShellWord[]): ShellWord | undefined {
  const scheme = args.find((w) => /:\/\//.test(w.text));
  if (scheme !== undefined) return scheme;
  for (let i = args.length - 1; i >= 0; i--) {
    const w = args[i];
    if (w !== undefined && !w.text.startsWith('@') && /^[a-z0-9.-]+\.[a-z]{2,}/i.test(w.text))
      return w;
  }
  return undefined;
}

function postMethod(args: readonly ShellWord[]): boolean {
  for (let i = 0; i < args.length; i++) {
    if (args[i]?.text === '-X' || args[i]?.text === '--request') {
      const m = (args[i + 1]?.text ?? '').toUpperCase();
      return m === 'POST' || m === 'PUT' || m === 'PATCH' || m === 'DELETE';
    }
  }
  return false;
}

function copyOps(cmd: NormalizedCommand): OperationDraft[] {
  const remote = nonFlagArgs(cmd.args).find(
    (w) => /^[^/\s]+@?[^/\s]*:/.test(w.text) && !w.text.startsWith('/'),
  );
  if (remote !== undefined) {
    return [draft('send', unknownTarget(), 'partial', cmd.program, cmd.raw, ['remote_copy'])];
  }
  return fileOps(cmd, 'write', { patternFirst: false, destLast: true });
}

function remoteExecOps(cmd: NormalizedCommand): OperationDraft[] {
  return [draft('execute', unknownTarget(), 'none', cmd.program, cmd.raw, ['remote_exec'])];
}

function dockerOps(cmd: NormalizedCommand): OperationDraft[] {
  const sub = nonFlagArgs(cmd.args)[0]?.text ?? '';
  if (sub === 'push') return [runnerDraft('push', cmd, 'partial')];
  if (sub === 'pull') return [runnerDraft('fetch', cmd, 'partial')];
  return [runnerDraft('execute', cmd, 'partial')];
}

function kubectlOps(cmd: NormalizedCommand): OperationDraft[] {
  const sub = nonFlagArgs(cmd.args)[0]?.text ?? '';
  const deploySubs = new Set([
    'apply',
    'create',
    'delete',
    'replace',
    'patch',
    'rollout',
    'scale',
    'edit',
    'set',
  ]);
  if (deploySubs.has(sub)) return [runnerDraft('deploy', cmd, 'partial')];
  return [runnerDraft('fetch', cmd, 'partial')];
}

function stateToolOps(cmd: NormalizedCommand, ...deploySubs: readonly string[]): OperationDraft[] {
  const sub = nonFlagArgs(cmd.args)[0]?.text ?? '';
  if (deploySubs.includes(sub)) return [runnerDraft('deploy', cmd, 'partial')];
  return [runnerDraft('execute', cmd, 'partial')];
}

function helmOps(cmd: NormalizedCommand): OperationDraft[] {
  const sub = nonFlagArgs(cmd.args)[0]?.text ?? '';
  const deploySubs = new Set(['upgrade', 'install', 'rollback', 'uninstall', 'delete']);
  if (deploySubs.has(sub)) return [runnerDraft('deploy', cmd, 'partial')];
  return [runnerDraft('fetch', cmd, 'partial')];
}

function wranglerOps(cmd: NormalizedCommand): OperationDraft[] {
  const sub = nonFlagArgs(cmd.args)[0]?.text ?? '';
  if (sub === 'deploy' || sub === 'publish') return [runnerDraft('deploy', cmd, 'partial')];
  return [runnerDraft('execute', cmd, 'partial')];
}

function sedOps(cmd: NormalizedCommand): OperationDraft[] {
  const inPlace = cmd.args.some(
    (a) => a.text === '-i' || a.text.startsWith('-i') || a.text === '--in-place',
  );
  return fileOps(cmd, inPlace ? 'write' : 'read', { patternFirst: true, destLast: false });
}

function findOps(cmd: NormalizedCommand): OperationDraft[] {
  const execIdx = cmd.args.findIndex(
    (a) => a.text === '-exec' || a.text === '-execdir' || a.text === '-ok',
  );
  if (execIdx !== -1) {
    const inner = cmd.args
      .slice(execIdx + 1)
      .filter((a) => a.text !== ';' && a.text !== '+' && a.text !== '{}');
    const innerProgram = inner[0]?.text ?? '';
    if (innerProgram.length > 0) {
      const innerCmd: NormalizedCommand = {
        ...cmd,
        program: basename(innerProgram),
        args: inner.slice(1),
      };
      return classifyProgram(innerCmd);
    }
  }
  const capability: Capability = hasFlag(cmd.args, '-delete') ? 'delete' : 'read';
  return searchPathOps(cmd, capability);
}

/** Leading path arguments of `find` (before any `-expr` token), or the cwd. */
function searchPathOps(cmd: NormalizedCommand, capability: Capability): OperationDraft[] {
  const roots: ShellWord[] = [];
  for (const arg of cmd.args) {
    if (arg.text.startsWith('-')) break;
    roots.push(arg);
  }
  if (roots.length === 0) {
    const resolved = resolvePath('.', cmd.cwd, cmd.workspaceRoot);
    return [draft(capability, pathTarget(resolved), 'partial', cmd.program, cmd.raw)];
  }
  return roots.map((root) => {
    if (root.hasExpansion)
      return draft(capability, unknownTarget(), 'partial', cmd.program, cmd.raw, [
        'target_variable',
      ]);
    const resolved = resolvePath(root.text, cmd.cwd, cmd.workspaceRoot);
    return draft(capability, pathTarget(resolved), 'partial', cmd.program, cmd.raw);
  });
}

interface FileOpOptions {
  readonly patternFirst: boolean;
  readonly destLast: boolean;
}

function fileOps(
  cmd: NormalizedCommand,
  capability: Capability,
  opts: FileOpOptions,
): OperationDraft[] {
  let files = nonFlagArgs(cmd.args);
  if (opts.patternFirst && files.length > 0) files = files.slice(1);
  if (opts.destLast) files = files.slice(-1);
  if (files.length === 0) {
    const resolved = resolvePath('.', cmd.cwd, cmd.workspaceRoot);
    const analyzability: Analyzability = capability === 'read' ? 'full' : 'partial';
    return [draft(capability, pathTarget(resolved), analyzability, cmd.program, cmd.raw)];
  }
  return files.map((file) => {
    if (file.hasExpansion) {
      return draft(capability, unknownTarget(), 'partial', cmd.program, cmd.raw, [
        'target_variable',
      ]);
    }
    const resolved = resolvePath(file.text, cmd.cwd, cmd.workspaceRoot);
    return draft(capability, pathTarget(resolved), 'full', cmd.program, cmd.raw);
  });
}

function runnerDraft(
  capability: Capability,
  cmd: NormalizedCommand,
  analyzability: Analyzability,
): OperationDraft {
  const resolved = resolvePath('.', cmd.cwd, cmd.workspaceRoot);
  return draft(capability, pathTarget(resolved), analyzability, cmd.program, cmd.raw);
}

function installDraft(
  cmd: NormalizedCommand,
  ecosystem: Ecosystem,
  pkg: ShellWord | undefined,
): OperationDraft {
  const source = pkg === undefined || pkg.hasExpansion ? null : pkg.text;
  const target: Target = { kind: 'package', ecosystem, source };
  const analyzability: Analyzability = source === null ? 'partial' : 'full';
  return draft('install', target, analyzability, cmd.program, cmd.raw);
}

function basename(program: string): string {
  const slash = program.lastIndexOf('/');
  return slash === -1 ? program : program.slice(slash + 1);
}
