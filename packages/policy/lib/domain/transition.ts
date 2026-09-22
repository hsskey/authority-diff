import { err, ok } from '@authority/kernel';
import type { AppError, Result } from '@authority/kernel';
import type { PolicyVersionStatus } from '../../schema.ts';

export type PolicyTransition = 'submit' | 'accept' | 'reject' | 'withdraw';

const TRANSITIONS: Record<
  PolicyTransition,
  { readonly from: PolicyVersionStatus; readonly to: PolicyVersionStatus }
> = {
  submit: { from: 'draft', to: 'in_review' },
  accept: { from: 'in_review', to: 'accepted' },
  reject: { from: 'in_review', to: 'rejected' },
  withdraw: { from: 'in_review', to: 'draft' },
};

export function nextStatus(
  current: PolicyVersionStatus,
  transition: PolicyTransition,
): Result<PolicyVersionStatus, AppError> {
  const rule = TRANSITIONS[transition];
  if (current !== rule.from) {
    return err({
      code: 'policy.transition_not_allowed',
      message: `a policy version in status ${current} cannot ${transition}`,
      isRetryable: false,
      details: { current, transition },
      cause: null,
    });
  }
  return ok(rule.to);
}
