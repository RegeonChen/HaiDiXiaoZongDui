/**
 * 三栏布局（Mercury 风格 + 拖拽 + 页面入口）
 *
 *  ┌────────────────────────────────────────────────────────────┐
 *  │ ⊞   聚合拾遗   [⚙ # ✎ ☷ ★ 📋] [icons...] [search]         │
 *  ├─────────┬────────────┬─────────────────────────────────────┤
 *  │ Feeds   │ Articles   │ Reader                              │
 *  └─────────┴────────────┴─────────────────────────────────────┘
 *     ←─drag─→   ←─drag─→
 *
 * 三栏宽度：百分比 + 拖拽手柄实时调整 + localStorage 持久化
 * 页面切换：currentPage = 'reader' 显示三栏；其他显示对应 page
 */
import { ReactNode, useCallback, useRef } from 'react';
import { ThemeToggle } from '../ThemeToggle/ThemeToggle';
import { OpmlButtons } from '../OpmlButtons/OpmlButtons';
import { ResizeHandle } from '../ResizeHandle/ResizeHandle';
import './Layout.css';

export type AppPage = 'reader' | 'general' | 'ai' | 'tags' | 'notes' | 'digests' | 'topics' | 'logs';

export interface LayoutProps {
  feedsSlot: ReactNode;
  articlesSlot: ReactNode;
  readerSlot: ReactNode;
  /** 顶栏：feed 操作 + 同步 + 主题 */
  onAddFeed?: () => void;
  onSyncAll?: () => void;
  syncing?: boolean;
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
  /** 当前页面（Phase 3 Integration 6 个 pages + reader） */
  currentPage: AppPage;
  onPageChange: (page: AppPage) => void;
  /** 页面渲染插槽（reader 之外的页面） */
  pageSlot?: ReactNode;
  /** Phase 3.4.4.3：顶栏搜索槽 */
  searchSlot?: ReactNode;
}

export function Layout({
  feedsSlot,
  articlesSlot,
  readerSlot,
  onAddFeed,
  onSyncAll,
  syncing = false,
  onOpmlImport,
  onOpmlExport,
  sidebarPercent,
  listPercent,
  onResizeSidebar,
  onResizeList,
  currentPage,
  onPageChange,
  pageSlot,
  searchSlot
}: LayoutProps) {
  // 拖拽用：ref 到 main 容器，取真实宽度
  const mainRef = useRef<HTMLElement>(null);

  // 用 ref 存当前值以避免 mousemove 闭包过期（stale closure）导致拖拽抖动
  const sidebarRef = useRef(sidebarPercent);
  sidebarRef.current = sidebarPercent;
  const listRef = useRef(listPercent);
  listRef.current = listPercent;

  // 拖拽 sidebar 时，sidebar% 改而 list% 跟着反向变（总和保持）
  const handleSidebarDrag = useCallback(
    (deltaPx: number) => {
      const total = mainRef.current?.clientWidth ?? 0;
      if (total === 0) return;
      const deltaPercent = (deltaPx / total) * 100;
      // 为阅读区保留至少 20%，避免 sidebar + list + reader 超过 100%。
      const maxSidebar = Math.min(40, 80 - listRef.current);
      const next = Math.max(10, Math.min(maxSidebar, sidebarRef.current + deltaPercent));
      onResizeSidebar(next);
    },
    [onResizeSidebar]
  );

  const handleListDrag = useCallback(
    (deltaPx: number) => {
      const total = mainRef.current?.clientWidth ?? 0;
      if (total === 0) return;
      const deltaPercent = (deltaPx / total) * 100;
      const maxList = Math.min(50, 80 - sidebarRef.current);
      const next = Math.max(15, Math.min(maxList, listRef.current + deltaPercent));
      onResizeList(next);
    },
    [onResizeList]
  );

  // 阅读区宽度 = 100% - sidebar - list
  const readerPercent = 100 - sidebarPercent - listPercent;

  // Mercury 风格顶栏入口：icon-only + tooltip
  // Phase 3.4.4.4：nav 7 项 — general 弹窗 / ai 子页面 / 5 个原 page
  const navItems: Array<{ id: AppPage; label: string; icon: string; title: string; opensModal?: boolean }> = [
    { id: 'general', label: '通用', icon: '⚙', title: '通用设置（语言 / 字体 / 视觉 / 字号 / 阅读宽度）', opensModal: true },
    { id: 'ai', label: 'AI', icon: '✨', title: 'AI 设置（Provider / 默认值）' },
    { id: 'tags', label: '标签', icon: '#', title: '标签管理' },
    { id: 'notes', label: '笔记', icon: '✎', title: '笔记' },
    { id: 'digests', label: '文摘', icon: '☷', title: '文摘导出' },
    { id: 'topics', label: '专题', icon: '★', title: '专题演化图（时间 / 发展方向 / 来源文章）' },
    { id: 'logs', label: '日志', icon: '☰', title: '本地日志' }
  ];

  return (
    <div className="app-layout">
      <header className="app-header">
        <div className="app-header__left">
          {/* Mercury 风格：左侧 4 块网格图标，hover 提示项目名 */}
          <button
            type="button"
            className="app-header__logo-btn"
            onClick={() => onPageChange('reader')}
            title="聚合拾遗 — 回到阅读"
            aria-label="回到阅读"
          >
            <svg
              className="app-header__logo-svg"
              viewBox="0 0 16 16"
              width="14"
              height="14"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <rect x="2" y="2" width="5" height="5" rx="0.5" />
              <rect x="9" y="2" width="5" height="5" rx="0.5" />
              <rect x="2" y="9" width="5" height="5" rx="0.5" />
              <rect x="9" y="9" width="5" height="5" rx="0.5" />
            </svg>
          </button>
          <h1 className="app-header__title">聚合拾遗</h1>
        </div>
        <div className="app-header__right">
          {/* 页面切换（Phase 3 Integration 新增） */}
          {searchSlot && <div className="app-header__search">{searchSlot}</div>}
          <nav className="app-header__nav" aria-label="页面导航">
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`app-header__nav-btn ${currentPage === item.id ? 'is-active' : ''}`}
                onClick={() => onPageChange(item.id)}
                title={item.title}
                aria-current={currentPage === item.id ? 'page' : undefined}
                data-page={item.id}
              >
                <span className="app-header__nav-icon" aria-hidden="true">{item.icon}</span>
                <span className="app-header__nav-label">{item.label}</span>
              </button>
            ))}
          </nav>

          {currentPage === 'reader' && onAddFeed && (
            <button
              type="button"
              className="app-header__add-btn"
              onClick={onAddFeed}
              title="添加订阅源"
            >
              + 添加订阅源
            </button>
          )}
          {currentPage === 'reader' && onSyncAll && (
            <button
              type="button"
              className="app-header__sync-btn"
              onClick={onSyncAll}
              disabled={syncing}
            >
              {syncing ? '⏳ 同步中…' : '🔄 同步文章'}
            </button>
          )}
          {currentPage === 'reader' && onOpmlImport && onOpmlExport && (
            <OpmlButtons onImport={onOpmlImport} onExport={onOpmlExport} />
          )}
          <ThemeToggle />
        </div>
      </header>

      {currentPage === 'reader' ? (
        <main
          ref={mainRef}
          className="app-main"
          style={{
            gridTemplateColumns: `${sidebarPercent}fr 4px ${listPercent}fr 4px ${readerPercent}fr`
          }}
        >
          <aside className="pane pane-feeds">{feedsSlot}</aside>
          <ResizeHandle onDrag={handleSidebarDrag} ariaLabel="调整订阅源栏宽度" />
          <section className="pane pane-list">{articlesSlot}</section>
          <ResizeHandle onDrag={handleListDrag} ariaLabel="调整文章列表宽度" />
          <section className="pane pane-reader">{readerSlot}</section>
        </main>
      ) : (
        <main className="app-page" data-page={currentPage}>
          {/* Phase 3.4.4.1：6 page 顶部"← 返回阅读"按钮 + 当前页标题 */}
          <div className="app-page__header">
            <button
              type="button"
              className="app-page__back-btn"
              onClick={() => onPageChange('reader')}
              title="返回阅读主界面"
            >
              ← 返回阅读
            </button>
            <span className="app-page__title">
              {navItems.find((n) => n.id === currentPage)?.label ?? ''}
            </span>
          </div>
          {pageSlot}
        </main>
      )}
    </div>
  );
}
