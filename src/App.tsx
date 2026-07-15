/**
 * App 入口
 * Task 2.1: UI Shell + Phase 2 集成
 *
 * 数据流：
 *   useDataSource  → 拉 feeds / articles / content
 *   useSelection   → 当前选中的 feedId / articleId
 *
 * 状态在 App 这一层集中管理，三个栏的子组件保持纯展示。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Article, Feed } from '@shared/types';
import { useDataSource } from './context/DataSourceContext';
import { useSelection } from './hooks/useSelection';
import { Layout } from './components/Layout/Layout';
import { FeedList } from './components/FeedList/FeedList';
import { ArticleList } from './components/ArticleList/ArticleList';
import { ArticleReader } from './components/ArticleReader/ArticleReader';
import { AddFeedDialog } from './components/AddFeedDialog/AddFeedDialog';
import { Toast, type ToastItem } from './components/Toast/Toast';
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

  const [feedsState, setFeedsState] = useState<FeedsState>({ kind: 'loading' });
  const [articlesState, setArticlesState] = useState<ArticlesState>({ kind: 'loading' });
  const [allArticlesState, setAllArticlesState] = useState<ArticlesState>({ kind: 'loading' });
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string>('');
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const toastIdRef = useRef(0);

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

  // 初次拉取 feeds
  useEffect(() => {
    void refreshFeeds();
    // 拉取全部文章用于侧栏计数
    void (async () => {
      const result = await ds.articles({});
      if (result.kind === 'ready') {
        setAllArticlesState({ kind: 'ready', data: result.data });
      } else {
        setAllArticlesState({ kind: 'ready', data: [] });
      }
    })();
  }, [refreshFeeds, ds]);

  // 监听外部 refresh 信号（smoke 探针在 seed 数据后手动触发；生产中没人 dispatch）
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
    if (selection.feedId === 'all') return '全部文章';
    if (selection.feedId === 'unread') return '未读';
    if (selection.feedId === 'starred') return '星标';
    const f = feeds.find((x) => x.id === selection.feedId);
    return f?.title ?? '未知';
  }, [feeds, selection.feedId]);

  const handleSelectArticle = useCallback(
    (id: string) => {
      selectArticle(id);
      const a = articles.find((x) => x.id === id);
      if (a && !a.isRead) {
        void ds.markRead(id, true);
        // 更新当前文章列表
        setArticlesState((prev) => {
          if (prev.kind !== 'ready') return prev;
          return {
            kind: 'ready',
            data: prev.data.map((x) => (x.id === id ? { ...x, isRead: true } : x))
          };
        });
        // 同步更新全部文章列表中的 isRead
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
      setArticlesState((prev) => {
        if (prev.kind !== 'ready') return prev;
        return {
          kind: 'ready',
          data: prev.data.map((x) => (x.id === id ? { ...x, isStarred } : x))
        };
      });
      // 同步更新全部文章列表中的 isStarred
      setAllArticlesState((prev) => {
        if (prev.kind !== 'ready') return prev;
        return {
          kind: 'ready',
          data: prev.data.map((x) => (x.id === id ? { ...x, isStarred } : x))
        };
      });
    },
    [ds]
  );

  const handleSync = useCallback(async () => {
    if (syncing) return;
    setSyncing(true);
    setSyncMessage('同步中…');
    let okCount = 0;
    let failCount = 0;
    const failedFeeds: string[] = [];
    for (let i = 0; i < feeds.length; i += 1) {
      const f = feeds[i];
      const r = await ds.syncFeed(f.id);
      if (r.ok) {
        okCount += 1;
        setSyncMessage(`已同步 ${f.title} (${i + 1}/${feeds.length})`);
      } else {
        failCount += 1;
        failedFeeds.push(f.title);
        setSyncMessage(`同步失败：${f.title} (${i + 1}/${feeds.length})`);
      }
    }
    setSyncing(false);

    // 根据实际成败决定最终提示
    if (feeds.length === 0) {
      setSyncMessage('没有可同步的源');
    } else if (failCount === 0) {
      setSyncMessage(`同步完成，共 ${okCount} 个`);
      pushToast(`同步完成，共 ${okCount} 个源`, 'success');
    } else if (okCount === 0) {
      setSyncMessage(`全部 ${failCount} 个同步失败`);
      pushToast(`全部 ${failCount} 个同步失败`, 'error');
    } else {
      setSyncMessage(`部分失败：成功 ${okCount}，失败 ${failCount}`);
      pushToast(`部分同步失败：成功 ${okCount}，失败 ${failCount}（${failedFeeds.join('、')}）`, 'error');
    }

    // 同步完成后刷新 feeds（siteTitle 等元数据可能在同步中被更新）
    void refreshFeeds();
    // 刷新全部文章用于侧栏计数
    void (async () => {
      const result = await ds.articles({});
      if (result.kind === 'ready') {
        setAllArticlesState({ kind: 'ready', data: result.data });
      }
    })();
    void refreshArticles({
      feedId: selection.feedId === 'all' || selection.feedId === 'unread' || selection.feedId === 'starred'
        ? undefined
        : selection.feedId,
      isRead: selection.feedId === 'unread' ? false : undefined,
      isStarred: selection.feedId === 'starred' ? true : undefined
    });
  }, [syncing, feeds, ds, refreshArticles, refreshFeeds, selection.feedId, pushToast]);

  // ---- P1: 添加订阅源 ----
  // 走 DataSource 抽象，IpcDataSource 调 window.api.feed.create，MockDataSource 返回内存假 Feed
  const handleAddFeed = useCallback(
    async (url: string) => {
      const created = await ds.createFeed(url, url);
      if (created.kind !== 'ready') {
        return { ok: false, message: created.kind === 'error' ? created.error : '创建失败' };
      }
      const feed = created.data;
      // 自动同步新 feed
      const sync = await ds.syncFeed(feed.id);
      if (sync.ok) {
        pushToast(`已添加并同步「${feed.title || url}」`, 'success');
      } else {
        pushToast(`已添加，但同步失败：${sync.message}`, 'error');
      }
      // 切到新 feed + refresh
      selectFeed(feed.id);
      await refreshFeeds();
      // 刷新全部文章计数
      const result = await ds.articles({});
      if (result.kind === 'ready') {
        setAllArticlesState({ kind: 'ready', data: result.data });
      }
      return { ok: true, message: '添加成功' };
    },
    [ds, pushToast, refreshFeeds, selectFeed]
  );

  // ---- P2: OPML ----
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
      // 用户取消
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
    // 刷新全部文章计数
    void (async () => {
      const result = await ds.articles({});
      if (result.kind === 'ready') {
        setAllArticlesState({ kind: 'ready', data: result.data });
      }
    })();
    return { ok: true, message: 'done', result: r.data };
  }, [pushToast, refreshFeeds, ds]);

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
        syncing={syncing}
        syncLabel={syncMessage}
        onSync={() => { void handleSync(); }}
        onAddFeed={() => setAddDialogOpen(true)}
        onOpmlImport={handleOpmlImport}
        onOpmlExport={handleOpmlExport}
      />
      <AddFeedDialog
        open={addDialogOpen}
        onClose={() => setAddDialogOpen(false)}
        onSubmit={handleAddFeed}
      />
      <Toast items={toasts} onDismiss={dismissToast} />
    </>
  );
}

// 默认导出 main.tsx 不变；App 之外包一个 Provider
export default function AppWithProvider() {
  return <App />;
}
