export function LoadingState({ label = '불러오는 중' }: { label?: string }) {
  return (
    <div className="panel" role="status" aria-live="polite">
      <p className="state-message">{label}</p>
      <div className="skeleton" aria-hidden="true" />
    </div>
  );
}
