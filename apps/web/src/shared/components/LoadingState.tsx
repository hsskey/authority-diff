import { Panel } from './Panel.tsx';

export function LoadingState({ label = '불러오는 중' }: { label?: string }) {
  return (
    <Panel role="status" aria-live="polite">
      <p className="m-0">{label}</p>
      <div className="skeleton" aria-hidden="true" />
    </Panel>
  );
}
