import type { Capability, Operation, Target } from '@authority/action/schema';
import type { EnvironmentProfile, ResolveZone, Zone } from '#schema';
import { compileGlob, matchesAny } from './glob.ts';

const LOCAL_CAPABILITIES: ReadonlySet<Capability> = new Set([
  'read',
  'write',
  'delete',
  'execute',
  'commit',
]);

/** Environment Profile with every pattern pre-compiled once for reuse. */
export interface CompiledEnvironment {
  readonly credentialPaths: readonly RegExp[];
  readonly agentConfigPaths: readonly RegExp[];
  readonly protectedBranches: readonly RegExp[];
  readonly trustedRemotes: readonly RegExp[];
  readonly publicRemotes: readonly RegExp[];
  readonly productionMarkers: readonly RegExp[];
}

function tryCompileRegExp(source: string): RegExp | null {
  try {
    return new RegExp(source);
  } catch {
    // Invalid markers are reported at validation time; evaluation treats them as matching nothing.
    return null;
  }
}

function compileProductionMarkers(sources: readonly string[]): readonly RegExp[] {
  const compiled: RegExp[] = [];
  for (const source of sources) {
    const marker = tryCompileRegExp(source);
    if (marker !== null) {
      compiled.push(marker);
    }
  }
  return compiled;
}

/**
 * Compiles every Environment Profile pattern once. Paths and branches are
 * matched case-sensitively; remote patterns are lowercased before matching.
 */
export function compileEnvironment(environment: EnvironmentProfile): CompiledEnvironment {
  return {
    credentialPaths: environment.credentialPaths.map(compileGlob),
    agentConfigPaths: environment.agentConfigPaths.map(compileGlob),
    protectedBranches: environment.protectedBranches.map(compileGlob),
    trustedRemotes: environment.trustedRemotes.map((pattern) => compileGlob(pattern.toLowerCase())),
    publicRemotes: environment.publicRemotes.map((pattern) => compileGlob(pattern.toLowerCase())),
    productionMarkers: compileProductionMarkers(environment.productionMarkers),
  };
}

/**
 * The comparison value used against trustedRemotes and publicRemotes: a
 * vcs_remote remoteKey, host host, package source, `mcp:<server>` for mcp, or
 * deploy_target label. Remote values are lowercased. Every other Target has no
 * remote value and never matches.
 */
function remoteValue(target: Target): string | null {
  switch (target.kind) {
    case 'vcs_remote':
      return target.remoteKey === null ? null : target.remoteKey.toLowerCase();
    case 'host':
      return target.host.toLowerCase();
    case 'package':
      return target.source === null ? null : target.source.toLowerCase();
    case 'mcp':
      return `mcp:${target.server}`.toLowerCase();
    case 'deploy_target':
      return target.label === null ? null : target.label.toLowerCase();
    case 'path':
    case 'unknown':
      return null;
  }
}

/** Resolves the first matching Zone for an Operation against a compiled Environment. */
export function resolveZoneWith(operation: Operation, environment: CompiledEnvironment): Zone {
  const { target, capability } = operation;

  if (target.kind === 'path') {
    if (matchesAny(environment.credentialPaths, target.path)) {
      return 'credentials';
    }
    if (matchesAny(environment.agentConfigPaths, target.path)) {
      return 'agent_config';
    }
  }

  if (
    target.kind === 'vcs_remote' &&
    target.branch !== null &&
    matchesAny(environment.protectedBranches, target.branch)
  ) {
    return 'protected';
  }
  if (capability === 'deploy' && matchesAny(environment.productionMarkers, operation.fragment)) {
    return 'protected';
  }

  if (target.kind === 'path') {
    return target.isInsideWorkspace ? 'workspace' : 'host';
  }

  if (target.kind === 'unknown' && LOCAL_CAPABILITIES.has(capability)) {
    return 'host';
  }

  const value = remoteValue(target);
  if (value !== null) {
    if (matchesAny(environment.publicRemotes, value)) {
      return 'public_remote';
    }
    if (matchesAny(environment.trustedRemotes, value)) {
      return 'trusted_remote';
    }
  }

  return 'unknown_remote';
}

/** Resolves a Zone, compiling the Environment Profile on each call. */
export const resolveZone: ResolveZone = (operation, environment) =>
  resolveZoneWith(operation, compileEnvironment(environment));
