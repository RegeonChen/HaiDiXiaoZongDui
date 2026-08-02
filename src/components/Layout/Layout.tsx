/**
 * IDE 式应用工作台。
 *
 * 固定顺序：竖向功能栏 / 一级订阅源目录 / 二级文章目录 / 灵活窗口。
 * 只有最右灵活窗口切换标签和内容，前两级目录始终保持原位。
 */
import { ReactNode, SyntheticEvent, useCallback, useRef } from 'react';
import { ThemeToggle } from '../ThemeToggle/ThemeToggle';
import { ResizeHandle } from '../ResizeHandle/ResizeHandle';
import './Layout.css';

export type AppPage = 'reader' | 'settings' | 'tags' | 'notes' | 'digests' | 'topics' | 'opml-export';

export type WorkbenchIconName =
  | 'reader'
  | 'article'
  | 'settings'
  | 'ai'
  | 'tags'
  | 'notes'
  | 'digests'
  | 'topics'
  | 'export';

export interface WorkbenchTab {
  id: string;
  label: string;
  page: AppPage;
  articleId?: string;
  icon: WorkbenchIconName;
  closeable?: boolean;
  /** 普通单击打开的临时标签；双击后固定。 */
  preview?: boolean;
}

export type DirectoryMode = 'both' | 'secondary' | 'none';

export function nextDirectoryMode(mode: DirectoryMode): DirectoryMode {
  if (mode === 'both') return 'secondary';
  if (mode === 'secondary') return 'none';
  return 'both';
}

export interface LayoutProps {
  sidebarSlot: ReactNode;
  articlesSlot: ReactNode;
  readerSlot: ReactNode;
  sidebarPercent: number;
  listPercent: number;
  onResizeSidebar: (percent: number) => void;
  onResizeList: (percent: number) => void;
  currentPage: AppPage;
  onPageChange: (page: AppPage) => void;
  pageSlot?: ReactNode;
  searchSlot?: ReactNode;
  tabs: WorkbenchTab[];
  activeTabId: string;
  onTabSelect: (tabId: string) => void;
  onTabPin: (tabId: string) => void;
  onTabClose: (tabId: string) => void;
  aiDockOpen: boolean;
  aiAvailable: boolean;
  onToggleAiDock: () => void;
  onOpenSettings: () => void;
  directoryMode: DirectoryMode;
  onReaderAction: () => void;
  /** 预览窗口内发生实际操作时，将当前标签固定。 */
  onEditorInteraction: () => void;
}

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
    article: (
      <>
        <path d="M6 3.5h9l3 3V21H6z" />
        <path d="M15 3.5V7h3M9 11h6M9 15h6M9 18h4" />
      </>
    ),
    settings: (
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
  sidebarSlot,
  articlesSlot,
  readerSlot,
  sidebarPercent,
  listPercent,
  onResizeSidebar,
  onResizeList,
  currentPage,
  onPageChange,
  pageSlot,
  searchSlot,
  tabs,
  activeTabId,
  onTabSelect,
  onTabPin,
  onTabClose,
  aiDockOpen,
  aiAvailable,
  onToggleAiDock,
  onOpenSettings,
  directoryMode,
  onReaderAction,
  onEditorInteraction
}: LayoutProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLElement>(null);
  const sidebarRef = useRef(sidebarPercent);
  sidebarRef.current = sidebarPercent;
  const listRef = useRef(listPercent);
  listRef.current = listPercent;

  const handleSidebarDrag = useCallback(
    (deltaPx: number) => {
      const total = contentRef.current?.clientWidth ?? 0;
      if (total === 0) return;
      onResizeSidebar(Math.max(12, Math.min(36, sidebarRef.current + (deltaPx / total) * 100)));
    },
    [onResizeSidebar]
  );

  const handleListDrag = useCallback(
    (deltaPx: number) => {
      const total = editorRef.current?.clientWidth ?? 0;
      if (total === 0) return;
      const readerPercent = 100 - sidebarRef.current - listRef.current;
      const editorTotal = Math.max(1, listRef.current + readerPercent);
      const deltaRelative = (deltaPx / total) * editorTotal;
      onResizeList(Math.max(16, Math.min(48, listRef.current + deltaRelative)));
    },
    [onResizeList]
  );

  const handleEditorInteraction = useCallback((event: SyntheticEvent<HTMLElement>) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    // 标签条负责切换、关闭和显式双击固定，不应把普通标签切换误判为内容操作。
    if (target.closest('.app-page__tabbar')) return;
    if (!target.closest(
      'button, a[href], input, select, textarea, [contenteditable="true"], ' +
      '[role="button"], [role="menuitem"], [role="option"], [role="separator"]'
    )) return;
    onEditorInteraction();
  }, [onEditorInteraction]);

  const sidebarVisible = directoryMode === 'both';
  const articleDirectoryVisible = directoryMode !== 'none';
  const readerPercent = Math.max(20, 100 - sidebarPercent - listPercent);
  const contentColumns = sidebarVisible
    ? `minmax(218px, ${sidebarPercent}fr) 4px minmax(0, ${100 - sidebarPercent}fr)`
    : 'minmax(0, 1fr)';
  const editorColumns = articleDirectoryVisible
    ? `minmax(260px, ${listPercent}fr) 4px minmax(320px, ${readerPercent}fr)`
    : 'minmax(0, 1fr)';
  const readerActionTitle = currentPage !== 'reader'
    ? '回到阅读工作区'
    : directoryMode === 'both'
      ? '收起一级目录'
      : directoryMode === 'secondary'
        ? '收起二级目录'
        : '展开一级和二级目录';

  const navItems: Array<{ id: AppPage; label: string; icon: WorkbenchIconName; title: string }> = [
    { id: 'tags', label: '标签', icon: 'tags', title: '标签管理' },
    { id: 'notes', label: '笔记', icon: 'notes', title: '文章笔记' },
    { id: 'digests', label: '文摘', icon: 'digests', title: '文摘整理与导出' },
    { id: 'topics', label: '专题', icon: 'topics', title: '专题追踪' }
  ];

  return (
    <div className="app-layout">
      <header className="app-header">
        {searchSlot && <div className="app-header__search">{searchSlot}</div>}

        {/* 保留 .app-header__left 空容器作为未来扩展位 + 窄屏布局占位 */}
        <div className="app-header__left" aria-hidden="true" />

        <div className="app-header__right">
          <button
            type="button"
            className={`app-header__tool-btn app-header__ai-btn ${aiDockOpen ? 'is-active' : ''}`}
            onClick={onToggleAiDock}
            disabled={!aiAvailable}
            title={aiAvailable ? (aiDockOpen ? '关闭 AI 助手' : '打开 AI 助手') : '先打开一篇文章'}
            aria-label={aiDockOpen ? '关闭 AI 助手' : '打开 AI 助手'}
            aria-pressed={aiDockOpen}
            data-testid="app-header__ai"
          >
            <WorkbenchIcon name="ai" navigation />
          </button>
          <button
            type="button"
            className={`app-header__tool-btn ${currentPage === 'settings' ? 'is-active' : ''}`}
            onClick={onOpenSettings}
            title="设置"
            aria-label="打开设置"
            data-testid="app-header__settings"
          >
            <WorkbenchIcon name="settings" />
          </button>
          <ThemeToggle />
        </div>
      </header>

      <div className="app-workbench">
        <aside className="activity-bar" aria-label="功能导航">
          <button
            type="button"
            className={`activity-bar__reader ${currentPage === 'reader' ? 'is-active' : ''}`}
            onClick={onReaderAction}
            title={readerActionTitle}
            aria-label={readerActionTitle}
            aria-current={currentPage === 'reader' ? 'page' : undefined}
            data-directory-mode={directoryMode}
            data-page-key="reader"
          >
            <WorkbenchIcon name="reader" />
            <span className="activity-bar__label">阅读</span>
          </button>
          <div className="activity-bar__separator" />
          <nav className="app-header__nav" aria-label="内容工具">
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

        <div
          ref={contentRef}
          className={`app-workbench__content ${sidebarVisible ? '' : 'is-sidebar-hidden'} ${articleDirectoryVisible ? '' : 'is-list-hidden'}`}
          data-directory-mode={directoryMode}
          style={{ gridTemplateColumns: contentColumns }}
        >
          {sidebarVisible && <aside className="pane pane-feeds">{sidebarSlot}</aside>}
          {sidebarVisible && <ResizeHandle onDrag={handleSidebarDrag} ariaLabel="调整左侧栏宽度" />}

          <main
            ref={editorRef}
            className={`app-main ${sidebarVisible ? '' : 'is-sidebar-hidden'} ${articleDirectoryVisible ? '' : 'is-list-hidden'}`}
            style={{ gridTemplateColumns: editorColumns }}
          >
            {articleDirectoryVisible && <section className="pane pane-list">{articlesSlot}</section>}
            {articleDirectoryVisible && <ResizeHandle onDrag={handleListDrag} ariaLabel="调整文章列表宽度" />}

            <section
              className="app-editor pane pane-reader"
              onClickCapture={handleEditorInteraction}
              onFocusCapture={handleEditorInteraction}
              onChange={handleEditorInteraction}
              onSubmit={onEditorInteraction}
            >
              {tabs.length > 0 && (
                <div className="app-page__tabbar" role="tablist" aria-label="工作区标签页">
                  {tabs.map((tab) => {
                    const active = tab.id === activeTabId;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        className={`app-page__tab ${active ? 'is-active' : ''} ${tab.preview ? 'is-preview' : ''}`}
                        role="tab"
                        aria-selected={active}
                        onClick={() => onTabSelect(tab.id)}
                        onDoubleClick={() => onTabPin(tab.id)}
                        data-tab-id={tab.id}
                        data-preview={tab.preview ? 'true' : 'false'}
                        title={tab.preview ? '预览标签；双击固定' : undefined}
                      >
                        <WorkbenchIcon name={tab.icon} />
                        <span className="app-page__tab-label" title={tab.label}>{tab.label}</span>
                        {tab.closeable && (
                          <span
                            className="app-page__tab-close"
                            role="button"
                            tabIndex={0}
                            aria-label={`关闭${tab.label}`}
                            title={`关闭${tab.label}`}
                            onDoubleClick={(event) => event.stopPropagation()}
                            onClick={(event) => {
                              event.stopPropagation();
                              onTabClose(tab.id);
                            }}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault();
                                event.stopPropagation();
                                onTabClose(tab.id);
                              }
                            }}
                          >
                            ×
                          </span>
                        )}
                      </button>
                    );
                  })}
                  <div className="app-page__tabbar-spacer" />
                </div>
              )}

              {currentPage === 'reader' ? (
                readerSlot
              ) : (
                <section className="app-page" data-page={currentPage}>
                  <div className="app-page__content">{pageSlot}</div>
                </section>
              )}
            </section>
          </main>
        </div>
      </div>
    </div>
  );
}
