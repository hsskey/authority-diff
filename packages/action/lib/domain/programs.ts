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
import { draft, unlessNoEffect, type OperationDraft } from './draft.ts';
import { scanInline } from './inline.ts';
import {
  hostTarget,
  normalizeRemote,
  parseHost,
  pathTarget,
  resolvePath,
  unknownTarget,
} from './targets.ts';

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
  'shasum',
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
  'pgrep',
  'sysctl',
  'read',
  'break',
  'continue',
  'exit',
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
const CODE_FLAGS: ReadonlySet<string> = new Set(['-c', '-e', '-p', '--eval', '--print']);
const PRELOAD_VALUE_FLAGS: ReadonlySet<string> = new Set(['-r', '--require']);

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
  'corepack',
  'nvm',
  'volta',
]);
/** Programs that take inner code or a command and cannot be re-parsed here. */
const OPAQUE_EXEC: ReadonlySet<string> = new Set([
  'tmux',
  'screen',
  'sqlite3',
  'psql',
  'mysql',
  'claude',
  'eval',
]);
/** Process-signalling programs: affect a running process, not the filesystem. */
const PROCESS_SIGNALLERS: ReadonlySet<string> = new Set(['kill', 'pkill', 'killall']);
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
  if (p === 'scp' || p === 'rsync' || p === 'sftp') return copyOps(cmd, true);
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
  if (OPAQUE_EXEC.has(p))
    return [draft('execute', unknownTarget(), 'none', p, cmd.raw, ['inline_code'])];
  if (PROCESS_SIGNALLERS.has(p)) return [runnerDraft('execute', cmd, 'partial')];
  if (p === 'mktemp') return [runnerDraft('write', cmd, 'partial')];
  if (p === 'sed') return sedOps(cmd);
  if (NO_FILE_READERS.has(p)) return [runnerDraft('read', cmd, 'full')];
  if (p === 'cp' || p === 'mv') return copyOps(cmd, false);
  if (WRITERS.has(p)) return fileOps(cmd, 'write', { patternFirst: false, destLast: p === 'ln' });
  if (DELETERS.has(p)) return fileOps(cmd, 'delete', { patternFirst: false, destLast: false });
  if (FILE_READERS.has(p) || PATTERN_FIRST.has(p)) {
    return fileOps(cmd, 'read', { patternFirst: PATTERN_FIRST.has(p), destLast: false });
  }
  // Unrecognized program: opaque execution, never a false read.
  return [draft('execute', unknownTarget(), 'none', p, cmd.raw, ['program_unrecognized'])];
}

function interpreterOps(cmd: NormalizedCommand): OperationDraft[] {
  const body = inlineCodeBody(cmd.args) ?? cmd.heredocBodies[0] ?? null;
  if (body !== null) return inlineCodeOps(cmd, body);
  // Interpreter running a script file, or a REPL: opaque but bounded execution.
  return [runnerDraft('execute', cmd, 'partial')];
}

/**
 * The inline-code body carried by a code flag (`-e`/`-c`/...), reading past the
 * value of a preload flag (`-r <module>`) so the module is not taken as code.
 */
function inlineCodeBody(args: readonly ShellWord[]): string | null {
  for (let i = 0; i < args.length; i++) {
    const t = args[i]?.text ?? '';
    if (PRELOAD_VALUE_FLAGS.has(t)) {
      i += 1;
      continue;
    }
    if (CODE_FLAGS.has(t)) {
      return args.slice(i + 1).find((a) => !a.text.startsWith('-'))?.text ?? '';
    }
  }
  return null;
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
  if (sub === 'publish') return [publishDraft(cmd, 'npm')];
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
  const adds = cmd.program === 'go' ? 'get' : 'add';
  if (sub === 'install' || sub === adds)
    return [installDraft(cmd, cmd.program === 'go' ? 'go' : 'cargo', nonFlagArgs(cmd.args)[1])];
  if (sub === 'publish') return [publishDraft(cmd, cmd.program === 'go' ? 'go' : 'cargo')];
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

/**
 * A copy reads every local source operand, then writes the last operand or,
 * for scp/rsync/sftp with a `host:path` operand, sends to that host.
 */
function copyOps(cmd: NormalizedCommand, allowsRemote: boolean): OperationDraft[] {
  const operands = nonFlagArgs(cmd.args);
  const isRemote = (w: ShellWord): boolean =>
    allowsRemote && /^[^/\s]+@?[^/\s]*:/.test(w.text) && !w.text.startsWith('/');
  const reads = operands
    .slice(0, -1)
    .filter((w) => !isRemote(w))
    .map((w) => fileDraft(cmd, 'read', w));
  const remote = operands.find(isRemote);
  if (remote !== undefined) {
    const host = hostFromRemoteSpec(remote.text);
    const target: Target = host === null ? unknownTarget() : { kind: 'host', host, scheme: null };
    return [
      ...reads,
      draft('send', target, host === null ? 'partial' : 'full', cmd.program, cmd.raw, [
        'remote_copy',
      ]),
    ];
  }
  return [...reads, ...fileOps(cmd, 'write', { patternFirst: false, destLast: true })];
}

/** Host of a `user@host:path` or `host:path` scp/rsync operand. */
function hostFromRemoteSpec(text: string): string | null {
  const colon = text.indexOf(':');
  const authority = colon === -1 ? text : text.slice(0, colon);
  const at = authority.indexOf('@');
  const host = (at === -1 ? authority : authority.slice(at + 1)).replace(/:\d+$/, '').toLowerCase();
  return host.length === 0 ? null : host;
}

function remoteExecOps(cmd: NormalizedCommand): OperationDraft[] {
  return [draft('execute', unknownTarget(), 'none', cmd.program, cmd.raw, ['remote_exec'])];
}

function dockerOps(cmd: NormalizedCommand): OperationDraft[] {
  const positional = nonFlagArgs(cmd.args);
  const sub = positional[0]?.text ?? '';
  if (sub === 'push') {
    const image = positional[1];
    const host =
      image === undefined || image.hasExpansion ? null : registryHostFromImage(image.text);
    const target: Target = host === null ? unknownTarget() : { kind: 'host', host, scheme: null };
    const op = draft('push', target, host === null ? 'partial' : 'full', 'docker', cmd.raw);
    return [unlessNoEffect(op, cmd.args)];
  }
  if (sub === 'pull') return [runnerDraft('fetch', cmd, 'partial')];
  return [runnerDraft('execute', cmd, 'partial')];
}

/** Registry host of an image reference; the default registry is docker.io. */
function registryHostFromImage(image: string): string {
  if (!image.includes('/')) return 'docker.io';
  const first = image.split('/')[0] ?? '';
  if (first.includes('.') || first.includes(':')) return first.replace(/:\d+$/, '').toLowerCase();
  return 'docker.io';
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
  const inPlace = cmd.args.some((a) => a.text.startsWith('-i') || a.text.startsWith('--in-place'));
  return fileOps(cmd, inPlace ? 'write' : 'read', { patternFirst: true, destLast: false });
}

function findOps(cmd: NormalizedCommand): OperationDraft[] {
  const execIdx = cmd.args.findIndex(
    (a) => a.text === '-exec' || a.text === '-execdir' || a.text === '-ok',
  );
  if (execIdx !== -1) {
    const inner = cmd.args.slice(execIdx + 1).filter((a) => !isFindPlaceholder(a.text));
    const innerProgram = inner[0]?.text ?? '';
    if (innerProgram.length > 0) {
      // Keep the inner command's capability, but its operands are find's matches,
      // so the target is find's search path with analyzability partial.
      const innerCmd: NormalizedCommand = {
        ...cmd,
        program: basename(innerProgram),
        args: inner.slice(1),
      };
      const caps = [...new Set(classifyProgram(innerCmd).map((o) => o.capability))];
      const roots = findRootTargets(cmd);
      return caps.flatMap((cap) =>
        roots.map((t) => draft(cap, t, 'partial', innerCmd.program, cmd.raw, ['find_exec'])),
      );
    }
  }
  const capability: Capability = hasFlag(cmd.args, '-delete') ? 'delete' : 'read';
  return findRootTargets(cmd).map((t) => draft(capability, t, 'partial', cmd.program, cmd.raw));
}

/** Leading path arguments of `find` (before any `-expr` token) as Targets, or the cwd. */
function findRootTargets(cmd: NormalizedCommand): Target[] {
  const roots: ShellWord[] = [];
  for (const arg of cmd.args) {
    if (arg.text.startsWith('-')) break;
    roots.push(arg);
  }
  if (roots.length === 0) return [pathTarget(resolvePath('.', cmd.cwd, cmd.workspaceRoot))];
  return roots.map((root) =>
    root.hasExpansion
      ? unknownTarget()
      : pathTarget(resolvePath(root.text, cmd.cwd, cmd.workspaceRoot)),
  );
}

function isFindPlaceholder(text: string): boolean {
  return text === '{}' || text === ';' || text === '+' || text === '\\;' || text === '{}\\;';
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
  return files.map((file) => fileDraft(cmd, capability, file));
}

function fileDraft(
  cmd: NormalizedCommand,
  capability: Capability,
  file: ShellWord,
): OperationDraft {
  if (file.hasExpansion) {
    return draft(capability, unknownTarget(), 'partial', cmd.program, cmd.raw, ['target_variable']);
  }
  const resolved = resolvePath(file.text, cmd.cwd, cmd.workspaceRoot);
  return draft(capability, pathTarget(resolved), 'full', cmd.program, cmd.raw);
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
  const { source, analyzability } = packageSource(cmd, ecosystem, pkg);
  const target: Target = { kind: 'package', ecosystem, source };
  return draft('install', target, analyzability, cmd.program, cmd.raw);
}

interface SourceResult {
  readonly source: string | null;
  readonly analyzability: Analyzability;
}

/**
 * The `source` of a package Operation is where the package comes from, not its
 * name (Zone compares source against trusted/public remotes). A plain name maps
 * to the ecosystem's default registry (or `--registry`/`--index-url`); a git or
 * URL spec maps to its normalized Remote Key or host; an unparseable spec has a
 * null source. The package name itself remains only in the fragment.
 */
function packageSource(
  cmd: NormalizedCommand,
  ecosystem: Ecosystem,
  pkg: ShellWord | undefined,
): SourceResult {
  const registry = findRegistryHost(cmd.args) ?? defaultRegistry(ecosystem);
  if (pkg === undefined) {
    // install-all (no package argument): the registry is known but the set is not.
    return { source: registry, analyzability: 'partial' };
  }
  if (pkg.hasExpansion) return { source: null, analyzability: 'partial' };
  const spec = normalizeSpec(pkg.text);
  if (spec.kind === 'remote') return { source: spec.source, analyzability: 'full' };
  if (spec.kind === 'unparseable') return { source: null, analyzability: 'partial' };
  return { source: registry, analyzability: registry === null ? 'partial' : 'full' };
}

function defaultRegistry(ecosystem: Ecosystem): string | null {
  switch (ecosystem) {
    case 'npm':
      return 'registry.npmjs.org';
    case 'pypi':
      return 'pypi.org';
    case 'cargo':
      return 'crates.io';
    case 'go':
      return 'proxy.golang.org';
    case 'system':
      return null;
    case 'other':
      return null;
  }
}

function findRegistryHost(args: readonly ShellWord[]): string | null {
  for (let i = 0; i < args.length; i++) {
    const t = args[i]?.text ?? '';
    if (t === '--registry' || t === '-i' || t === '--index-url') {
      const next = args[i + 1];
      return next === undefined || next.hasExpansion ? null : parseHost(next.text);
    }
    if (t.startsWith('--registry=')) return parseHost(t.slice('--registry='.length));
    if (t.startsWith('--index-url=')) return parseHost(t.slice('--index-url='.length));
  }
  return null;
}

type SpecKind =
  | { readonly kind: 'remote'; readonly source: string }
  | { readonly kind: 'unparseable' }
  | { readonly kind: 'plain' };

/** Classifies a package spec as a remote source, a plain name, or unparseable. */
function normalizeSpec(spec: string): SpecKind {
  if (spec.startsWith('github:')) {
    return remoteOrUnparseable(`github.com/${spec.slice(7).split('#')[0] ?? ''}`);
  }
  if (spec.startsWith('git+')) return urlSource(spec.slice(4));
  if (/:\/\//.test(spec)) return urlSource(spec);
  if (
    spec.startsWith('.') ||
    spec.startsWith('/') ||
    spec.startsWith('file:') ||
    spec.startsWith('link:') ||
    spec.startsWith('workspace:')
  ) {
    return { kind: 'unparseable' };
  }
  if (!spec.startsWith('@') && /^[\w.-]+\/[\w.-]+(#.+)?$/.test(spec)) {
    return remoteOrUnparseable(`github.com/${spec.split('#')[0] ?? ''}`);
  }
  return { kind: 'plain' };
}

function urlSource(url: string): SpecKind {
  const result = normalizeRemote(url);
  if (result.remoteKey !== null) return { kind: 'remote', source: result.remoteKey };
  const host = parseHost(url);
  return host === null ? { kind: 'unparseable' } : { kind: 'remote', source: host };
}

function remoteOrUnparseable(key: string): SpecKind {
  const result = normalizeRemote(key);
  return result.remoteKey === null
    ? { kind: 'unparseable' }
    : { kind: 'remote', source: result.remoteKey };
}

/**
 * Emits a push Operation whose target is the ecosystem registry (publish), or a
 * partial execute when a help or dry-run flag means nothing is published.
 */
function publishDraft(cmd: NormalizedCommand, ecosystem: Ecosystem): OperationDraft {
  const source = findRegistryHost(cmd.args) ?? defaultRegistry(ecosystem);
  const target: Target = { kind: 'package', ecosystem, source };
  const op = draft('push', target, source === null ? 'partial' : 'full', cmd.program, cmd.raw);
  return unlessNoEffect(op, cmd.args);
}

function basename(program: string): string {
  const slash = program.lastIndexOf('/');
  return slash === -1 ? program : program.slice(slash + 1);
}
