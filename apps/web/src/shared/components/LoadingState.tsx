import { Panel } from './Panel.tsx';

export function LoadingState({ label = '불러오는 중' }: { label?: string }) {
  return (
    <Panel role="status" aria-live="polite">
      <p className="m-0">{label}</p>
      <div
        className="h-4 w-48 animate-shimmer rounded-sm bg-linear-90 from-gray-200 from-25% via-gray-100 via-50% to-gray-200 to-75% bg-size-[200%_100%] motion-reduce:animate-none dark:from-gray-700 dark:via-gray-600 dark:to-gray-700"
        aria-hidden="true"
      />
    </Panel>
  );
}
