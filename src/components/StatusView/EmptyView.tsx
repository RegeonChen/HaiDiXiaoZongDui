import type { ReactNode } from 'react';
import './StatusView.css';

export function EmptyView({
  title,
  hint,
  action,
  className
}: {
  title: string;
  hint?: ReactNode;
  action?: { label: string; onClick: () => void };
  className?: string;
}) {
  return (
    <div className={`status-view${className ? ` ${className}` : ''}`}>
      <p className="status-title">{title}</p>
      {hint && <p className="status-hint">{hint}</p>}
      {action && (
        <button type="button" className="status-action" onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </div>
  );
}
