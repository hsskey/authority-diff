import { ok } from '@authority/kernel';
import type { AppError, Result } from '@authority/kernel';
import type { PolicyIssue, PolicyVersionId } from '../../schema.ts';
import { validatePolicyDocument } from '../domain/validate-policy-document.ts';
import {
  createPolicyRepository,
  type PolicyRepository,
  type PolicyRepositoryDeps,
} from './repository.ts';

export interface PolicyValidation {
  readonly isValid: boolean;
  readonly issues: readonly PolicyIssue[];
}

export interface PolicyModule extends PolicyRepository {
  validateVersion(id: PolicyVersionId): Promise<Result<PolicyValidation, AppError>>;
}

export function createPolicyModule(deps: PolicyRepositoryDeps): PolicyModule {
  const repository = createPolicyRepository(deps);
  return {
    ...repository,
    async validateVersion(id) {
      const version = await repository.getVersion(id);
      if (!version.ok) {
        return version;
      }
      const issues = validatePolicyDocument(version.value.document);
      return ok({ isValid: issues.length === 0, issues });
    },
  };
}
