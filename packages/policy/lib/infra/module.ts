import { err, ok } from '@authority/kernel';
import type { AppError, Result } from '@authority/kernel';
import type { ClaudeCodeSettingsExport, PolicyIssue, PolicyVersionId } from '#schema';
import { exportClaudeCodeSettings } from '../domain/export-claude-code-settings.ts';
import { validatePolicyDocument } from '../domain/validate-policy-document.ts';
import type { PolicyRepository } from './repository.ts';

export interface PolicyValidation {
  readonly isValid: boolean;
  readonly issues: readonly PolicyIssue[];
}

export interface PolicyModule extends PolicyRepository {
  validateVersion(id: PolicyVersionId): Promise<Result<PolicyValidation, AppError>>;
  /** A read of the stored version: it writes nothing (ACR-0018). */
  exportClaudeCodeSettings(
    id: PolicyVersionId,
  ): Promise<Result<ClaudeCodeSettingsExport, AppError>>;
}

/**
 * The organization has one Policy: a second `createPolicy` is refused with
 * `policy.organization_policy_exists`, and when several rows exist none is
 * picked. The store still allows several rows; ADR-0010 records why the
 * constraint is not in the database.
 */
export function createPolicyModule(repository: PolicyRepository): PolicyModule {
  return {
    ...repository,
    async createPolicy(input) {
      const existing = await repository.listPolicies(null, 1);
      if (!existing.ok) {
        return existing;
      }
      const [first] = existing.value.items;
      if (first !== undefined) {
        return err({
          code: 'policy.organization_policy_exists',
          message: 'the organization already has a Policy',
          isRetryable: false,
          details: { policyId: first.id },
          cause: null,
        });
      }
      return repository.createPolicy(input);
    },
    async validateVersion(id) {
      const version = await repository.getVersion(id);
      if (!version.ok) {
        return version;
      }
      const issues = validatePolicyDocument(version.value.document);
      return ok({ isValid: issues.length === 0, issues });
    },
    async exportClaudeCodeSettings(id) {
      const version = await repository.getVersion(id);
      if (!version.ok) {
        return version;
      }
      return ok(exportClaudeCodeSettings(version.value.document));
    },
  };
}
