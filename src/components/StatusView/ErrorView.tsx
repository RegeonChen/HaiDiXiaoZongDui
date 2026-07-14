import './StatusView.css';

export function ErrorView({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="status-view status-error" role="alert">
      <p className="status-title">出错了</p>
      <p className="status-hint">{message}</p>
      {onRetry && (
        <button className="status-action" onClick={onRetry}>
          重试
        </button>
      )}
    </div>
  );
}
