import { Panel } from './Panel.tsx';

export function EmptyState({ title, message }: { title: string; message: string }) {
  return (
    <Panel role="status">
      <p className="m-0">
        <strong>{title}</strong>
      </p>
      <p className="m-0">{message}</p>
    </Panel>
  );
}
