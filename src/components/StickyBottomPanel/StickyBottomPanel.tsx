/**
 * StickyBottomPanel — 文章阅读区粘性底部面板（Phase 3.5.x 整合）
 *
 *  - 多个 panel（标签管理 / 标签建议 / 笔记）整合到一个粘性底部
 *  - 高度可拖拽拉伸（顶栏 mousedown + document mousemove/up）
 *  - 收起按钮（折叠到底部一个标签条）
 *  - tab 切换：标签管理 / 标签建议 / 笔记
 *  - 持久化高度到 localStorage
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import './StickyBottomPanel.css';

export interface StickyTab {
  id: string;
  label: string;
  icon: string;
  /** badge 数字（可选）：例如已应用的 tag 数 */
  badge?: number;
}

export interface StickyBottomPanelProps {
  /** 当前打开的 tab id（null = 面板完全收起） */
  activeTab: string | null;
  tabs: StickyTab[];
  onTabChange: (id: string) => void;
  onClose: () => void;
  /** tab id -> 渲染内容 */
  renderContent: (tabId: string) => React.ReactNode;
}

const DEFAULT_HEIGHT = 280;
const MIN_HEIGHT = 120;
const MAX_HEIGHT_RATIO = 0.7; // 视口 70%
const STORAGE_KEY = 'juhe-shivi.sticky-panel.height';

function loadPersistedHeight(): number | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const n = Number(raw);
    if (Number.isFinite(n) && n >= MIN_HEIGHT) return n;
  } catch {
    // ignore
  }
  return null;
}

function savePersistedHeight(h: number): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(h));
  } catch {
    // ignore
  }
}

function getMaxHeight(): number {
  return Math.floor(window.innerHeight * MAX_HEIGHT_RATIO);
}

export function StickyBottomPanel({
  activeTab,
  tabs,
  onTabChange,
  onClose,
  renderContent
}: StickyBottomPanelProps) {
  const [height, setHeight] = useState<number>(() => loadPersistedHeight() ?? DEFAULT_HEIGHT);
  const dragRef = useRef<{ startY: number; startH: number } | null>(null);

  // 持久化
  useEffect(() => {
    savePersistedHeight(height);
  }, [height]);

  // viewport 变化时 clamp
  useEffect(() => {
    const handler = () => setHeight((prev) => Math.min(prev, getMaxHeight()));
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  // 拖拽拉伸
  const handleDragStart = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      dragRef.current = { startY: e.clientY, startH: height };
      // document 全局监听
      const onMove = (ev: MouseEvent) => {
        if (!dragRef.current) return;
        // 鼠标向上拖 → 高度增加
        const dy = dragRef.current.startY - ev.clientY;
        const newH = Math.max(MIN_HEIGHT, Math.min(getMaxHeight(), dragRef.current.startH + dy));
        setHeight(newH);
      };
      const onUp = () => {
        dragRef.current = null;
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    },
    [height]
  );

  if (activeTab === null) {
    // 完全收起：只显示底部 tab 条（让用户能展开）
    return (
      <div className="sticky-bottom-panel sticky-bottom-panel--collapsed" data-sticky-state="collapsed">
        <div className="sticky-bottom-panel__collapsed-bar">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              className="sticky-bottom-panel__tab"
              onClick={() => onTabChange(t.id)}
              title={`展开 ${t.label}`}
              data-sticky-tab={t.id}
            >
              <span className="sticky-bottom-panel__tab-icon" aria-hidden="true">{t.icon}</span>
              <span className="sticky-bottom-panel__tab-label">{t.label}</span>
              {t.badge !== undefined && t.badge > 0 && (
                <span className="sticky-bottom-panel__tab-badge">{t.badge}</span>
              )}
            </button>
          ))}
        </div>
      </div>
    );
  }

  const activeTabMeta = tabs.find((t) => t.id === activeTab);

  return (
    <div
      className="sticky-bottom-panel"
      data-sticky-state="open"
      data-sticky-tab={activeTab}
      style={{ height: `${height}px` }}
    >
      {/* 拖拽手柄 + 顶栏 */}
      <div
        className="sticky-bottom-panel__handle"
        onMouseDown={handleDragStart}
        data-testid="sticky-bottom-panel__handle"
        role="separator"
        aria-orientation="horizontal"
        title="拖动调整高度"
      >
        <div className="sticky-bottom-panel__handle-grip" aria-hidden="true" />
      </div>

      <div className="sticky-bottom-panel__header">
        <div className="sticky-bottom-panel__tabs" role="tablist">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={t.id === activeTab}
              className={`sticky-bottom-panel__tab ${t.id === activeTab ? 'is-active' : ''}`}
              onClick={() => onTabChange(t.id)}
              data-sticky-tab={t.id}
            >
              <span className="sticky-bottom-panel__tab-icon" aria-hidden="true">{t.icon}</span>
              <span className="sticky-bottom-panel__tab-label">{t.label}</span>
              {t.badge !== undefined && t.badge > 0 && (
                <span className="sticky-bottom-panel__tab-badge">{t.badge}</span>
              )}
            </button>
          ))}
        </div>
        <div className="sticky-bottom-panel__header-actions">
          <span className="sticky-bottom-panel__height-hint">
            {activeTabMeta?.icon} {activeTabMeta?.label} · {height}px
          </span>
          <button
            type="button"
            className="sticky-bottom-panel__btn sticky-bottom-panel__btn--close"
            onClick={onClose}
            title="收起（关闭当前 tab，可重新展开）"
            aria-label="收起面板"
            data-testid="sticky-bottom-panel__close"
          >
            ▾ 收起
          </button>
        </div>
      </div>

      <div className="sticky-bottom-panel__body" data-testid="sticky-bottom-panel__body">
        {renderContent(activeTab)}
      </div>
    </div>
  );
}
