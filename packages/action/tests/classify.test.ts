import { beforeAll, describe, expect, test } from 'vitest';
import { createClassifier, CLASSIFIER_VERSION, CONTROL_TOOL_NAMES } from '../index.ts';
import type { ClassifyToolCall, Operation, ToolCall } from '../schema.ts';

let classify: ClassifyToolCall;
beforeAll(async () => {
  classify = await createClassifier();
});

function call(over: Partial<ToolCall>): ToolCall {
  return {
    toolUseId: 'synthetic-id',
    toolName: 'Bash',
    toolInputRedacted: '',
    isInputTruncated: false,
    workspaceRoot: '/work/repo',
    gitBranch: 'main',
    repoRemotes: { origin: 'git@github.com:acme/toolkit.git' },
    ...over,
  };
}

function bash(command: string, over: Partial<ToolCall> = {}): ToolCall {
  return call({ toolName: 'Bash', toolInputRedacted: command, ...over });
}

/** First Operation whose capability matches. */
function withCap(ops: readonly Operation[], capability: string): Operation | undefined {
  return ops.find((o) => o.capability === capability);
}

describe('capability rule table', () => {
  // Each row is one literal case for a rule-table entry: command, expected
  // primary capability, and expected target kind.
  const rows: ReadonlyArray<readonly [string, string, string]> = [
    // read
    ['cat notes.txt', 'read', 'path'],
    ['ls src', 'read', 'path'],
    ['grep TODO src/app.ts', 'read', 'path'],
    ['head -n 5 file.log', 'read', 'path'],
    ['tail -f server.log', 'read', 'path'],
    ['wc -l data.csv', 'read', 'path'],
    ['base64 -d payload.txt', 'read', 'path'],
    ['git status', 'read', 'path'],
    ['git log --oneline', 'read', 'path'],
    // write
    ['mv a.txt b.txt', 'write', 'path'],
    ['cp src.txt dest.txt', 'write', 'path'],
    ['tee out.txt', 'write', 'path'],
    ['touch new.ts', 'write', 'path'],
    ['mkdir dist', 'write', 'path'],
    ['chmod 600 secret.pem', 'write', 'path'],
    ['sed -i s/a/b/ config.yaml', 'write', 'path'],
    // delete
    ['rm old.txt', 'delete', 'path'],
    ['rmdir empty', 'delete', 'path'],
    ['git clean -fd', 'delete', 'path'],
    ['git rm tracked.txt', 'delete', 'path'],
    // execute runners
    ['pnpm test', 'execute', 'path'],
    ['npm run build', 'execute', 'path'],
    ['yarn lint', 'execute', 'path'],
    ['vitest run', 'execute', 'path'],
    ['tsc --noEmit', 'execute', 'path'],
    ['node scripts/build.js', 'execute', 'path'],
    ['tsx scripts/run.ts', 'execute', 'path'],
    ['python3 scripts/gen.py', 'execute', 'path'],
    ['make build', 'execute', 'path'],
    ['cargo build', 'execute', 'path'],
    ['go test ./...', 'execute', 'path'],
    ['pytest tests', 'execute', 'path'],
    ['turbo run typecheck', 'execute', 'path'],
    ['eslint .', 'execute', 'path'],
    ['oxlint --type-aware', 'execute', 'path'],
    // execute inline (opaque)
    ['python3 -c "print(1)"', 'execute', 'unknown'],
    ['node -e "console.log(1)"', 'execute', 'unknown'],
    ['ssh host uptime', 'execute', 'unknown'],
    // install
    ['pnpm add lodash', 'install', 'package'],
    ['npm install', 'install', 'package'],
    ['pip install requests', 'install', 'package'],
    ['cargo install ripgrep', 'install', 'package'],
    // fetch
    ['curl https://example.com/data.json', 'fetch', 'host'],
    ['wget https://example.com/file.tar.gz', 'fetch', 'host'],
    ['git clone https://github.com/acme/toolkit.git', 'fetch', 'vcs_remote'],
    ['git pull origin main', 'fetch', 'vcs_remote'],
    // send
    ['curl -d @body.json https://api.example.com/x', 'send', 'host'],
    ['curl -X POST https://api.example.com/x', 'send', 'host'],
    ['scp file.txt user@host.example.com:/tmp/', 'send', 'host'],
    // commit
    ['git add .', 'commit', 'path'],
    ['git commit -m msg', 'commit', 'path'],
    ['git merge feature', 'commit', 'path'],
    ['git checkout main', 'commit', 'path'],
    ['git tag v1.0.0', 'commit', 'path'],
    // push
    ['git push origin main', 'push', 'vcs_remote'],
    ['docker push registry.example.com/app:1', 'push', 'host'],
    ['npm publish', 'push', 'package'],
    // rewrite
    ['git push --force origin main', 'rewrite', 'vcs_remote'],
    ['git push -f origin main', 'rewrite', 'vcs_remote'],
    ['git reset --hard HEAD~1', 'rewrite', 'path'],
    ['git branch -D stale', 'rewrite', 'path'],
    // deploy
    ['kubectl apply -f d.yaml', 'deploy', 'path'],
    ['terraform apply', 'deploy', 'path'],
    ['helm upgrade app chart', 'deploy', 'path'],
    ['vercel', 'deploy', 'path'],
    // gh
    ['gh pr view 3', 'fetch', 'vcs_remote'],
    ['gh run view 9', 'fetch', 'vcs_remote'],
    ['gh pr create --title x', 'send', 'vcs_remote'],
    ['gh pr merge 3', 'push', 'vcs_remote'],
    ['gh release create v1', 'push', 'vcs_remote'],
    ['gh auth token', 'read', 'path'],
    ['gh secret set NAME', 'read', 'path'],
  ];

  test.each(rows)('%s -> %s on %s', (command, capability, targetKind) => {
    const ops = classify(bash(command));
    const op = withCap(ops, capability);
    expect(op).toBeDefined();
    expect(op?.target.kind).toBe(targetKind);
  });
});

describe('analyzability', () => {
  test('runner with cwd target is partial', () => {
    const op = withCap(classify(bash('pnpm test')), 'execute');
    expect(op?.analyzability).toBe('partial');
  });

  test('read of a concrete path is full', () => {
    const op = withCap(classify(bash('cat README.md')), 'read');
    expect(op?.analyzability).toBe('full');
  });

  test('variable target is partial with target_variable signal', () => {
    const op = withCap(classify(bash('rm -rf "$DIR"')), 'delete');
    expect(op?.analyzability).toBe('partial');
    expect(op?.target.kind).toBe('unknown');
    expect(op?.signals).toContain('target_variable');
  });

  test('nested-group remote yields null key and remote_unparsed', () => {
    const op = withCap(classify(bash('git clone https://gitlab.com/group/sub/proj.git')), 'fetch');
    expect(op?.target).toEqual({
      kind: 'vcs_remote',
      remoteName: null,
      remoteKey: null,
      branch: null,
    });
    expect(op?.signals).toContain('remote_unparsed');
  });

  test('default-origin push resolves origin and is partial', () => {
    const op = withCap(classify(bash('git push')), 'push');
    expect(op?.target).toEqual({
      kind: 'vcs_remote',
      remoteName: 'origin',
      remoteKey: 'github.com/acme/toolkit',
      branch: 'main',
    });
    expect(op?.analyzability).toBe('partial');
  });
});

describe('command decomposition', () => {
  test('pipeline yields one Operation per simple command', () => {
    const ops = classify(bash('cat a.txt | grep x | wc -l'));
    expect(ops.map((o) => o.capability)).toEqual(['read', 'read', 'read']);
  });

  test('redirect adds a write on the target path', () => {
    const ops = classify(bash('echo hi > out.txt'));
    const write = withCap(ops, 'write');
    expect(write?.target).toEqual({
      kind: 'path',
      path: '/work/repo/out.txt',
      isInsideWorkspace: true,
    });
    expect(write?.signals).toContain('redirect');
  });

  test('cd updates the working directory for later fragments', () => {
    const ops = classify(bash('cd packages/action && pnpm test'));
    const exec = withCap(ops, 'execute');
    expect(exec?.target).toEqual({
      kind: 'path',
      path: '/work/repo/packages/action',
      isInsideWorkspace: true,
    });
  });

  test('sudo is stripped and the inner program is classified', () => {
    const ops = classify(bash('sudo rm -rf /var/data'));
    const del = withCap(ops, 'delete');
    expect(del?.program).toBe('rm');
    expect(del?.target.kind).toBe('path');
  });

  test('bash -c string is re-parsed', () => {
    const ops = classify(bash("bash -c 'rm -rf /tmp/x'"));
    expect(withCap(ops, 'delete')?.program).toBe('rm');
  });

  test('inline interpreter code is opaque with credential and url effects', () => {
    const ops = classify(
      bash("python3 -c \"open('~/.aws/credentials'); urlopen('https://x.example.com')\""),
    );
    expect(withCap(ops, 'execute')?.analyzability).toBe('none');
    expect(withCap(ops, 'read')?.signals).toContain('inline_credential');
    expect(withCap(ops, 'send')?.target.kind).toBe('host');
  });
});

describe('tool routing', () => {
  test('control tool names yield zero Operations', () => {
    for (const name of CONTROL_TOOL_NAMES) {
      expect(classify(call({ toolName: name, toolInputRedacted: '{}' }))).toEqual([]);
    }
  });

  test('Agent is not a control tool and yields an opaque Operation', () => {
    expect(CONTROL_TOOL_NAMES).not.toContain('Agent');
    const ops = classify(call({ toolName: 'Agent', toolInputRedacted: '{"prompt":"x"}' }));
    expect(ops).toHaveLength(1);
    expect(ops[0]?.capability).toBe('execute');
    expect(ops[0]?.target.kind).toBe('unknown');
  });

  test('mcp tool name parses server and tool', () => {
    const ops = classify(call({ toolName: 'mcp__github__create_issue', toolInputRedacted: '{}' }));
    expect(ops[0]?.capability).toBe('execute');
    expect(ops[0]?.target).toEqual({ kind: 'mcp', server: 'github', tool: 'create_issue' });
    expect(ops[0]?.analyzability).toBe('partial');
  });

  test('unknown tool is a single opaque Operation, never read', () => {
    const ops = classify(call({ toolName: 'MysteryTool', toolInputRedacted: '{}' }));
    expect(ops).toEqual([
      {
        index: 0,
        capability: 'execute',
        target: { kind: 'unknown' },
        analyzability: 'none',
        program: 'MysteryTool',
        fragment: '{}',
        signals: ['tool_unrecognized'],
      },
    ]);
  });

  test('Read tool maps to a read of its file_path', () => {
    const ops = classify(
      call({ toolName: 'Read', toolInputRedacted: '{"file_path":"/work/repo/x.ts"}' }),
    );
    expect(ops[0]?.capability).toBe('read');
    expect(ops[0]?.target).toEqual({
      kind: 'path',
      path: '/work/repo/x.ts',
      isInsideWorkspace: true,
    });
  });

  test('Write tool maps to a write of its file_path', () => {
    const op = withCap(
      classify(call({ toolName: 'Write', toolInputRedacted: '{"file_path":"/work/repo/y.ts"}' })),
      'write',
    );
    expect(op?.target.kind).toBe('path');
  });

  test('WebFetch maps to a fetch of its url host', () => {
    const op = withCap(
      classify(
        call({ toolName: 'WebFetch', toolInputRedacted: '{"url":"https://docs.example.com/x"}' }),
      ),
      'fetch',
    );
    expect(op?.target).toEqual({ kind: 'host', host: 'docs.example.com', scheme: 'https' });
  });

  test('invalid JSON for a non-Bash tool is conservative execute/unknown/none', () => {
    const ops = classify(call({ toolName: 'Read', toolInputRedacted: 'not json' }));
    expect(ops[0]?.capability).toBe('execute');
    expect(ops[0]?.target.kind).toBe('unknown');
    expect(ops[0]?.analyzability).toBe('none');
    expect(ops[0]?.signals).toContain('input_unparsed');
  });

  test('invalid JSON for WebSearch is conservative execute/unknown/none', () => {
    const ops = classify(call({ toolName: 'WebSearch', toolInputRedacted: 'not json' }));
    expect(ops[0]?.capability).toBe('execute');
    expect(ops[0]?.target.kind).toBe('unknown');
    expect(ops[0]?.analyzability).toBe('none');
    expect(ops[0]?.signals).toContain('input_unparsed');
  });

  test('non-object JSON for a non-Bash tool is conservative execute/unknown/none', () => {
    const ops = classify(call({ toolName: 'Read', toolInputRedacted: '[1,2,3]' }));
    expect(ops[0]?.capability).toBe('execute');
    expect(ops[0]?.target.kind).toBe('unknown');
    expect(ops[0]?.analyzability).toBe('none');
    expect(ops[0]?.signals).toContain('input_unparsed');
  });

  test('valid JSON for WebSearch stays a partial fetch', () => {
    const op = withCap(
      classify(call({ toolName: 'WebSearch', toolInputRedacted: '{"query":"synthetic"}' })),
      'fetch',
    );
    expect(op?.analyzability).toBe('partial');
    expect(op?.target.kind).toBe('unknown');
  });
});

describe('truncation and fragment cap', () => {
  test('truncated input adds a none Operation with input_truncated', () => {
    const ops = classify(bash('cat file.log', { isInputTruncated: true }));
    const truncated = ops.find((o) => o.signals.includes('input_truncated'));
    expect(truncated?.capability).toBe('execute');
    expect(truncated?.target.kind).toBe('unknown');
    expect(truncated?.analyzability).toBe('none');
  });

  test('fragment longer than 2000 chars is truncated with a signal', () => {
    const longArg = 'a'.repeat(2500);
    const ops = classify(bash(`cat ${longArg}`));
    const op = ops[0];
    expect(op?.fragment.length).toBe(2000);
    expect(op?.signals).toContain('fragment_truncated');
  });
});

test('classifier version is 0.1.1', () => {
  expect(CLASSIFIER_VERSION).toBe('0.1.1');
});
