import { err, ok } from '@authority/kernel';
import type { AppError, Clock, IdGenerator, Result } from '@authority/kernel';
import { OperationSchema, type ClassifyToolCall, type ToolCall } from '@authority/action/schema';
import { z } from 'zod';
import { deriveActionKey } from '../client/actions.ts';
import { redactText } from '../client/redact.ts';
import { importRejected, redactionMissing } from '../domain/errors.ts';
import { isContentRejection } from '../domain/import-rejection.ts';
import { stripNul, stripNulDeep } from '../client/strip-nul.ts';
import { AgentSessionIdSchema, TraceImportIdSchema } from '#schema';
import type { ParsedSession, StoredAgentAction } from '#schema';
import type { TraceStore, WriteCounts } from './ports.ts';

export interface ImportTraceDeps {
  readonly store: TraceStore;
  readonly classify: ClassifyToolCall;
  readonly clock: Clock;
  readonly idGenerator: IdGenerator;
  readonly classifierVersion: string;
}

export interface ImportTraceResult {
  readonly importId: string;
  readonly acceptedCount: number;
  readonly duplicateCount: number;
  readonly rejectedCount: number;
}

function residualSecretKinds(session: ParsedSession): readonly string[] {
  const kinds = new Set<string>();
  for (const toolCall of session.toolCalls) {
    for (const { kind } of redactText(toolCall.toolInputRedacted).redactions) {
      kinds.add(kind);
    }
  }
  return [...kinds].sort();
}

function prefersCandidate(candidate: StoredAgentAction, existing: StoredAgentAction): boolean {
  if (candidate.occurredAt !== existing.occurredAt) {
    return candidate.occurredAt < existing.occurredAt;
  }
  return candidate.sessionExternalId < existing.sessionExternalId;
}

function sanitizeStoredAction(action: StoredAgentAction): StoredAgentAction {
  const operations = z.array(OperationSchema).parse(stripNulDeep(action.operations));
  return {
    ...action,
    toolInputRedacted: stripNul(action.toolInputRedacted),
    operations,
  };
}

function buildActions(deps: ImportTraceDeps, session: ParsedSession): readonly StoredAgentAction[] {
  const recordedAt = deps.clock.now();
  const chosen = new Map<string, StoredAgentAction>();
  for (const toolCall of session.toolCalls) {
    const actionKey = deriveActionKey({
      runtime: session.runtime,
      sessionExternalId: session.sessionExternalId,
      toolUseId: toolCall.toolUseId,
      sequence: toolCall.sequence,
    });
    const call: ToolCall = {
      toolUseId: toolCall.toolUseId,
      toolName: toolCall.toolName,
      toolInputRedacted: toolCall.toolInputRedacted,
      isInputTruncated: toolCall.isInputTruncated,
      workspaceRoot: toolCall.workspaceRoot,
      gitBranch: toolCall.gitBranch,
      repoRemotes: toolCall.repoRemotes,
    };
    const candidate: StoredAgentAction = {
      actionKey,
      sessionExternalId: session.sessionExternalId,
      operations: [...deps.classify(call)],
      observedOutcome: toolCall.observedOutcome,
      occurredAt: toolCall.occurredAt,
      toolName: toolCall.toolName,
      toolInputRedacted: toolCall.toolInputRedacted,
      isInputTruncated: toolCall.isInputTruncated,
      isSidechain: toolCall.isSidechain,
      classifierVersion: deps.classifierVersion,
      recordedAt,
    };
    const existing = chosen.get(actionKey);
    if (existing === undefined || prefersCandidate(candidate, existing)) {
      chosen.set(actionKey, candidate);
    }
  }
  return [...chosen.values()];
}

/**
 * Classifies and persists one parsed Session synchronously. Secret patterns are
 * re-applied to every tool input; any residual match rejects the whole import
 * so unredacted material never reaches storage. Duplicate actionKeys collapse
 * and are counted, never inserted twice.
 */
export async function importTrace(
  deps: ImportTraceDeps,
  session: ParsedSession,
): Promise<Result<ImportTraceResult, AppError>> {
  const residual = residualSecretKinds(session);
  if (residual.length > 0) {
    return err(redactionMissing(residual));
  }

  const actions = buildActions(deps, session).map(sanitizeStoredAction);
  const redactionCount = session.redactions.reduce((sum, entry) => sum + entry.count, 0);
  const importId = deps.idGenerator.next('imp');
  let counts: WriteCounts;
  try {
    counts = await deps.store.writeImport({
      traceImport: {
        id: TraceImportIdSchema.parse(importId),
        runtime: session.runtime,
        source: 'transcript',
        sessionExternalId: session.sessionExternalId,
        redactionCount,
        classifierVersion: deps.classifierVersion,
        createdAt: deps.clock.now(),
      },
      session: {
        id: AgentSessionIdSchema.parse(deps.idGenerator.next('ses')),
        runtime: session.runtime,
        runtimeVersion: session.runtimeVersion,
        sessionExternalId: session.sessionExternalId,
        workspaceRoot: session.workspaceRoot,
        gitBranch: session.gitBranch,
        hasHookCoverage: false,
        startedAt: session.startedAt,
        endedAt: session.endedAt,
      },
      actions,
      attemptedCount: session.toolCalls.length,
    });
  } catch (cause) {
    if (isContentRejection(cause)) {
      return err(importRejected(cause));
    }
    throw cause;
  }

  return ok({
    importId,
    acceptedCount: counts.acceptedCount,
    duplicateCount: counts.duplicateCount,
    rejectedCount: 0,
  });
}
