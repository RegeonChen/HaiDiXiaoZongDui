/**
 * App 入口
 * Task 2.1: UI Shell
 *
 * 数据流：
 *   useDataSource  → 拉 feeds / articles
 *   useSelection   → 当前选中的 feedId / articleId
 *   useTheme       → 主题切换
 *
 * 状态在 App 这一层集中管理，三个栏的子组件保持纯展示。
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Article, Feed } from '@shared/types';
import { useDataSource } from './context/DataSourceContext';
import { useSelection } from './hooks/useSelection';
import { Layout } from './components/Layout/Layout';
import { FeedList } from './components/FeedList/FeedList';
import { ArticleList } from './components/ArticleList/ArticleList';
import { ArticleReader } from './components/ArticleReader/ArticleReader';
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
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string>('');

  // 拉 feeds
  const refreshFeeds = useCallback(async () => {
    setFeedsState({ kind: 'loading' });
    const result = await ds.feeds();
    if (result.kind === 'ready') {
      setFeedsState({ kind: 'ready', data: result.data });
    } else if (result.kind === 'error') {
      setFeedsState({ kind: 'error', error: result.error });
    } else {
      // loading 状态只是中间态，理论上不会发生
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
  }, [refreshFeeds]);

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

  // 选中的 article
  const selectedArticle = useMemo<Article | null>(() => {
    if (!selection.articleId) return null;
    return articles.find((a) => a.id === selection.articleId) ?? null;
  }, [articles, selection.articleId]);

  const selectedFeed = useMemo<Feed | null>(() => {
    if (!selectedArticle) return null;
    return feeds.find((f) => f.id === selectedArticle.feedId) ?? null;
  }, [feeds, selectedArticle]);

  // filter label
  const filterLabel = useMemo(() => {
    if (selection.feedId === 'all') return '全部文章';
    if (selection.feedId === 'unread') return '未读';
    if (selection.feedId === 'starred') return '星标';
    const f = feeds.find((x) => x.id === selection.feedId);
    return f?.title ?? '未知';
  }, [feeds, selection.feedId]);

  // 选中文章 → 自动 markRead（仅当未读时）
  const handleSelectArticle = useCallback(
    (id: string) => {
      selectArticle(id);
      const a = articles.find((x) => x.id === id);
      if (a && !a.isRead) {
        void ds.markRead(id, true);
        // 乐观更新本地状态
        setArticlesState((prev) => {
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
    },
    [ds]
  );

  const handleSync = useCallback(async () => {
    if (syncing) return;
    setSyncing(true);
    setSyncMessage('同步中…');
    let count = 0;
    for (const f of feeds) {
      const r = await ds.syncFeed(f.id);
      count += 1;
      if (!r.ok) {
        setSyncMessage(`同步失败：${f.title} (${count}/${feeds.length})`);
      } else {
        setSyncMessage(`已同步 ${f.title} (${count}/${feeds.length})`);
      }
    }
    setSyncMessage(count === 0 ? '没有可同步的源' : `同步完成，共 ${count} 个`);
    setSyncing(false);
    // 同步完成后重新拉一遍 articles（mock 不会真变，但流程上正确）
    void refreshArticles({
      feedId: selection.feedId === 'all' || selection.feedId === 'unread' || selection.feedId === 'starred'
        ? undefined
        : selection.feedId,
      isRead: selection.feedId === 'unread' ? false : undefined,
      isStarred: selection.feedId === 'starred' ? true : undefined
    });
  }, [syncing, feeds, ds, refreshArticles, selection.feedId]);

  // ----- 渲染 -----

  const feedsSlot =
    feedsState.kind === 'loading' ? (
      <LoadingView message="正在加载订阅源…" />
    ) : feedsState.kind === 'error' ? (
      <ErrorView message={feedsState.error} onRetry={refreshFeeds} />
    ) : (
      <FeedList
        feeds={feeds}
        articles={articles}
        selected={selection.feedId}
        onSelect={selectFeed}
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
    <Layout
      feedsSlot={feedsSlot}
      articlesSlot={articlesSlot}
      readerSlot={readerSlot}
      syncing={syncing}
      syncLabel={syncMessage}
      onSync={() => { void handleSync(); }}
    />
  );
}

// 默认导出 main.tsx 不变；App 之外包一个 Provider
export default function AppWithProvider() {
  // Provider 在 main.tsx 注入到外层即可；这里为了简化让 App 内部读 context
  return <App />;
}
