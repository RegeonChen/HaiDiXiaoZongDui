/**
 * 通用确认对话框
 *  - Promise 风格：open() 返 true / false（点确认 / 取消 / 关闭）
 *  - 用 useImperativeHandle / forwardRef 在父组件调用
 *
 * Phase 2.5.1 用作删除订阅源二次确认
 */
import { forwardRef, useImperativeHandle, useState } from 'react';
import { createPortal } from 'react-dom';
import './ConfirmDialog.css';

export interface ConfirmDialogOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** 危险操作（删除等）— 红色按钮 */
  danger?: boolean;
}

export interface ConfirmDialogHandle {
  open: (options: ConfirmDialogOptions) => Promise<boolean>;
}

export const ConfirmDialog = forwardRef<ConfirmDialogHandle>((_, ref) => {
  const [state, setState] = useState<{
    options: ConfirmDialogOptions;
    resolve: (value: boolean) => void;
  } | null>(null);

  useImperativeHandle(ref, () => ({
    open: (options) =>
      new Promise<boolean>((resolve) => {
        setState({ options, resolve });
      })
  }));

  if (!state) return null;
  const { options } = state;
  const isDanger = options.danger === true;
  const confirmLabel = options.confirmLabel ?? '确认';
  const cancelLabel = options.cancelLabel ?? '取消';

  const close = (result: boolean) => {
    state.resolve(result);
    setState(null);
  };

  return createPortal(
    <div className="confirm-dialog__backdrop" onClick={() => close(false)}>
      <div
        className="confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-label={options.title}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="confirm-dialog__title">{options.title}</h2>
        <p className="confirm-dialog__message">{options.message}</p>
        <div className="confirm-dialog__actions">
          <button
            type="button"
            className="confirm-dialog__btn confirm-dialog__btn--ghost"
            onClick={() => close(false)}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`confirm-dialog__btn ${isDanger ? 'confirm-dialog__btn--danger' : 'confirm-dialog__btn--primary'}`}
            onClick={() => close(true)}
            autoFocus
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
});

ConfirmDialog.displayName = 'ConfirmDialog';
