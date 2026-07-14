import './StatusView.css';

export function EmptyView({
  title,
  hint,
  action
}: {
  title: string;
  hint?: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="status-view">
      <p className="status-title">{title}</p>
      {hint && <p className="status-hint">{hint}</p>}
      {action && (
        <button className="status-action" onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </div>
  );
}
