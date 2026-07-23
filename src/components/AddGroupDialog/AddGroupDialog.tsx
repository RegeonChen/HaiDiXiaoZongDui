/**
 * 添加订阅源组对话框
 *
 *  - 单一文本输入（组名）
 *  - idle / error 两态（不涉及后端 IO，立即关闭）
 *  - 组名去重：已存在同名组时直接报错
 *  - Esc / 点击 backdrop 关闭
 */
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import './AddGroupDialog.css';

export interface AddGroupDialogProps {
  open: boolean;
  existingGroups: string[];
  onClose: () => void;
  onSubmit: (name: string) => { ok: boolean; message: string };
}

type State = 'idle' | 'error';

export function AddGroupDialog({ open, existingGroups, onClose, onSubmit }: AddGroupDialogProps) {
  const [name, setName] = useState('');
  const [state, setState] = useState<State>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (open) {
      setName('');
      setState('idle');
      setErrorMsg('');
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setState('error');
      setErrorMsg('请输入组名');
      return;
    }
    if (trimmed.length > 32) {
      setState('error');
      setErrorMsg('组名不能超过 32 个字符');
      return;
    }
    if (existingGroups.some((g) => g.toLowerCase() === trimmed.toLowerCase())) {
      setState('error');
      setErrorMsg(`已存在同名组「${trimmed}」`);
      return;
    }
    const r = onSubmit(trimmed);
    if (r.ok) {
      onClose();
      return;
    }
    setState('error');
    setErrorMsg(r.message);
  };

  const dialog = (
    <div className="add-group-dialog__backdrop" onClick={onClose}>
      <form
        className="add-group-dialog"
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
        aria-modal="true"
        role="dialog"
        aria-label="添加订阅源组"
      >
        <h2 className="add-group-dialog__title">添加订阅源组</h2>
        <p className="add-group-dialog__hint">
          给订阅源分组归类。组名可以是任意文本（如「技术」「资讯」）。
        </p>

        <label className="add-group-dialog__label" htmlFor="add-group-name">
          组名
        </label>
        <input
          id="add-group-name"
          type="text"
          className="add-group-dialog__input"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (state === 'error') {
              setState('idle');
              setErrorMsg('');
            }
          }}
          placeholder="例如：技术"
          autoFocus
          maxLength={32}
          spellCheck={false}
          autoComplete="off"
          data-testid="add-group-input"
        />

        {state === 'error' && errorMsg && (
          <p className="add-group-dialog__error" role="alert">
            {errorMsg}
          </p>
        )}

        <div className="add-group-dialog__actions">
          <button
            type="button"
            className="add-group-dialog__btn add-group-dialog__btn--ghost"
            onClick={onClose}
          >
            取消
          </button>
          <button
            type="submit"
            className="add-group-dialog__btn add-group-dialog__btn--primary"
            disabled={!name.trim()}
            data-testid="add-group-submit"
          >
            添加
          </button>
        </div>
      </form>
    </div>
  );

  return createPortal(dialog, document.body);
}
