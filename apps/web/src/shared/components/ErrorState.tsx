export function ErrorState({ title, message }: { title: string; message: string }) {
  return (
    <div className="panel status-error" role="alert">
      <p className="state-message">
        <strong>{title}</strong>
      </p>
      <p className="state-message">{message}</p>
    </div>
  );
}
