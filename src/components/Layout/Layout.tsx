/**
 * IDE 风格应用工作台
 *
 * 阅读页保留三栏拖拽；设置、标签、文摘等二级页面只替换中央工作区，
 * Activity Bar 与订阅源侧栏保持在同一应用上下文中。
 */
import { ReactNode, useCallback, useRef } from 'react';
import { ThemeToggle } from '../ThemeToggle/ThemeToggle';
import { OpmlButtons } from '../OpmlButtons/OpmlButtons';
import { ResizeHandle } from '../ResizeHandle/ResizeHandle';
import './Layout.css';

export type AppPage = 'reader' | 'general' | 'ai' | 'tags' | 'notes' | 'digests' | 'topics' | 'logs' | 'opml-export';

export interface LayoutProps {
  feedsSlot: ReactNode;
  articlesSlot: ReactNode;
  readerSlot: ReactNode;
  onAddFeed?: () => void;
  onSyncAll?: () => void;
  syncing?: boolean;
  onOpmlImport?: () => Promise<{
    ok: boolean;
    message: string;
    result?: { feedsImported: number; feedsSkipped: number; errors: string[] } | null;
  }>;
  onOpmlExport?: () => Promise<{ ok: boolean; message: string }>;
  sidebarPercent: number;
  listPercent: number;
  onResizeSidebar: (percent: number) => void;
  onResizeList: (percent: number) => void;
  currentPage: AppPage;
  onPageChange: (page: AppPage) => void;
  pageSlot?: ReactNode;
  searchSlot?: ReactNode;
  /** Phase 4.2.1：订阅源侧栏可见性与持久化切换。 */
  sidebarVisible?: boolean;
  onToggleSidebar?: () => void;
  sidebarToggleTitle?: string;
}

type WorkbenchIconName =
  | 'reader'
  | 'general'
  | 'ai'
  | 'tags'
  | 'notes'
  | 'digests'
  | 'topics'
  | 'logs'
  | 'export';

function WorkbenchIcon({
  name,
  navigation = false
}: {
  name: WorkbenchIconName;
  navigation?: boolean;
}) {
  if (name === 'ai') {
    return (
      <strong
        className="workbench-icon workbench-icon--ai app-header__nav-icon--ai"
        aria-hidden="true"
        data-testid={navigation ? 'app-header__nav-icon-ai' : undefined}
      >
        AI
      </strong>
    );
  }

  if (name === 'topics') {
    return (
      <svg
        className="workbench-icon app-header__nav-icon--topics"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        data-testid={navigation ? 'app-header__nav-icon-topics' : undefined}
      >
        <circle cx="5" cy="6" r="1.8" fill="currentColor" stroke="none" />
        <circle cx="5" cy="18" r="1.8" fill="currentColor" stroke="none" />
        <circle cx="19" cy="12" r="2.2" fill="currentColor" stroke="none" />
        <path d="m6.7 6.8 10.2 4.3" />
        <path d="m6.7 17.2 10.2-4.3" />
      </svg>
    );
  }

  const paths: Record<Exclude<WorkbenchIconName, 'ai' | 'topics'>, ReactNode> = {
    reader: (
      <>
        <path d="M4 5.5h16v13H4z" />
        <path d="M4 8.5h16M8 8.5v10" />
      </>
    ),
    general: (
      <>
        <circle cx="12" cy="12" r="3.2" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.86 2.86-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21h-4v-.1A1.7 1.7 0 0 0 8.6 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.86-2.86.06-.06A1.7 1.7 0 0 0 4.2 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H2.4v-4h.1A1.7 1.7 0 0 0 4.2 8.6a1.7 1.7 0 0 0-.34-1.88l-.06-.06L6.66 3.8l.06.06A1.7 1.7 0 0 0 8.6 4.2a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1v-.1h4v.1a1.7 1.7 0 0 0 1 1.7 1.7 1.7 0 0 0 1.88-.34l.06-.06 2.86 2.86-.06.06A1.7 1.7 0 0 0 19.4 8.6a1.7 1.7 0 0 0 .6 1 1.7 1.7 0 0 0 1.1.4h.1v4h-.1a1.7 1.7 0 0 0-1.7 1z" />
      </>
    ),
    tags: <path d="M5 8h14M4 16h14M9 3 7 21M17 3l-2 18" />,
    notes: (
      <>
        <path d="M5 3.5h10l4 4V21H5z" />
        <path d="M15 3.5V8h4M8 12h8M8 16h6" />
      </>
    ),
    digests: (
      <>
        <path d="M6 5h14v15H6zM3 8v12h14" />
        <path d="M9 9h8M9 13h8M9 17h5" />
      </>
    ),
    logs: (
      <>
        <path d="M5 4h14v16H5zM8 8h8M8 12h8M8 16h5" />
      </>
    ),
    export: (
      <>
        <path d="M12 3v12M8 11l4 4 4-4" />
        <path d="M5 17v4h14v-4" />
      </>
    )
  };

  return (
    <svg
      className="workbench-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
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
  searchSlot,
  sidebarVisible = true,
  onToggleSidebar,
  sidebarToggleTitle
}: LayoutProps) {
  const mainRef = useRef<HTMLElement>(null);
  const sidebarRef = useRef(sidebarPercent);
  sidebarRef.current = sidebarPercent;
  const listRef = useRef(listPercent);
  listRef.current = listPercent;

  const handleSidebarDrag = useCallback(
    (deltaPx: number) => {
      const total = mainRef.current?.clientWidth ?? 0;
      if (total === 0) return;
      const deltaPercent = (deltaPx / total) * 100;
      const maxSidebar = Math.min(40, 80 - listRef.current);
      onResizeSidebar(Math.max(10, Math.min(maxSidebar, sidebarRef.current + deltaPercent)));
    },
    [onResizeSidebar]
  );

  const handleListDrag = useCallback(
    (deltaPx: number) => {
      const total = mainRef.current?.clientWidth ?? 0;
      if (total === 0) return;
      const deltaPercent = (deltaPx / total) * 100;
      const maxList = Math.min(50, 80 - sidebarRef.current);
      onResizeList(Math.max(15, Math.min(maxList, listRef.current + deltaPercent)));
    },
    [onResizeList]
  );

  const readerPercent = 100 - sidebarPercent - listPercent;
  const gridTemplateColumns = sidebarVisible
    ? `${sidebarPercent}fr 4px ${listPercent}fr 4px ${readerPercent}fr`
    : `${listPercent}fr 4px ${readerPercent}fr`;

  // 顺序保持不变，兼容既有 UI smoke。
  const navItems: Array<{ id: AppPage; label: string; icon: WorkbenchIconName; title: string }> = [
    { id: 'general', label: '通用设置', icon: 'general', title: '通用设置' },
    { id: 'ai', label: 'AI 设置', icon: 'ai', title: 'AI Provider 与默认值' },
    { id: 'tags', label: '标签管理', icon: 'tags', title: '标签管理' },
    { id: 'notes', label: '笔记', icon: 'notes', title: '笔记' },
    { id: 'digests', label: '文摘', icon: 'digests', title: '文摘整理与导出' },
    { id: 'topics', label: '专题', icon: 'topics', title: '专题追踪' },
    { id: 'logs', label: '本地日志', icon: 'logs', title: '本地日志' }
  ];

  const pageMeta = currentPage === 'opml-export'
    ? { label: '导出 OPML', icon: 'export' as WorkbenchIconName }
    : navItems.find((item) => item.id === currentPage);

  return (
    <div className="app-layout">
      <header className="app-header">
        <div className="app-header__left">
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
          <div className="app-header__identity">
            <h1 className="app-header__title">聚合拾遗</h1>
            {currentPage !== 'reader' && (
              <>
                <span className="app-header__crumb-separator" aria-hidden="true">/</span>
                <span className="app-header__crumb">{pageMeta?.label}</span>
              </>
            )}
          </div>
          {onToggleSidebar && (
            <button
              type="button"
              className={`app-header__sidebar-toggle ${sidebarVisible ? '' : 'is-hidden'}`}
              onClick={onToggleSidebar}
              title={sidebarToggleTitle ?? (sidebarVisible ? '隐藏左栏' : '显示左栏')}
              aria-label={sidebarToggleTitle ?? (sidebarVisible ? '隐藏左栏' : '显示左栏')}
              aria-pressed={!sidebarVisible}
              data-testid="app-header__sidebar-toggle"
            >
              {sidebarVisible ? '◀' : '▶'}
            </button>
          )}
        </div>
        <div className="app-header__right">
          {searchSlot && <div className="app-header__search">{searchSlot}</div>}
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
              {syncing ? '同步中…' : '同步文章'}
            </button>
          )}
          {currentPage === 'reader' && onOpmlImport && onOpmlExport && (
            <OpmlButtons onImport={onOpmlImport} onExport={onOpmlExport} />
          )}
          <ThemeToggle />
        </div>
      </header>

      <div className="app-workbench">
        <aside className="activity-bar" aria-label="功能导航">
          <button
            type="button"
            className={`activity-bar__reader ${currentPage === 'reader' ? 'is-active' : ''}`}
            onClick={() => onPageChange('reader')}
            title="阅读工作区"
            aria-current={currentPage === 'reader' ? 'page' : undefined}
          >
            <WorkbenchIcon name="reader" />
            <span className="activity-bar__label">阅读</span>
          </button>
          <div className="activity-bar__separator" />
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
                data-page-key={item.id}
              >
                <span className="app-header__nav-icon" aria-hidden="true">
                  <WorkbenchIcon name={item.icon} navigation />
                </span>
                <span className="app-header__nav-label">{item.label}</span>
              </button>
            ))}
          </nav>
        </aside>

        {currentPage === 'reader' ? (
          <main
            ref={mainRef}
            className={`app-main ${sidebarVisible ? '' : 'is-sidebar-hidden'}`}
            style={{ gridTemplateColumns }}
          >
            {sidebarVisible && <aside className="pane pane-feeds">{feedsSlot}</aside>}
            {sidebarVisible && (
              <ResizeHandle onDrag={handleSidebarDrag} ariaLabel="调整订阅源栏宽度" />
            )}
            <section className="pane pane-list">{articlesSlot}</section>
            <ResizeHandle onDrag={handleListDrag} ariaLabel="调整文章列表宽度" />
            <section className="pane pane-reader">{readerSlot}</section>
          </main>
        ) : (
          <div className={`app-secondary ${sidebarVisible ? '' : 'is-sidebar-hidden'}`}>
            {sidebarVisible && (
              <aside className="pane pane-feeds app-secondary__sidebar">{feedsSlot}</aside>
            )}
            <main className="app-page" data-page={currentPage}>
              <div className="app-page__tabbar" role="tablist" aria-label="工作区标签页">
                <div className="app-page__tab is-active" role="tab" aria-selected="true">
                  {pageMeta && <WorkbenchIcon name={pageMeta.icon} />}
                  <span className="app-page__tab-label">{pageMeta?.label ?? '工作区'}</span>
                  <button
                    type="button"
                    className="app-page__tab-close"
                    onClick={() => onPageChange('reader')}
                    title="关闭并返回阅读"
                    aria-label={`关闭${pageMeta?.label ?? '当前页'}`}
                  >
                    ×
                  </button>
                </div>
              </div>
              <div className="app-page__toolbar">
                <div className="app-page__heading">
                  {pageMeta && <WorkbenchIcon name={pageMeta.icon} />}
                  <span>{pageMeta?.label ?? '工作区'}</span>
                </div>
                <span className="app-page__context">聚合拾遗工作区</span>
              </div>
              <div className="app-page__content">{pageSlot}</div>
            </main>
          </div>
        )}
      </div>
    </div>
  );
}
