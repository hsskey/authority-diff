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
  groupLabel,
  verdict,
  disabled = false,
}: {
  reviewId: string;
  kind: ChangeReviewResponse['kind'];
  groupKey: string;
  groupLabel: string;
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
    <label className="inline-grid gap-1">
      <span className="sr-only">판정</span>
      <select
        aria-label={`${groupLabel} 판정`}
        className="rounded-md border border-border bg-panel px-2 py-[0.3rem] text-inherit dark:border-gray-600 dark:bg-gray-900"
        value={verdict ?? ''}
        disabled={disabled || record.isPending}
        aria-busy={record.isPending}
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
        <span className="m-0 text-red-700" role="alert">
          {record.error.message}
        </span>
      ) : null}
    </label>
  );
}
