import { dirname, join, relative, resolve, sep } from 'node:path';

// Oxlint JS plugin: inside one workspace package, an import may go up at most one
// level ("./x", "../x"); deeper targets use the package's subpath imports
// ("#lib/*", "#schema", "#src/*"). A relative path that leaves the package (shared
// repo-root test data) is not a same-package import and stays allowed; crossing
// into another package is dependency-cruiser's job. Registered in .oxlintrc.json.

interface SourceNode {
  readonly type: string;
  readonly value?: unknown;
}

interface ImportNode {
  readonly source?: SourceNode | null;
}

interface RuleContext {
  readonly filename: string;
  report(descriptor: { readonly node: ImportNode; readonly message: string }): void;
}

const TWO_OR_MORE_UP = /^(?:\.\.\/){2,}/;
const REPO_ROOT = resolve(import.meta.dirname, '..');
const PACKAGE_DIR = /^(?:packages|apps|tools)[/\\][^/\\]+(?=[/\\])/;

const MESSAGE =
  'Relative import goes up two or more levels inside the same package; use "#lib/*" or "#schema" in packages and "#src/*" in apps.';

function isDeepSamePackageImport(filename: string, specifier: string): boolean {
  if (!TWO_OR_MORE_UP.test(specifier)) {
    return false;
  }
  const packageDir = PACKAGE_DIR.exec(relative(REPO_ROOT, filename))?.[0];
  if (packageDir === undefined) {
    return false;
  }
  const packageRoot = join(REPO_ROOT, packageDir);
  return resolve(dirname(filename), specifier).startsWith(packageRoot + sep);
}

function checkSource(context: RuleContext, node: ImportNode): void {
  const source = node.source;
  if (source?.type !== 'Literal' || typeof source.value !== 'string') {
    return;
  }
  if (isDeepSamePackageImport(context.filename, source.value)) {
    context.report({ node, message: MESSAGE });
  }
}

const noDeepRelativeImport = {
  create(context: RuleContext) {
    const check = (node: ImportNode): void => checkSource(context, node);
    return {
      ImportDeclaration: check,
      ExportNamedDeclaration: check,
      ExportAllDeclaration: check,
      ImportExpression: check,
    };
  },
};

export default {
  meta: { name: 'authority' },
  rules: { 'no-deep-relative-import': noDeepRelativeImport },
};
