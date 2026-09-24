import { Panel } from './Panel.tsx';

export function ErrorState({ title, message }: { title: string; message: string }) {
  return (
    <Panel className="text-red-700" role="alert">
      <p className="m-0">
        <strong>{title}</strong>
      </p>
      <p className="m-0">{message}</p>
    </Panel>
  );
}
