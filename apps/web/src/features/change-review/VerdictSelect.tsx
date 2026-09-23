import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ChangeReviewResponse, ReviewDiffGroupResponse } from '@authority/contracts/schema';
import { routes } from '@authority/contracts/routes';
import { callRoute, describeApiError } from '../../shared/api-client.ts';
import { VERDICT_OPTIONS, verdictLabel } from './format.ts';

type Verdict = ReviewDiffGroupResponse['verdict'];

/** Records one group's Verdict. Both the review and group screens set a Verdict,
 * so the control and its cache invalidation live here. */
export function VerdictSelect({
  reviewId,
  kind,
  groupKey,
  capability,
  verdict,
  disabled = false,
}: {
  reviewId: string;
  kind: ChangeReviewResponse['kind'];
  groupKey: string;
  capability: string;
  verdict: Verdict;
  disabled?: boolean;
}) {
  const queryClient = useQueryClient();
  const record = useMutation({
    mutationFn: async (next: Exclude<Verdict, null>) => {
      const result = await callRoute(routes.recordVerdict, {
        params: { id: reviewId, groupKey },
        body: { verdict: next, note: '' },
      });
      if (!result.ok) {
        throw new Error(describeApiError(result.error));
      }
      return result.value;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['change-review', reviewId] });
      void queryClient.invalidateQueries({ queryKey: ['change-review-diff-groups', reviewId] });
      void queryClient.invalidateQueries({ queryKey: ['change-review-adoption-groups', reviewId] });
    },
  });

  return (
    <label className="verdict-select">
      <span className="sr-only">판정</span>
      <select
        aria-label={`${capability} 판정`}
        value={verdict ?? ''}
        disabled={disabled || record.isPending}
        onChange={(event) => {
          const next = VERDICT_OPTIONS.find((option) => option === event.target.value);
          if (next) {
            record.mutate(next);
          }
        }}
      >
        <option value="" disabled>
          {verdictLabel(kind, null)}
        </option>
        {VERDICT_OPTIONS.map((option) => (
          <option key={option} value={option}>
            {verdictLabel(kind, option)}
          </option>
        ))}
      </select>
      {record.isError ? (
        <span className="state-message status-error" role="alert">
          {record.error.message}
        </span>
      ) : null}
    </label>
  );
}
