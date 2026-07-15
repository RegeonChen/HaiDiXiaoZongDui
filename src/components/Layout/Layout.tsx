/**
 * 三栏布局（Mercury 风格 + 拖拽）
 *
 *  ┌────────────────────────────────────────────────────────────┐
 *  │ ⊞   聚合拾遗                              [icons...] [search] │
 *  ├─────────┬────────────┬─────────────────────────────────────┤
 *  │ Feeds   │ Articles   │ Reader                              │
 *  └─────────┴────────────┴─────────────────────────────────────┘
 *     ←─drag─→   ←─drag─→
 *
 * 三栏宽度：百分比 + 拖拽手柄实时调整 + localStorage 持久化
 */
import { ReactNode, useCallback, useRef } from 'react';
import { ThemeToggle } from '../ThemeToggle/ThemeToggle';
import { OpmlButtons } from '../OpmlButtons/OpmlButtons';
import { ResizeHandle } from '../ResizeHandle/ResizeHandle';
import './Layout.css';

export interface LayoutProps {
  feedsSlot: ReactNode;
  articlesSlot: ReactNode;
  readerSlot: ReactNode;
  /** 顶栏：feed 操作 + 主题 */
  onAddFeed?: () => void;
  onOpmlImport?: () => Promise<{
    ok: boolean;
    message: string;
    result?: { feedsImported: number; feedsSkipped: number; errors: string[] } | null;
  }>;
  onOpmlExport?: () => Promise<{ ok: boolean; message: string }>;
  /** 三栏宽度（百分比） */
  sidebarPercent: number;
  listPercent: number;
  onResizeSidebar: (percent: number) => void;
  onResizeList: (percent: number) => void;
}

export function Layout({
  feedsSlot,
  articlesSlot,
  readerSlot,
  onAddFeed,
  onOpmlImport,
  onOpmlExport,
  sidebarPercent,
  listPercent,
  onResizeSidebar,
  onResizeList
}: LayoutProps) {
  // 拖拽用：ref 到 main 容器，取真实宽度
  const mainRef = useRef<HTMLElement>(null);

  // 拖拽 sidebar 时，sidebar% 改而 list% 跟着反向变（总和保持）
  const handleSidebarDrag = useCallback(
    (deltaPx: number) => {
      const total = mainRef.current?.clientWidth ?? 0;
      if (total === 0) return;
      const deltaPercent = (deltaPx / total) * 100;
      const next = Math.max(10, Math.min(40, sidebarPercent + deltaPercent));
      onResizeSidebar(next);
    },
    [sidebarPercent, onResizeSidebar]
  );

  const handleListDrag = useCallback(
    (deltaPx: number) => {
      const total = mainRef.current?.clientWidth ?? 0;
      if (total === 0) return;
      const deltaPercent = (deltaPx / total) * 100;
      const next = Math.max(15, Math.min(50, listPercent + deltaPercent));
      onResizeList(next);
    },
    [listPercent, onResizeList]
  );

  // 阅读区宽度 = 100% - sidebar - list
  const readerPercent = Math.max(20, 100 - sidebarPercent - listPercent);

  return (
    <div className="app-layout">
      <header className="app-header">
        <div className="app-header__left">
          <span className="app-header__logo" aria-hidden="true">📚</span>
          <h1 className="app-header__title">聚合拾遗</h1>
          <span className="app-header__phase">Phase 2.5</span>
        </div>
        <div className="app-header__right">
          {onAddFeed && (
            <button
              type="button"
              className="app-header__add-btn"
              onClick={onAddFeed}
              title="添加订阅源"
            >
              + 添加订阅源
            </button>
          )}
          {onOpmlImport && onOpmlExport && (
            <OpmlButtons onImport={onOpmlImport} onExport={onOpmlExport} />
          )}
          <ThemeToggle />
        </div>
      </header>

      <main
        ref={mainRef}
        className="app-main"
        style={{
          gridTemplateColumns: `${sidebarPercent}% 4px ${listPercent}% 4px ${readerPercent}%`
        }}
      >
        <aside className="pane pane-feeds">{feedsSlot}</aside>
        <ResizeHandle onDrag={handleSidebarDrag} ariaLabel="调整订阅源栏宽度" />
        <section className="pane pane-list">{articlesSlot}</section>
        <ResizeHandle onDrag={handleListDrag} ariaLabel="调整文章列表宽度" />
        <section className="pane pane-reader">{readerSlot}</section>
      </main>
    </div>
  );
}
