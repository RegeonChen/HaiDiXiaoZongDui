/**
 * 简单右键菜单
 *  - show(x, y, items) 打开
 *  - 点外面 / Esc 关闭
 */
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import './ContextMenu.css';

export interface ContextMenuItem {
  label: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
  /** 设为 'separator' 显示为分隔线（label 会被忽略） */
  separator?: boolean;
}

interface MenuState {
  x: number;
  y: number;
  items: ContextMenuItem[];
}

let externalShow: ((x: number, y: number, items: ContextMenuItem[]) => void) | null = null;

export function showContextMenu(x: number, y: number, items: ContextMenuItem[]): void {
  externalShow?.(x, y, items);
}

export function ContextMenuHost() {
  const [state, setState] = useState<MenuState | null>(null);

  useEffect(() => {
    externalShow = (x, y, items) => setState({ x, y, items });
    return () => {
      externalShow = null;
    };
  }, []);

  useEffect(() => {
    if (!state) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setState(null);
    };
    const onScroll = () => setState(null);
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [state]);

  if (!state) return null;

  // 避免超出窗口
  const maxX = window.innerWidth - 180;
  const maxY = window.innerHeight - 40;
  const x = Math.min(state.x, maxX);
  const y = Math.min(state.y, maxY);

  return createPortal(
    <div
      className="context-menu__backdrop"
      onClick={() => setState(null)}
      onContextMenu={(e) => {
        e.preventDefault();
        setState(null);
      }}
    >
      <div
        className="context-menu"
        style={{ left: x, top: y }}
        onClick={(e) => e.stopPropagation()}
      >
        {state.items.map((item, idx) =>
          item.separator ? (
            <div key={idx} className="context-menu__separator" role="separator" />
          ) : (
            <button
              key={idx}
              type="button"
              className={`context-menu__item ${item.danger ? 'is-danger' : ''}`}
              disabled={item.disabled}
              onClick={() => {
                setState(null);
                item.onClick();
              }}
            >
              {item.label}
            </button>
          )
        )}
      </div>
    </div>,
    document.body
  );
}
