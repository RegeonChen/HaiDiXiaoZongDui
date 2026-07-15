/**
 * 三栏之间的拖拽手柄
 *
 *  - 4px 宽、1px 可见 + 3px 透明热区
 *  - hover 时背景变灰
 *  - 拖拽时 cursor col-resize，body cursor 同步
 */
import { useCallback } from 'react';
import './ResizeHandle.css';

export interface ResizeHandleProps {
  onDrag: (deltaPx: number) => void;
  ariaLabel: string;
}

export function ResizeHandle({ onDrag, ariaLabel }: ResizeHandleProps) {
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const prevBodyCursor = document.body.style.cursor;
      const prevBodyUserSelect = document.body.style.userSelect;
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';

      let lastX = startX;
      const onMove = (ev: MouseEvent) => {
        const delta = ev.clientX - lastX;
        lastX = ev.clientX;
        onDrag(delta);
      };

      const onUp = () => {
        document.body.style.cursor = prevBodyCursor;
        document.body.style.userSelect = prevBodyUserSelect;
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    },
    [onDrag]
  );

  return (
    <div
      className="resize-handle"
      role="separator"
      aria-orientation="vertical"
      aria-label={ariaLabel}
      onMouseDown={handleMouseDown}
    />
  );
}
