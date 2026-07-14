/**
 * 简单 toast —— 底部居中，自动消失
 */
import { useEffect } from 'react';
import './Toast.css';

export interface ToastItem {
  id: number;
  message: string;
  kind: 'info' | 'error' | 'success';
}

export function Toast({ items, onDismiss }: {
  items: ToastItem[];
  onDismiss: (id: number) => void;
}) {
  return (
    <div className="toast-container" role="status" aria-live="polite">
      {items.map((t) => (
        <ToastEntry key={t.id} item={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function ToastEntry({ item, onDismiss }: { item: ToastItem; onDismiss: (id: number) => void }) {
  useEffect(() => {
    const t = setTimeout(() => onDismiss(item.id), 3500);
    return () => clearTimeout(t);
  }, [item.id, onDismiss]);
  return (
    <div className={`toast toast--${item.kind}`}>
      {item.message}
    </div>
  );
}
