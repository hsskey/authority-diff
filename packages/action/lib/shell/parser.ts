/**
 * The only module that imports the tree-sitter WASM parser.
 *
 * `loadBashParser` initializes web-tree-sitter and the tree-sitter-bash grammar
 * once and returns a synchronous `parse` that adapts native nodes into the
 * minimal {@link ShellParse} AST. Command substitutions, subshells, and process
 * substitutions are flattened into one ordered command list; `bash -c`/`sh -c`
 * string bodies are re-parsed up to a nesting depth of 3.
 */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { Language, Parser, type Node } from 'web-tree-sitter';
import type { ShellCommand, ShellParse, ShellRedirect, ShellWord } from './ast.ts';

/** Synchronous Bash parser produced by {@link loadBashParser}. */
export interface BashParser {
  readonly parse: (command: string) => ShellParse;
}

const MAX_REPARSE_DEPTH = 3;
const SUBSHELL_SPAWNERS: ReadonlySet<string> = new Set(['bash', 'sh', 'dash', 'zsh', 'ksh']);

const EXPANSION_TYPES: ReadonlySet<string> = new Set([
  'simple_expansion',
  'expansion',
  'arithmetic_expansion',
  'command_substitution',
  'process_substitution',
]);

let cachedParser: BashParser | null = null;

/** Loads the WASM parser once and returns a reusable synchronous parser. */
export async function loadBashParser(): Promise<BashParser> {
  if (cachedParser !== null) return cachedParser;

  const require = createRequire(import.meta.url);
  const wasmPath = require.resolve('tree-sitter-bash/tree-sitter-bash.wasm');

  await Parser.init();
  const bash = await Language.load(readFileSync(wasmPath));
  const parser = new Parser();
  parser.setLanguage(bash);

  cachedParser = {
    parse: (command: string): ShellParse => {
      const tree = parser.parse(command);
      if (tree === null) return { commands: [], hasError: true };
      const root = tree.rootNode;
      const commands: ShellCommand[] = [];
      collect(root, 0, commands, parser);
      return { commands, hasError: root.hasError };
    },
  };
  return cachedParser;
}

/** Recursively collects simple commands, flattening nested structures. */
function collect(node: Node, depth: number, out: ShellCommand[], parser: Parser): void {
  if (node.type === 'command') {
    const reparsed = tryReparseSubshell(node, depth, out, parser);
    if (reparsed) return;
    out.push(buildCommand(node, depth));
    // Descend to catch substitutions inside the command's own words.
    for (const child of node.namedChildren) {
      if (child !== null && !isCommandNameField(node, child)) collect(child, depth, out, parser);
    }
    return;
  }
  for (const child of node.namedChildren) {
    if (child !== null) collect(child, depth, out, parser);
  }
}

/**
 * When a command is `bash -c <string>` (or another POSIX shell), re-parses the
 * string body as shell up to {@link MAX_REPARSE_DEPTH}. Returns true when it
 * handled the command (so the caller skips normal collection). Beyond the depth
 * limit or with a non-literal body, returns false so the command is classified
 * as opaque execution.
 */
function tryReparseSubshell(
  node: Node,
  depth: number,
  out: ShellCommand[],
  parser: Parser,
): boolean {
  const nameNode = node.childForFieldName('name');
  if (nameNode === null) return false;
  const program = basename(readWord(nameNode).text);
  if (!SUBSHELL_SPAWNERS.has(program)) return false;

  const args = commandArgs(node);
  const dashCIndex = args.findIndex((w) => w.text === '-c');
  if (dashCIndex === -1) return false;
  const body = args[dashCIndex + 1];
  if (body === undefined || body.hasExpansion || body.text.length === 0) return false;
  if (depth + 1 > MAX_REPARSE_DEPTH) return false;

  const tree = parser.parse(body.text);
  if (tree === null) return false;
  collect(tree.rootNode, depth + 1, out, parser);
  return true;
}

function isCommandNameField(command: Node, child: Node): boolean {
  const nameNode = command.childForFieldName('name');
  return nameNode !== null && nameNode.id === child.id;
}

function buildCommand(node: Node, depth: number): ShellCommand {
  const nameNode = node.childForFieldName('name');
  const name = nameNode === null ? null : readWord(nameNode);
  const args = commandArgs(node);
  const redirects = collectRedirects(node);
  return { name, args, redirects, raw: node.text, depth };
}

/** Words after the command name, skipping env assignments and redirects. */
function commandArgs(node: Node): ShellWord[] {
  const nameNode = node.childForFieldName('name');
  const words: ShellWord[] = [];
  for (const child of node.namedChildren) {
    if (child === null) continue;
    if (nameNode !== null && child.id === nameNode.id) continue;
    if (child.type === 'variable_assignment') continue;
    if (
      child.type === 'file_redirect' ||
      child.type === 'heredoc_redirect' ||
      child.type === 'herestring_redirect'
    ) {
      continue;
    }
    words.push(readWord(child));
  }
  return words;
}

function collectRedirects(node: Node): ShellRedirect[] {
  const redirects: ShellRedirect[] = [];
  const container = node.parent?.type === 'redirected_statement' ? node.parent : node;
  for (const child of container.namedChildren) {
    if (child === null) continue;
    if (child.type === 'file_redirect') {
      addFileRedirect(child, redirects);
    } else if (child.type === 'heredoc_redirect') {
      redirects.push({ kind: 'heredoc', target: null, heredocBody: heredocBody(child) });
      // tree-sitter nests a following file redirect (for example `<<EOF > a.txt`)
      // inside the heredoc_redirect, so scan for it here too.
      for (const inner of child.namedChildren) {
        if (inner !== null && inner.type === 'file_redirect') addFileRedirect(inner, redirects);
      }
    }
    // A herestring_redirect (`<<<`) is input and yields no Operation.
  }
  return redirects;
}

function addFileRedirect(node: Node, redirects: ShellRedirect[]): void {
  // A file-descriptor duplication (`2>&1`, `>&2`, `1>&2`) redirects one fd to
  // another and writes no file, so it yields no Operation.
  if (isFdDuplication(node)) return;
  const op = fileRedirectOperator(node);
  const kind = op.includes('>>') ? 'append' : op.startsWith('<') ? 'read' : 'write';
  const target = redirectTarget(node);
  if (target !== null) redirects.push({ kind, target, heredocBody: null });
}

function fileRedirectOperator(node: Node): string {
  for (let i = 0; i < node.childCount; i++) {
    const c = node.child(i);
    if (c !== null && !c.isNamed) return c.text;
  }
  return '>';
}

/**
 * True for fd-duplication redirects (`>&`, `<&`, `M>&N`). The `&` follows the
 * arrow and the target is a descriptor, not a file. `&>`/`&>>` (all-output to a
 * file) start with `&` and are real writes, so they are excluded.
 */
function isFdDuplication(node: Node): boolean {
  const op = fileRedirectOperator(node);
  return op.includes('&') && !op.startsWith('&');
}

/** The redirect target word, skipping any leading file-descriptor node. */
function redirectTarget(node: Node): ShellWord | null {
  for (const child of node.namedChildren) {
    if (child !== null && child.type !== 'file_descriptor') return readWord(child);
  }
  return null;
}

function heredocBody(node: Node): string {
  for (const child of node.namedChildren) {
    if (child !== null && child.type === 'heredoc_body') return child.text;
  }
  return '';
}

/** Computes literal text and expansion flag for a word-like node. */
function readWord(node: Node): ShellWord {
  const type = node.type;
  if (type === 'raw_string') return { text: stripQuotes(node.text, "'"), hasExpansion: false };
  if (type === 'word' || type === 'number' || type === 'command_name') {
    if (type === 'command_name') {
      const inner = node.namedChild(0);
      return inner === null ? { text: node.text, hasExpansion: false } : readWord(inner);
    }
    return { text: node.text, hasExpansion: false };
  }
  if (EXPANSION_TYPES.has(type)) return { text: '', hasExpansion: true };
  if (type === 'string') return readString(node);
  if (type === 'concatenation') {
    let text = '';
    let hasExpansion = false;
    for (const child of node.namedChildren) {
      if (child === null) continue;
      const w = readWord(child);
      text += w.text;
      hasExpansion = hasExpansion || w.hasExpansion;
    }
    return { text, hasExpansion };
  }
  return { text: node.text, hasExpansion: /[$`]/.test(node.text) };
}

function readString(node: Node): ShellWord {
  if (node.namedChildCount === 0) return { text: stripQuotes(node.text, '"'), hasExpansion: false };
  let text = '';
  let hasExpansion = false;
  for (const child of node.namedChildren) {
    if (child === null) continue;
    if (child.type === 'string_content') text += child.text;
    else hasExpansion = true;
  }
  return { text, hasExpansion };
}

function stripQuotes(raw: string, quote: string): string {
  if (raw.length >= 2 && raw.startsWith(quote) && raw.endsWith(quote)) return raw.slice(1, -1);
  return raw;
}

function basename(program: string): string {
  const slash = program.lastIndexOf('/');
  return slash === -1 ? program : program.slice(slash + 1);
}
