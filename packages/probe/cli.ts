import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { argv, stderr, stdout } from 'node:process';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { canonicalJson, sha256Hex } from '@authority/kernel/hash';
import { PolicyDocumentSchema } from '@authority/policy/schema';
import { renderPolicyProse } from '../policy/prose.ts';
import {
  createFixtureDecisionProvider,
  createJevDecisionProvider,
  renderProbeReport,
  runProbe,
} from './index.ts';
import type { DecisionProvider, RecordedResponse } from './index.ts';
import { ScenarioFileSchema } from './schema.ts';

interface ProbeArguments {
  readonly policyPath: string;
  readonly scenariosPath: string;
  readonly provider: 'fixture' | 'jev';
}

const RecordedResponseSchema = z.object({
  contextIncludes: z.string(),
  judgments: z.array(
    z.object({
      questionId: z.string(),
      choice: z.string(),
      distribution: z.record(z.string(), z.number()),
      providerModel: z.string(),
      latencyMs: z.number().nonnegative(),
      inputTokens: z.number().int().nonnegative().nullable(),
    }),
  ),
});

function parseArguments(args: readonly string[]): ProbeArguments {
  let policyPath: string | null = null;
  let scenariosPath = 'tests/corpus/scenarios.json';
  let provider: 'fixture' | 'jev' = 'fixture';

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    const value = args[index + 1];
    if (argument === '--policy' && value !== undefined) {
      policyPath = value;
      index += 1;
    } else if (argument === '--scenarios' && value !== undefined) {
      scenariosPath = value;
      index += 1;
    } else if (argument === '--provider' && (value === 'fixture' || value === 'jev')) {
      provider = value;
      index += 1;
    } else {
      throw new Error(`invalid probe argument: ${argument ?? ''}`);
    }
  }

  if (policyPath === null) {
    throw new Error('--policy <json> is required');
  }
  return { policyPath, scenariosPath, provider };
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(resolve(path), 'utf8'));
}

async function createProvider(provider: 'fixture' | 'jev'): Promise<DecisionProvider> {
  if (provider === 'jev') {
    return createJevDecisionProvider();
  }
  const fixturePath = fileURLToPath(
    new URL('./tests/fixtures/recorded-responses.json', import.meta.url),
  );
  const parsed = z.array(RecordedResponseSchema).parse(await readJson(fixturePath));
  const responses: readonly RecordedResponse[] = parsed;
  return createFixtureDecisionProvider(responses);
}

async function run(args: readonly string[]): Promise<string> {
  const options = parseArguments(args);
  const policy = PolicyDocumentSchema.parse(await readJson(options.policyPath));
  const scenarios = ScenarioFileSchema.parse(await readJson(options.scenariosPath));
  const provider = await createProvider(options.provider);
  const result = await runProbe(
    provider,
    renderPolicyProse(policy),
    scenarios,
    AbortSignal.timeout(120_000),
  );
  if (!result.ok) {
    throw new Error(`${result.error.code}: ${result.error.message}`);
  }

  const contentHash = sha256Hex(canonicalJson(policy));
  const outputPath = resolve('.local', 'probe', `${contentHash}.md`);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, renderProbeReport(result.value), 'utf8');
  return outputPath;
}

async function main(): Promise<void> {
  try {
    const outputPath = await run(argv.slice(2));
    stdout.write(`${outputPath}\n`);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'unknown probe error';
    stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}

void main();
