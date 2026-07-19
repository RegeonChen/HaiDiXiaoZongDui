/**
 * App 入口
 * Task 2.1 + Phase 2.5.1 + Phase 3 Integration
 *
 * 数据流：FullDataSource 抽象 → feeds / articles / content / tag / note / digest / topic / ai / settings / log
 * 状态：useSelection（feedId / articleId）、usePaneWidths（三栏宽度）、currentPage（页面切换）
 *
 * Phase 2.5.1：删除订阅源、OPML 导入自动同步、三栏拖拽
 * Phase 3 Integration：
 *  - 顶栏 6 个页面入口（设置/标签/笔记/文摘/专题/日志）
 *  - SettingsPage 含 AI Provider、字体/视觉主题、多语言
 *  - ArticleReader 接入 AI 工具栏（摘要/翻译/标签建议/笔记/专题）
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Article, Feed } from '@shared/types';
import { useDataSource } from './context/DataSourceContext';
import { useSelection } from './hooks/useSelection';
import { usePaneWidths } from './hooks/usePaneWidths';
import { ThemeProvider } from './hooks/useTheme';
import { Layout, type AppPage } from './components/Layout/Layout';
import { FeedList } from './components/FeedList/FeedList';
import { ArticleList } from './components/ArticleList/ArticleList';
import { ArticleReader } from './components/ArticleReader/ArticleReader';
import { AddFeedDialog } from './components/AddFeedDialog/AddFeedDialog';
import { Toast, type ToastItem } from './components/Toast/Toast';
import { ConfirmDialog, type ConfirmDialogHandle } from './components/ConfirmDialog/ConfirmDialog';
import { ContextMenuHost } from './components/ContextMenu/ContextMenu';
import { SearchBar } from './components/SearchBar/SearchBar';
import { LoadingView } from './components/StatusView/LoadingView';
import { ErrorView } from './components/StatusView/ErrorView';
import { SettingsPage } from './pages/SettingsPage/SettingsPage';
import { TagsPage } from './pages/TagsPage/TagsPage';
import { NotesPage } from './pages/NotesPage/NotesPage';
import { DigestsPage } from './pages/DigestsPage/DigestsPage';
import { TopicsPage } from './pages/TopicsPage/TopicsPage';
import { LogsPage } from './pages/LogsPage/LogsPage';
import { GeneralSettingsModal } from './components/GeneralSettingsModal/GeneralSettingsModal';
import './index.css';

type FeedsState =
  | { kind: 'loading' }
  | { kind: 'ready'; data: Feed[] }
  | { kind: 'error'; error: string };

type ArticlesState =
  | { kind: 'loading' }
  | { kind: 'ready'; data: Article[] }
  | { kind: 'error'; error: string };

export function App() {
  const ds = useDataSource();
  const { selection, selectFeed, selectArticle } = useSelection();
  const { widths, setSidebar, setList } = usePaneWidths();

  const [currentPage, setCurrentPage] = useState<AppPage>('reader');
  // Phase 3.4.4.4：通用设置弹窗（独立 state，不走 page 切换）
  const [generalModalOpen, setGeneralModalOpen] = useState(false);
  const [feedsState, setFeedsState] = useState<FeedsState>({ kind: 'loading' });
  const [articlesState, setArticlesState] = useState<ArticlesState>({ kind: 'loading' });
  const [allArticlesState, setAllArticlesState] = useState<ArticlesState>({ kind: 'loading' });
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const toastIdRef = useRef(0);
  const confirmRef = useRef<ConfirmDialogHandle>(null);

  // Phase 3.6.3：数据库精确计数
  const [counts, setCounts] = useState<{ all: number; unread: number; starred: number }>({ all: 0, unread: 0, starred: 0 });
  // Phase 3.6.2：同步进度（两态：进行中 / 完成；完成后 3 秒自动消失）
  type SyncProgress =
    | { kind: 'progress'; feedName: string; completed: number; total: number; okCount: number; failCount: number }
    | { kind: 'done'; total: number; okCount: number; failCount: number };
  const [syncingProgress, setSyncingProgress] = useState<SyncProgress | null>(null);
  const [failedFeedIds, setFailedFeedIds] = useState<string[]>([]);
  // Phase 3.6.2：3 秒延迟清理计时器 ref
  const syncDoneTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pushToast = useCallback((message: string, kind: ToastItem['kind'] = 'info') => {
    toastIdRef.current += 1;
    const id = toastIdRef.current;
    setToasts((prev) => [...prev, { id, message, kind }]);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // 拉 feeds
  const refreshFeeds = useCallback(async () => {
    setFeedsState({ kind: 'loading' });
    const result = await ds.feeds();
    if (result.kind === 'ready') {
      setFeedsState({ kind: 'ready', data: result.data });
    } else if (result.kind === 'error') {
      setFeedsState({ kind: 'error', error: result.error });
    } else {
      setFeedsState({ kind: 'ready', data: [] });
    }
  }, [ds]);

  // 拉 articles
  const refreshArticles = useCallback(
    async (filter: { feedId?: string; isRead?: boolean; isStarred?: boolean }) => {
      setArticlesState({ kind: 'loading' });
      const result = await ds.articles(filter);
      if (result.kind === 'ready') {
        setArticlesState({ kind: 'ready', data: result.data });
      } else if (result.kind === 'error') {
        setArticlesState({ kind: 'error', error: result.error });
      } else {
        setArticlesState({ kind: 'ready', data: [] });
      }
    },
    [ds]
  );

  // Phase 3.6.3：刷新侧栏精确计数
  const refreshCounts = useCallback(async () => {
    const r = await ds.articleCounts();
    if (r.kind === 'ready') {
      setCounts(r.data);
    }
  }, [ds]);

  // 初次拉取 feeds + 全部文章（侧栏计数）
  useEffect(() => {
    void refreshFeeds();
    void refreshCounts();
    void (async () => {
      const result = await ds.articles({});
      if (result.kind === 'ready') {
        setAllArticlesState({ kind: 'ready', data: result.data });
      } else {
        setAllArticlesState({ kind: 'ready', data: [] });
      }
    })();
  }, [refreshFeeds, ds]);

  // 当 feed 选择变化时拉取对应文章
  useEffect(() => {
    if (selection.feedId === 'all') {
      void refreshArticles({});
    } else if (selection.feedId === 'unread') {
      void refreshArticles({ isRead: false });
    } else if (selection.feedId === 'starred') {
      void refreshArticles({ isStarred: true });
    } else {
      void refreshArticles({ feedId: selection.feedId });
    }
  }, [selection.feedId, refreshArticles]);

  // 监听外部 refresh 信号
  useEffect(() => {
    const handler = () => {
      void refreshFeeds();
      void refreshCounts();
      void (async () => {
        const r = await ds.articles({});
        if (r.kind === 'ready') setAllArticlesState({ kind: 'ready', data: r.data });
      })();
    };
    window.addEventListener('juhe:refresh', handler);
    return () => window.removeEventListener('juhe:refresh', handler);
  }, [refreshFeeds, refreshCounts, ds]);

  // Phase 3.6.2：组件卸载时清理进度条延迟计时器
  useEffect(() => {
    return () => {
      if (syncDoneTimerRef.current !== null) {
        clearTimeout(syncDoneTimerRef.current);
        syncDoneTimerRef.current = null;
      }
    };
  }, []);

  const feeds = feedsState.kind === 'ready' ? feedsState.data : [];
  const articles = articlesState.kind === 'ready' ? articlesState.data : [];
  const allArticles = allArticlesState.kind === 'ready' ? allArticlesState.data : [];

  const selectedArticle = useMemo<Article | null>(() => {
    if (!selection.articleId) return null;
    return articles.find((a) => a.id === selection.articleId) ?? null;
  }, [articles, selection.articleId]);

  const selectedFeed = useMemo<Feed | null>(() => {
    if (!selectedArticle) return null;
    return feeds.find((f) => f.id === selectedArticle.feedId) ?? null;
  }, [feeds, selectedArticle]);

  const filterLabel = useMemo(() => {
    if (selection.feedId === 'all') return '所有订阅源';
    if (selection.feedId === 'unread') return '未读';
    if (selection.feedId === 'starred') return '星标文章';
    const f = feeds.find((x) => x.id === selection.feedId);
    return f?.siteTitle || f?.title || '未知';
  }, [feeds, selection.feedId]);

  const handleSelectArticle = useCallback(
    (id: string) => {
      selectArticle(id);
      const a = articles.find((x) => x.id === id);
      if (a && !a.isRead) {
        void ds.markRead(id, true);
        setArticlesState((prev) => {
          if (prev.kind !== 'ready') return prev;
          return {
            kind: 'ready',
            data: prev.data.map((x) => (x.id === id ? { ...x, isRead: true } : x))
          };
        });
        setAllArticlesState((prev) => {
          if (prev.kind !== 'ready') return prev;
          return {
            kind: 'ready',
            data: prev.data.map((x) => (x.id === id ? { ...x, isRead: true } : x))
          };
        });
        void refreshCounts();
      }
    },
    [articles, ds, selectArticle, refreshCounts]
  );

  const handleToggleStar = useCallback(
    (id: string, isStarred: boolean) => {
      void ds.markStarred(id, isStarred);
      const updateList = (prev: ArticlesState): ArticlesState => {
        if (prev.kind !== 'ready') return prev;
        return { kind: 'ready', data: prev.data.map((x) => (x.id === id ? { ...x, isStarred } : x)) };
      };
      setArticlesState(updateList);
      setAllArticlesState(updateList);
      void refreshCounts();
    },
    [ds, refreshCounts]
  );

  // 添加订阅源
  const handleAddFeed = useCallback(
    async (url: string) => {
      const created = await ds.createFeed(url, url);
      if (created.kind !== 'ready') {
        return { ok: false, message: created.kind === 'error' ? created.error : '创建失败' };
      }
      const feed = created.data;
      selectFeed(feed.id);
      await refreshFeeds();
      pushToast(`已添加「${feed.title || url}」，正在后台同步…`, 'info');

      void (async () => {
        try {
          const sync = await ds.syncFeed(feed.id);
          if (sync.ok) {
            pushToast(`「${feed.title || url}」同步完成`, 'success');
          } else {
            pushToast(`「${feed.title || url}」同步失败：${sync.message}`, 'error');
          }
          await refreshFeeds();
          const result = await ds.articles({});
          if (result.kind === 'ready') {
            setAllArticlesState({ kind: 'ready', data: result.data });
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : '未知错误';
          pushToast(`「${feed.title || url}」同步失败：${message}`, 'error');
        }
      })();

      return { ok: true, message: '已添加，正在后台同步' };
    },
    [ds, pushToast, refreshFeeds, selectFeed]
  );

  // 同步全部（Phase 3.6.2：进度反馈 + 完成后 3 秒延迟消失）
  const handleSyncAll = useCallback(async () => {
    if (syncing) return;
    setSyncing(true);
    // 清理上一次完成态的延迟计时器（避免快速重复同步时计时器泄漏）
    if (syncDoneTimerRef.current !== null) {
      clearTimeout(syncDoneTimerRef.current);
      syncDoneTimerRef.current = null;
    }
    setSyncingProgress(null);
    const failedIds: string[] = [];
    let okCount = 0;
    let failCount = 0;
    const total = feeds.length;

    if (total === 0) {
      pushToast('没有可同步的订阅源', 'info');
      setSyncing(false);
      return;
    }

    try {
      for (let i = 0; i < feeds.length; i++) {
        const f = feeds[i];
        setSyncingProgress({
          kind: 'progress',
          feedName: f.siteTitle || f.title || f.url,
          completed: i + 1,
          total,
          okCount,
          failCount
        });
        const r = await ds.syncFeed(f.id);
        if (r.ok) okCount += 1;
        else { failCount += 1; failedIds.push(f.id); }
      }
      // Phase 3.6.2：完成态保留 3 秒让用户看到结果，PLAN 明确要求
      setSyncingProgress({ kind: 'done', total, okCount, failCount });
      setFailedFeedIds(failedIds);
      await refreshFeeds();
      const result = await ds.articles({});
      if (result.kind === 'ready') {
        setAllArticlesState({ kind: 'ready', data: result.data });
      }
      void refreshCounts();

      if (failCount === 0) {
        pushToast(`同步完成：${okCount}/${total} 成功`, 'success');
      } else {
        pushToast(`同步部分完成：成功 ${okCount}，失败 ${failCount}。未成功同步的订阅源已用红点标出`, 'error');
      }

      // 3 秒后清空进度条
      syncDoneTimerRef.current = setTimeout(() => {
        setSyncingProgress(null);
        syncDoneTimerRef.current = null;
      }, 3000);
    } catch (e) {
      setSyncingProgress(null);
      pushToast(`同步出错：${String(e)}`, 'error');
    } finally {
      setSyncing(false);
    }
  }, [syncing, feeds, ds, refreshFeeds, refreshCounts, pushToast]);

  // 删除订阅源
  const handleDeleteFeed = useCallback(
    async (feed: Feed) => {
      // Phase 3.4.1.6：用 allArticles 统计真正的文章数（不受当前筛选影响）
      const articleCount = allArticles.filter((a) => a.feedId === feed.id).length;
      const ok = await confirmRef.current?.open({
        title: '删除订阅源',
        message: `确定要删除「${feed.siteTitle || feed.title}」？此操作会同时删除其全部 ${articleCount} 篇文章，无法撤销。`,
        confirmLabel: '删除',
        cancelLabel: '取消',
        danger: true
      });
      if (!ok) return;
      try {
        const api = (window as unknown as { api?: { feed?: { delete: (id: string) => Promise<{ success: boolean; error?: { message: string } }> } } }).api;
        if (!api?.feed?.delete) {
          pushToast('当前模式不支持删除', 'error');
          return;
        }
        const r = await api.feed.delete(feed.id);
        if (!r.success) {
          pushToast(`删除失败：${r.error?.message ?? '未知错误'}`, 'error');
          return;
        }
        if (selection.feedId === feed.id) {
          selectFeed('all');
        }
        await refreshFeeds();
        const result = await ds.articles({});
        if (result.kind === 'ready') {
          setAllArticlesState({ kind: 'ready', data: result.data });
        }
        void refreshCounts();
        pushToast(`已删除「${feed.siteTitle || feed.title}」`, 'success');
      } catch (e) {
        pushToast(`删除失败：${String(e)}`, 'error');
      }
    },
    [articles, ds, pushToast, refreshFeeds, refreshCounts, selectFeed, selection.feedId]
  );

  // OPML 导入
  const handleOpmlImport = useCallback(async () => {
    const api = (window as unknown as { api?: { opml?: { import: () => Promise<{ success: boolean; data?: { feedsImported: number; feedsSkipped: number; errors: string[] } | null; error?: { message: string } }> } } }).api;
    if (!api?.opml?.import) {
      pushToast('当前模式不支持 OPML 操作', 'error');
      return { ok: false, message: 'no-opml' };
    }
    const r = await api.opml.import();
    if (!r.success) {
      pushToast(`OPML 导入失败：${r.error?.message ?? '未知错误'}`, 'error');
      return { ok: false, message: r.error?.message ?? 'failed' };
    }
    if (r.data === null || r.data === undefined) {
      return { ok: true, message: '已取消', result: null };
    }
    const { feedsImported, feedsSkipped, errors } = r.data;
    if (errors.length > 0) {
      pushToast(`OPML 导入完成：新增 ${feedsImported}，跳过 ${feedsSkipped}，错误 ${errors.length}`, 'error');
    } else if (feedsImported === 0 && feedsSkipped > 0) {
      pushToast(`OPML 全部跳过（已存在）：${feedsSkipped} 个`, 'info');
    } else {
      pushToast(`OPML 导入成功：新增 ${feedsImported}，跳过 ${feedsSkipped}`, 'success');
    }
    await refreshFeeds();
    const result = await ds.articles({});
    if (result.kind === 'ready') {
      setAllArticlesState({ kind: 'ready', data: result.data });
    }

    if (feedsImported > 0) {
      pushToast(`开始同步 ${feedsImported} 个新订阅源…`, 'info');
      const allFeedsResp = await ds.feeds();
      if (allFeedsResp.kind === 'ready') {
        const newFeeds = allFeedsResp.data.filter((f) => f.lastSyncAt === null || !f.lastSyncSuccess);
        let okCount = 0;
        let failCount = 0;
        for (let i = 0; i < newFeeds.length; i += 1) {
          const f = newFeeds[i];
          const r2 = await ds.syncFeed(f.id);
          if (r2.ok) okCount += 1;
          else failCount += 1;
        }
        if (failCount === 0) {
          pushToast(`自动同步完成：${okCount}/${newFeeds.length} 成功`, 'success');
        } else {
          pushToast(`自动同步部分失败：成功 ${okCount}，失败 ${failCount}`, 'error');
        }
        await refreshFeeds();
        const result2 = await ds.articles({});
        if (result2.kind === 'ready') {
          setAllArticlesState({ kind: 'ready', data: result2.data });
        }
      }
    }

    return { ok: true, message: 'done', result: r.data };
  }, [ds, pushToast, refreshFeeds]);

  const handleOpmlExport = useCallback(async () => {
    const api = (window as unknown as { api?: { opml?: { export: () => Promise<{ success: boolean; data?: boolean; error?: { message: string } }> } } }).api;
    if (!api?.opml?.export) {
      pushToast('当前模式不支持 OPML 操作', 'error');
      return { ok: false, message: 'no-opml' };
    }
    const r = await api.opml.export();
    if (!r.success) {
      pushToast(`OPML 导出失败：${r.error?.message ?? '未知错误'}`, 'error');
      return { ok: false, message: r.error?.message ?? 'failed' };
    }
    if (r.data === true) {
      pushToast('OPML 导出成功', 'success');
    } else {
      pushToast('已取消导出', 'info');
    }
    return { ok: r.data === true, message: r.data ? 'done' : 'cancelled' };
  }, [pushToast]);

  // ----- 渲染三栏（reader 页面） -----
  const feedsSlot =
    feedsState.kind === 'loading' ? (
      <LoadingView message="正在加载订阅源…" />
    ) : feedsState.kind === 'error' ? (
      <ErrorView message={feedsState.error} onRetry={refreshFeeds} />
    ) : (
      <FeedList
        feeds={feeds}
        articles={allArticles}
        selected={selection.feedId}
        onSelect={selectFeed}
        onDeleteFeed={handleDeleteFeed}
        allCount={counts.all}
        unreadCount={counts.unread}
        starredCount={counts.starred}
        failedFeedIds={syncing ? undefined : failedFeedIds}
        onSyncFeed={async (feed: Feed) => {
          pushToast(`正在同步「${feed.siteTitle || feed.title}」…`, 'info');
          const r = await ds.syncFeed(feed.id);
          pushToast(r.message, r.ok ? 'success' : 'error');
          if (r.ok) {
            await refreshFeeds();
            const result = await ds.articles({});
            if (result.kind === 'ready') {
              setAllArticlesState({ kind: 'ready', data: result.data });
            }
            void refreshCounts();
          }
        }}
        onExportOpml={handleOpmlExport}
        onAddFeed={handleAddFeed}
      />
    );

  const articlesSlot =
    articlesState.kind === 'loading' ? (
      <LoadingView message="正在加载文章…" />
    ) : articlesState.kind === 'error' ? (
      <ErrorView
        message={articlesState.error}
        onRetry={() => {
          void refreshArticles({});
        }}
      />
    ) : (
      <ArticleList
        feeds={feeds}
        articles={articles}
        selectedArticleId={selection.articleId}
        onSelect={handleSelectArticle}
        filterLabel={filterLabel}
        filterHint={
          // Phase 3.4.4.5：给空态一个明确提示
          selection.feedId === 'starred' ? '暂无星标文章' :
          selection.feedId === 'unread' ? '所有文章都已读完' :
          '暂无匹配文章'
        }
      />
    );

  const readerSlot = (
    <ArticleReader
      article={selectedArticle}
      feed={selectedFeed}
      onToggleStar={handleToggleStar}
      onToast={pushToast}
    />
  );

  // Phase 3.4.4.3：搜索跳转：切到对应 feed + 选中文章，回到 reader
  const handleSearchSelect = useCallback(
    (articleId: string) => {
      const target = articles.find((a) => a.id === articleId) ?? allArticles.find((a) => a.id === articleId);
      if (!target) {
        pushToast('该文章已不在当前列表中', 'error');
        return;
      }
      selectFeed(target.feedId);
      selectArticle(articleId);
      setCurrentPage('reader');
    },
    [articles, allArticles, selectArticle, selectFeed, pushToast]
  );

  // ----- 渲染页面（reader 之外的页面） -----
  // Phase 3.4.4.4：nav 7 项 — general 弹窗 / ai 子页面 / 5 个原 page
  let pageSlot: JSX.Element;
  switch (currentPage) {
    case 'ai':
      pageSlot = <SettingsPage onToast={pushToast} />;
      break;
    case 'tags':
      pageSlot = <TagsPage onToast={pushToast} />;
      break;
    case 'notes':
      pageSlot = <NotesPage onToast={pushToast} />;
      break;
    case 'digests':
      pageSlot = <DigestsPage onToast={pushToast} />;
      break;
    case 'topics':
      pageSlot = <TopicsPage onToast={pushToast} />;
      break;
    case 'logs':
      pageSlot = <LogsPage />;
      break;
    case 'general':
    case 'reader':
    default:
      // 'general' 走弹窗不走 page slot
      pageSlot = <></>;
      break;
  }

  return (
    <>
      <Layout
        feedsSlot={feedsSlot}
        articlesSlot={articlesSlot}
        readerSlot={readerSlot}
        onAddFeed={() => setAddDialogOpen(true)}
        onSyncAll={handleSyncAll}
        syncing={syncing}
        onOpmlImport={handleOpmlImport}
        onOpmlExport={handleOpmlExport}
        sidebarPercent={widths.sidebarPercent}
        listPercent={widths.listPercent}
        onResizeSidebar={setSidebar}
        onResizeList={setList}
        currentPage={currentPage}
        onPageChange={(p) => {
          if (p === 'general') {
            setGeneralModalOpen(true);
            setCurrentPage('reader'); // 保持 reader 视图
            return;
          }
          setGeneralModalOpen(false);
          setCurrentPage(p);
        }}
        pageSlot={pageSlot}
        searchSlot={<SearchBar feeds={feeds} onSelect={handleSearchSelect} />}
      />
      <AddFeedDialog
        open={addDialogOpen}
        onClose={() => setAddDialogOpen(false)}
        onSubmit={handleAddFeed}
      />
      <ConfirmDialog ref={confirmRef} />
      <ContextMenuHost />
      <Toast items={toasts} onDismiss={dismissToast} />
      {/* Phase 3.6.2：同步进度条（进行中/完成两态；完成后 3 秒自动消失） */}
      {syncingProgress && (
        <div
          className={`sync-progress-bar sync-progress-bar--${syncingProgress.kind} ${
            syncingProgress.kind === 'done'
              ? syncingProgress.failCount === 0
                ? 'sync-progress-bar--success'
                : 'sync-progress-bar--partial'
              : ''
          }`}
          role="status"
          aria-live="polite"
          data-sync-state={syncingProgress.kind}
        >
          {syncingProgress.kind === 'progress' ? (
            <span className="sync-progress-bar__text">
              正在同步：{syncingProgress.feedName} 进度：{syncingProgress.completed}/{syncingProgress.total}
            </span>
          ) : syncingProgress.failCount === 0 ? (
            <span className="sync-progress-bar__text">同步完成：{syncingProgress.okCount}/{syncingProgress.total} 成功</span>
          ) : (
            <span className="sync-progress-bar__text">
              同步部分完成：成功 {syncingProgress.okCount}，失败 {syncingProgress.failCount}。未成功同步的订阅源已用红点标出
            </span>
          )}
        </div>
      )}
      <GeneralSettingsModal
        open={generalModalOpen}
        onClose={() => setGeneralModalOpen(false)}
        onToast={pushToast}
      />
    </>
  );
}

export default function AppWithProvider() {
  return (
    <ThemeProvider>
      <App />
    </ThemeProvider>
  );
}
