/**
 * App 入口
 * Task 2.1 + Phase 2.5.1
 *
 * 数据流：DataSource 抽象 → feeds / articles / content
 * 状态：useSelection（feedId / articleId）、usePaneWidths（三栏宽度）
 *
 * Phase 2.5.1 新增：
 *  - 三栏拖拽（usePaneWidths → Layout grid 模板列）
 *  - 删除订阅源（FeedList 右键菜单 → ConfirmDialog → IPC feed.delete）
 *  - OPML 导入自动同步（import 成功 → syncFeed 每个新 feed）
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Article, Feed } from '@shared/types';
import { useDataSource } from './context/DataSourceContext';
import { useSelection } from './hooks/useSelection';
import { usePaneWidths } from './hooks/usePaneWidths';
import { Layout } from './components/Layout/Layout';
import { FeedList } from './components/FeedList/FeedList';
import { ArticleList } from './components/ArticleList/ArticleList';
import { ArticleReader } from './components/ArticleReader/ArticleReader';
import { AddFeedDialog } from './components/AddFeedDialog/AddFeedDialog';
import { Toast, type ToastItem } from './components/Toast/Toast';
import { ConfirmDialog, type ConfirmDialogHandle } from './components/ConfirmDialog/ConfirmDialog';
import { ContextMenuHost } from './components/ContextMenu/ContextMenu';
import { LoadingView } from './components/StatusView/LoadingView';
import { ErrorView } from './components/StatusView/ErrorView';
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

  const [feedsState, setFeedsState] = useState<FeedsState>({ kind: 'loading' });
  const [articlesState, setArticlesState] = useState<ArticlesState>({ kind: 'loading' });
  const [allArticlesState, setAllArticlesState] = useState<ArticlesState>({ kind: 'loading' });
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const toastIdRef = useRef(0);
  const confirmRef = useRef<ConfirmDialogHandle>(null);

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

  // 初次拉取 feeds + 全部文章（侧栏计数）
  useEffect(() => {
    void refreshFeeds();
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
      void (async () => {
        const r = await ds.articles({});
        if (r.kind === 'ready') setAllArticlesState({ kind: 'ready', data: r.data });
      })();
    };
    window.addEventListener('juhe:refresh', handler);
    return () => window.removeEventListener('juhe:refresh', handler);
  }, [refreshFeeds, ds]);

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
      }
    },
    [articles, ds, selectArticle]
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
    },
    [ds]
  );

  // 添加订阅源（走 DataSource.createFeed + syncFeed）
  const handleAddFeed = useCallback(
    async (url: string) => {
      const created = await ds.createFeed(url, url);
      if (created.kind !== 'ready') {
        return { ok: false, message: created.kind === 'error' ? created.error : '创建失败' };
      }
      const feed = created.data;
      const sync = await ds.syncFeed(feed.id);
      if (sync.ok) {
        pushToast(`已添加并同步「${feed.title || url}」`, 'success');
      } else {
        pushToast(`已添加，但同步失败：${sync.message}`, 'error');
      }
      selectFeed(feed.id);
      await refreshFeeds();
      const result = await ds.articles({});
      if (result.kind === 'ready') {
        setAllArticlesState({ kind: 'ready', data: result.data });
      }
      return { ok: true, message: '添加成功' };
    },
    [ds, pushToast, refreshFeeds, selectFeed]
  );

  // 同步全部订阅源
  const handleSyncAll = useCallback(async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      let okCount = 0;
      let failCount = 0;
      for (const f of feeds) {
        const r = await ds.syncFeed(f.id);
        if (r.ok) okCount += 1;
        else failCount += 1;
      }
      await refreshFeeds();
      const result = await ds.articles({});
      if (result.kind === 'ready') {
        setAllArticlesState({ kind: 'ready', data: result.data });
      }
      if (feeds.length === 0) {
        pushToast('没有可同步的订阅源', 'info');
      } else if (failCount === 0) {
        pushToast(`同步完成：${okCount}/${feeds.length} 成功`, 'success');
      } else {
        pushToast(`同步部分失败：成功 ${okCount}，失败 ${failCount}`, 'error');
      }
    } catch (e) {
      pushToast(`同步出错：${String(e)}`, 'error');
    } finally {
      setSyncing(false);
    }
  }, [syncing, feeds, ds, refreshFeeds, pushToast]);

  // 删除订阅源（Phase 2.5.1-a）
  const handleDeleteFeed = useCallback(
    async (feed: Feed) => {
      const ok = await confirmRef.current?.open({
        title: '删除订阅源',
        message: `确定要删除「${feed.siteTitle || feed.title}」？此操作会同时删除其全部 ${articles.filter((a) => a.feedId === feed.id).length} 篇文章，无法撤销。`,
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
        // 如果当前选中的是被删的 feed，切到 "all"
        if (selection.feedId === feed.id) {
          selectFeed('all');
        }
        await refreshFeeds();
        const result = await ds.articles({});
        if (result.kind === 'ready') {
          setAllArticlesState({ kind: 'ready', data: result.data });
        }
        pushToast(`已删除「${feed.siteTitle || feed.title}」`, 'success');
      } catch (e) {
        pushToast(`删除失败：${String(e)}`, 'error');
      }
    },
    [articles, ds, pushToast, refreshFeeds, selectFeed, selection.feedId]
  );

  // OPML 导入（Phase 2.5.1-b：自动同步新导入的 feed）
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

    // Phase 2.5.1-b：自动同步新导入的 feed
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

  // ----- 渲染 -----
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
      />
    );

  const readerSlot = (
    <ArticleReader
      article={selectedArticle}
      feed={selectedFeed}
      onToggleStar={handleToggleStar}
    />
  );

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
      />
      <AddFeedDialog
        open={addDialogOpen}
        onClose={() => setAddDialogOpen(false)}
        onSubmit={handleAddFeed}
      />
      <ConfirmDialog ref={confirmRef} />
      <ContextMenuHost />
      <Toast items={toasts} onDismiss={dismissToast} />
    </>
  );
}

export default function AppWithProvider() {
  return <App />;
}
