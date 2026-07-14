/**
 * 添加订阅源对话框
 *
 *  - 单一 URL 输入
 *  - idle / submitting / error 三态
 *  - 成功后由父组件刷新 feed 列表
 */
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import './AddFeedDialog.css';

export interface AddFeedDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (url: string) => Promise<{ ok: boolean; message: string }>;
}

type State = 'idle' | 'submitting' | 'error';

export function AddFeedDialog({ open, onClose, onSubmit }: AddFeedDialogProps) {
  const [url, setUrl] = useState('');
  const [state, setState] = useState<State>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  // 打开时重置
  useEffect(() => {
    if (open) {
      setUrl('');
      setState('idle');
      setErrorMsg('');
    }
  }, [open]);

  // Esc 关闭
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && state !== 'submitting') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, state]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) {
      setState('error');
      setErrorMsg('请输入订阅源 URL');
      return;
    }
    if (!/^https?:\/\//i.test(trimmed)) {
      setState('error');
      setErrorMsg('URL 必须以 http:// 或 https:// 开头');
      return;
    }
    setState('submitting');
    setErrorMsg('');
    const r = await onSubmit(trimmed);
    if (r.ok) {
      // 父组件负责 refresh + 关闭 dialog
      onClose();
    } else {
      setState('error');
      setErrorMsg(r.message);
    }
  };

  const dialog = (
    <div className="add-feed-dialog__backdrop" onClick={() => state !== 'submitting' && onClose()}>
      <form
        className="add-feed-dialog"
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
        aria-modal="true"
        role="dialog"
        aria-label="添加订阅源"
      >
        <h2 className="add-feed-dialog__title">添加订阅源</h2>
        <p className="add-feed-dialog__hint">粘贴 RSS / Atom / JSON Feed 的 URL，应用会自动解析并拉取文章。</p>

        <label className="add-feed-dialog__label" htmlFor="add-feed-url">
          Feed URL
        </label>
        <input
          id="add-feed-url"
          type="url"
          className="add-feed-dialog__input"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com/feed.xml"
          autoFocus
          disabled={state === 'submitting'}
          spellCheck={false}
          autoComplete="off"
        />

        {state === 'error' && errorMsg && (
          <p className="add-feed-dialog__error" role="alert">
            {errorMsg}
          </p>
        )}

        <div className="add-feed-dialog__actions">
          <button
            type="button"
            className="add-feed-dialog__btn add-feed-dialog__btn--ghost"
            onClick={onClose}
            disabled={state === 'submitting'}
          >
            取消
          </button>
          <button
            type="submit"
            className="add-feed-dialog__btn add-feed-dialog__btn--primary"
            disabled={state === 'submitting' || !url.trim()}
          >
            {state === 'submitting' ? '添加中…' : '添加'}
          </button>
        </div>
      </form>
    </div>
  );

  return createPortal(dialog, document.body);
}
