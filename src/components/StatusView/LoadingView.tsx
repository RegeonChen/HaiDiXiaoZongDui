import './StatusView.css';

export function LoadingView({ message = '正在加载…' }: { message?: string }) {
  return (
    <div className="status-view" role="status" aria-live="polite">
      <div className="spinner" aria-hidden="true" />
      <p className="status-message">{message}</p>
    </div>
  );
}
