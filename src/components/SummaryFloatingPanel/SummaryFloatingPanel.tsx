/**
 * SummaryFloatingPanel — 摘要悬浮窗（Phase 3.5.1 张晨阳）
 *
 *  - 可拖拽（标题栏 mousedown + mousemove + mouseup）
 *  - 可调大小（8 个边框 handle + 角 handle）
 *  - 边界检测：拖出 viewport 自动回弹到视口内
 *  - 最小 300×200px
 *  - 关闭按钮
 *  - 内容：Loading（"Waiting for AI response…"）→ Markdown 渲染后的摘要
 *  - 持久化：位置 + 大小存 localStorage（per user 全局一份）
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import './SummaryFloatingPanel.css';

export interface SummaryFloatingPanelProps {
  open: boolean;
  onClose: () => void;
  /** 摘要内容；空字符串表示 loading */
  content: string;
  /** 加载中标记（让"Waiting for AI response…" 一直显示直到 AI 返回） */
  loading: boolean;
}

const MIN_WIDTH = 300;
const MIN_HEIGHT = 200;
const STORAGE_KEY = 'juhe-shivi.summary-panel.position';

interface PersistedRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function loadPersistedRect(): PersistedRect | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedRect;
    if (
      typeof parsed.x === 'number' &&
      typeof parsed.y === 'number' &&
      typeof parsed.width === 'number' &&
      typeof parsed.height === 'number'
    ) {
      return parsed;
    }
  } catch {
    // ignore corrupted storage
  }
  return null;
}

function savePersistedRect(rect: PersistedRect): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rect));
  } catch {
    // ignore quota / private mode
  }
}

function getViewportSize(): { w: number; h: number } {
  return { w: window.innerWidth, h: window.innerHeight };
}

/** clamp rect 到视口内（不缩放，只挪位置） */
function clampToViewport(rect: PersistedRect): PersistedRect {
  const { w, h } = getViewportSize();
  const maxX = Math.max(0, w - MIN_WIDTH);
  const maxY = Math.max(0, h - MIN_HEIGHT);
  return {
    x: Math.max(0, Math.min(rect.x, maxX)),
    y: Math.max(0, Math.min(rect.y, maxY)),
    width: Math.max(MIN_WIDTH, Math.min(rect.width, w)),
    height: Math.max(MIN_HEIGHT, Math.min(rect.height, h))
  };
}

function getDefaultRect(): PersistedRect {
  const { w, h } = getViewportSize();
  const width = Math.min(560, Math.max(MIN_WIDTH, w - 80));
  const height = Math.min(420, Math.max(MIN_HEIGHT, h - 120));
  return {
    x: Math.round((w - width) / 2),
    y: Math.round((h - height) / 2),
    width,
    height
  };
}

type ResizeEdge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

export function SummaryFloatingPanel({ open, onClose, content, loading }: SummaryFloatingPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<PersistedRect | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const resizeRef = useRef<{ edge: ResizeEdge; startX: number; startY: number; orig: PersistedRect } | null>(
    null
  );

  // 初始化位置（从 localStorage 读取，clamp 到视口内）
  useEffect(() => {
    if (!open) return;
    const persisted = loadPersistedRect();
    if (persisted) {
      setRect(clampToViewport(persisted));
    } else {
      setRect(getDefaultRect());
    }
  }, [open]);

  // viewport 缩放时重新 clamp
  useEffect(() => {
    if (!open) return;
    const handler = () => {
      setRect((prev) => (prev ? clampToViewport(prev) : prev));
    };
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, [open]);

  // 持久化（rect 变化时）
  useEffect(() => {
    if (!open || !rect) return;
    savePersistedRect(rect);
  }, [open, rect]);

  // Esc 关闭
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // 拖拽
  const handleTitleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!rect) return;
      // 只响应左键
      if (e.button !== 0) return;
      // 防止误选文本
      e.preventDefault();
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        origX: rect.x,
        origY: rect.y
      };
    },
    [rect]
  );

  // resize
  const handleResizeMouseDown = useCallback(
    (edge: ResizeEdge) => (e: React.MouseEvent) => {
      if (!rect) return;
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      resizeRef.current = {
        edge,
        startX: e.clientX,
        startY: e.clientY,
        orig: { ...rect }
      };
    },
    [rect]
  );

  // 全局 mousemove + mouseup（绑定到 document，避免快速拖出 panel 丢事件）
  useEffect(() => {
    if (!open) return;

    const onMove = (e: MouseEvent) => {
      if (dragRef.current) {
        const dx = e.clientX - dragRef.current.startX;
        const dy = e.clientY - dragRef.current.startY;
        setRect((prev) => {
          if (!prev) return prev;
          return clampToViewport({
            ...prev,
            x: dragRef.current!.origX + dx,
            y: dragRef.current!.origY + dy
          });
        });
        return;
      }
      if (resizeRef.current) {
        const dx = e.clientX - resizeRef.current.startX;
        const dy = e.clientY - resizeRef.current.startY;
        const { edge, orig } = resizeRef.current;
        setRect((prev) => {
          if (!prev) return prev;
          let { x, y, width, height } = orig;
          if (edge.includes('e')) width = Math.max(MIN_WIDTH, orig.width + dx);
          if (edge.includes('s')) height = Math.max(MIN_HEIGHT, orig.height + dy);
          if (edge.includes('w')) {
            const newWidth = Math.max(MIN_WIDTH, orig.width - dx);
            x = orig.x + (orig.width - newWidth);
            width = newWidth;
          }
          if (edge.includes('n')) {
            const newHeight = Math.max(MIN_HEIGHT, orig.height - dy);
            y = orig.y + (orig.height - newHeight);
            height = newHeight;
          }
          return clampToViewport({ x, y, width, height });
        });
      }
    };

    const onUp = () => {
      dragRef.current = null;
      resizeRef.current = null;
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, [open]);

  if (!open || !rect) return null;

  return (
    <div
      ref={panelRef}
      className="summary-floating-panel"
      role="dialog"
      aria-label="AI 摘要"
      aria-modal="false"
      data-testid="summary-floating-panel"
      style={{
        left: `${rect.x}px`,
        top: `${rect.y}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`
      }}
    >
      <div
        className="summary-floating-panel__titlebar"
        onMouseDown={handleTitleMouseDown}
        data-testid="summary-floating-panel__titlebar"
      >
        <span className="summary-floating-panel__title-icon" aria-hidden="true">✨</span>
        <span className="summary-floating-panel__title">AI 摘要</span>
        <button
          type="button"
          className="summary-floating-panel__close"
          onClick={onClose}
          title="关闭（Esc）"
          aria-label="关闭摘要"
          data-testid="summary-floating-panel__close"
        >
          ×
        </button>
      </div>

      <div className="summary-floating-panel__body">
        {loading || !content ? (
          <div className="summary-floating-panel__loading" data-testid="summary-floating-panel__loading">
            <div className="summary-floating-panel__spinner" aria-hidden="true" />
            <p>Waiting for AI response…</p>
          </div>
        ) : (
          <div
            className="summary-floating-panel__content"
            data-testid="summary-floating-panel__content"
            dangerouslySetInnerHTML={{ __html: content }}
          />
        )}
      </div>

      <div className="summary-floating-panel__statusbar">
        <span className="summary-floating-panel__hint">拖动标题栏移动 · 拖动边框调整大小 · Esc 关闭</span>
        <span className="summary-floating-panel__size">
          {rect.width}×{rect.height}
        </span>
      </div>

      {/* 8 个 resize handle */}
      {(['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'] as ResizeEdge[]).map((edge) => (
        <div
          key={edge}
          className={`summary-floating-panel__resize summary-floating-panel__resize--${edge}`}
          onMouseDown={handleResizeMouseDown(edge)}
          data-resize={edge}
        />
      ))}
    </div>
  );
}
