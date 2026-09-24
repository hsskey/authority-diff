export function EmptyState({ title, message }: { title: string; message: string }) {
  return (
    <div className="panel" role="status">
      <p className="state-message">
        <strong>{title}</strong>
      </p>
      <p className="state-message">{message}</p>
    </div>
  );
}
