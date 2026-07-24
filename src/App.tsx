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
import type { Article, Feed, Tag } from '@shared/types';
import { useDataSource } from './context/DataSourceContext';
import { useSelection } from './hooks/useSelection';
import { usePaneWidths } from './hooks/usePaneWidths';
import { ThemeProvider } from './hooks/useTheme';
import { Layout, type AppPage } from './components/Layout/Layout';
import { FeedList } from './components/FeedList/FeedList';
import { ArticleList } from './components/ArticleList/ArticleList';
import { ArticleReader } from './components/ArticleReader/ArticleReader';
import { AddFeedDialog } from './components/AddFeedDialog/AddFeedDialog';
import { AddGroupDialog } from './components/AddGroupDialog/AddGroupDialog';
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
  // 从专题图打开的文章可能不在当前分页的前 50 条，用独立快照保证阅读器仍能立即显示。
  const [externalSelectedArticle, setExternalSelectedArticle] = useState<Article | null>(null);
  // Phase 3.5.x：标签管理（侧栏 tag 列表 + 各 tag 下文章数）
  const [tags, setTags] = useState<Tag[]>([]);
  // Phase 3.5.x：每个 tag 名下的真实文章数（来自 article_tags SQL 聚合）
  const [tagCounts, setTagCounts] = useState<Record<string, number>>({});
  // Phase 3.5.x：订阅源分组（侧栏"添加组 / 移动到组"）
  // groups 同时包含"用户主动添加的空组"和"已用组名"，是 UI 侧本地缓存；
  // 服务端"添加组"无空组概念，依赖用户把第一个 feed 移动到新组来"创建"组。
  const [groups, setGroups] = useState<string[]>([]);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addGroupDialogOpen, setAddGroupDialogOpen] = useState(false);
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
    async (filter: { feedId?: string; isRead?: boolean; isStarred?: boolean; tagIds?: string[] }) => {
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

  // Phase 3.5.x：拉全局 tag 列表（侧栏 tab=tags 展示 + 各 tag 下文章数）
  const refreshTags = useCallback(async () => {
    const r = await ds.tagList();
    if (r.kind === 'ready') setTags(r.data);
  }, [ds]);

  // Phase 3.5.x：拉每个 tag 的真实文章数（侧栏 tab=tags 展示精确计数）
  const refreshTagCounts = useCallback(async () => {
    const r = await ds.articleCountsByTag();
    if (r.kind === 'ready') setTagCounts(r.data);
  }, [ds]);

  // Phase 3.5.x：拉所有订阅源组名（侧栏"添加组"按钮 + 移动到组子菜单共用）
  // 合并服务端实际组名 + 本地"用户主动添加的空组"缓存,
  // 避免空组被服务端列在 listGroups 结果里之后又因没人用而被淘汰。
  const refreshGroups = useCallback(async () => {
    const r = await ds.feedListGroups();
    if (r.kind === 'ready') {
      setGroups((prev) => {
        const set = new Set(r.data);
        for (const g of prev) set.add(g);
        return Array.from(set).sort((a, b) => a.localeCompare(b, 'zh'));
      });
    }
  }, [ds]);

  // 初次拉取 feeds + 全部文章（侧栏计数）
  useEffect(() => {
    void refreshFeeds();
    void refreshCounts();
    void refreshTags();
    void refreshTagCounts();
    void refreshGroups();
    void (async () => {
      const result = await ds.articles({});
      if (result.kind === 'ready') {
        setAllArticlesState({ kind: 'ready', data: result.data });
      } else {
        setAllArticlesState({ kind: 'ready', data: [] });
      }
    })();
  }, [refreshFeeds, refreshTags, refreshTagCounts, refreshGroups, ds]);

  // 当 feed 选择变化时拉取对应文章
  useEffect(() => {
    if (selection.feedId === 'all') {
      void refreshArticles({});
    } else if (selection.feedId === 'unread') {
      void refreshArticles({ isRead: false });
    } else if (selection.feedId === 'starred') {
      void refreshArticles({ isStarred: true });
    } else if (selection.feedId.startsWith('tag:')) {
      // Phase 3.5.x：按标签过滤文章
      const tagId = selection.feedId.slice(4);
      void refreshArticles({ tagIds: [tagId] });
    } else {
      void refreshArticles({ feedId: selection.feedId });
    }
  }, [selection.feedId, refreshArticles]);

  // 监听外部 refresh 信号
  useEffect(() => {
    const handler = () => {
      void refreshFeeds();
      void refreshCounts();
      void refreshTags();
      void refreshTagCounts();
      void refreshGroups();
      void (async () => {
        const r = await ds.articles({});
        if (r.kind === 'ready') setAllArticlesState({ kind: 'ready', data: r.data });
      })();
    };
    window.addEventListener('juhe:refresh', handler);
    return () => window.removeEventListener('juhe:refresh', handler);
  }, [refreshFeeds, refreshCounts, refreshTags, refreshTagCounts, refreshGroups, ds]);

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

  // Phase 3.5.x：tagCounts 已从 articleCountsByTag 真实拉取（ArticleRepository.countByTag），
  // 直接用 state 即可，不用 useMemo 推导（推导会覆盖真实数据）。

  const selectedArticle = useMemo<Article | null>(() => {
    if (!selection.articleId) return null;
    return articles.find((a) => a.id === selection.articleId) ??
      (externalSelectedArticle?.id === selection.articleId ? externalSelectedArticle : null);
  }, [articles, externalSelectedArticle, selection.articleId]);

  const selectedFeed = useMemo<Feed | null>(() => {
    if (!selectedArticle) return null;
    return feeds.find((f) => f.id === selectedArticle.feedId) ?? null;
  }, [feeds, selectedArticle]);

  const filterLabel = useMemo(() => {
    if (selection.feedId === 'all') return '所有订阅源';
    if (selection.feedId === 'unread') return '未读';
    if (selection.feedId === 'starred') return '星标文章';
    if (selection.feedId.startsWith('tag:')) {
      const tagId = selection.feedId.slice(4);
      const t = tags.find((x) => x.id === tagId);
      return t ? `# ${t.name}` : '标签';
    }
    const f = feeds.find((x) => x.id === selection.feedId);
    return f?.siteTitle || f?.title || '未知';
  }, [feeds, tags, selection.feedId]);

  const handleSelectArticle = useCallback(
    (id: string) => {
      setExternalSelectedArticle(null);
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

  // P2 体验打磨：全局键盘快捷键
  //   j / k        下一条 / 上一条 文章（自动 mark read）
  //   Shift+J/K    下一个 / 上一个 订阅源
  //   o            在系统浏览器打开当前文章原文
  //   s            切换当前文章星标
  //   Cmd/Ctrl+F   聚焦侧栏搜索框
  //   Esc          退出搜索框聚焦
  // 焦点在 input / textarea / contenteditable 时不拦截
  useEffect(() => {
    const isTextInput = (el: EventTarget | null): boolean => {
      if (!(el instanceof HTMLElement)) return false;
      const tag = el.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
      if (el.isContentEditable) return true;
      return false;
    };

    const focusSearch = () => {
      // 侧栏 SearchBar 的 input — 用 placeholder 文本定位
      const search = document.querySelector<HTMLInputElement>(
        'input[placeholder*="搜索"], input[placeholder*="Search"]'
      );
      if (search) {
        search.focus();
        search.select?.();
        return true;
      }
      return false;
    };

    const handler = (e: KeyboardEvent) => {
      // Cmd/Ctrl+F 永远生效(允许在 input 内也触发,避免冲突)
      if ((e.metaKey || e.ctrlKey) && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault();
        focusSearch();
        return;
      }

      // 其它快捷键在 input 内不拦截
      if (isTextInput(e.target)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;

      // Esc: 如果搜索框聚焦,清空 + 退出
      if (key === 'Escape') {
        const active = document.activeElement;
        if (active instanceof HTMLInputElement && active.closest('.search-bar, [data-testid*="search"]')) {
          active.blur();
          if (active.value) active.value = '';
        }
        return;
      }

      // j / k 切文章;Shift+J/K 切订阅源
      if (key === 'j' || key === 'k') {
        if (e.shiftKey) {
          // Shift+J/K 切订阅源
          if (feedsState.kind !== 'ready' || feedsState.data.length === 0) return;
          e.preventDefault();
          const fid = selection.feedId;
          const fidx = feedsState.data.findIndex((f) => f.id === fid);
          const next = key === 'j'
            ? Math.min(fidx + 1, feedsState.data.length - 1)
            : Math.max(fidx - 1, 0);
          const target = feedsState.data[next];
          if (target) selectFeed(target.id);
          return;
        }
        if (articlesState.kind !== 'ready' || articlesState.data.length === 0) return;
        e.preventDefault();
        const cur = selection.articleId;
        const idx = cur ? articlesState.data.findIndex((a) => a.id === cur) : -1;
        const next = key === 'j'
          ? Math.min(idx + 1, articlesState.data.length - 1)
          : Math.max(idx - 1, 0);
        const target = articlesState.data[next];
        if (target && target.id !== cur) {
          handleSelectArticle(target.id);
        }
        return;
      }

      // o: 打开原文
      if (key === 'o' && selection.articleId) {
        e.preventDefault();
        const a = articlesState.kind === 'ready'
          ? articlesState.data.find((x) => x.id === selection.articleId)
          : null;
        if (a?.url) {
          void window.api.shell.openExternal(a.url);
        }
        return;
      }

      // s: 切换星标
      if (key === 's' && selection.articleId) {
        e.preventDefault();
        const a = articlesState.kind === 'ready'
          ? articlesState.data.find((x) => x.id === selection.articleId)
          : null;
        if (a) {
          handleToggleStar(a.id, !a.isStarred);
        }
        return;
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [articlesState, feedsState, selection.articleId, selection.feedId, handleSelectArticle, handleToggleStar, selectFeed]);

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

  // Phase 3.5.x：添加组（仅本地缓存 + 立即渲染；用户还需把订阅源移动到新组来"激活"组）
  const handleAddGroup = useCallback(
    (name: string) => {
      setGroups((prev) => {
        if (prev.some((g) => g.toLowerCase() === name.toLowerCase())) return prev;
        return [...prev, name].sort((a, b) => a.localeCompare(b, 'zh'));
      });
      pushToast(`已添加组「${name}」`, 'success');
      return { ok: true, message: 'ok' };
    },
    [pushToast]
  );

  // Phase 3.5.x：把订阅源移动到指定组（null = 未分组）
  const handleMoveFeedToGroup = useCallback(
    async (feed: Feed, groupName: string | null) => {
      try {
        const r = await ds.updateFeed(feed.id, { groupName });
        if (r.kind === 'ready') {
          await refreshFeeds();
          await refreshGroups();
          const target = groupName ?? '未分组';
          pushToast(`已将「${feed.siteTitle || feed.title}」移到「${target}」`, 'success');
        } else {
          pushToast(`移动失败：${r.kind === 'error' ? r.error : '未知'}`, 'error');
        }
      } catch (e) {
        pushToast(`移动失败：${String(e)}`, 'error');
      }
    },
    [ds, pushToast, refreshFeeds, refreshGroups]
  );

  // Phase 3.5.x：删除标签(从 tags 表 + 关联 article_tags)
  const handleDeleteTag = useCallback(
    async (tagId: string, tagName: string) => {
      const ok = await confirmRef.current?.open({
        title: '删除标签',
        message: `确定要删除标签「${tagName}」？所有文章上的该标签关联会一并清除。`,
        confirmLabel: '删除',
        cancelLabel: '取消',
        danger: true
      });
      if (!ok) return;
      try {
        await ds.tagDelete(tagId);
        await refreshTags();
        await refreshTagCounts();
        pushToast(`已删除标签「${tagName}」`, 'success');
      } catch (e) {
        pushToast(`删除失败:${e instanceof Error ? e.message : String(e)}`, 'error');
      }
    },
    [ds, pushToast, refreshTags, refreshTagCounts]
  );

  // Phase 3.5.x：批量删除未使用标签(从 ... 菜单触发)
  const handleDeleteUnusedTags = useCallback(async () => {
    const unusedTags = tags.filter((t) => (tagCounts[t.id] ?? 0) === 0);
    if (unusedTags.length === 0) {
      pushToast('没有未使用的标签', 'info');
      return;
    }
    const ok = await confirmRef.current?.open({
      title: '删除未使用标签',
      message: `将删除 ${unusedTags.length} 个未使用标签（未被任何文章使用）：${unusedTags.slice(0, 5).map((t) => t.name).join('、')}${unusedTags.length > 5 ? '…' : ''}`,
      confirmLabel: `删除 ${unusedTags.length} 个`,
      cancelLabel: '取消',
      danger: true
    });
    if (!ok) return;
    let ok2 = 0;
    let fail2 = 0;
    for (const t of unusedTags) {
      try {
        await ds.tagDelete(t.id);
        ok2 += 1;
      } catch {
        fail2 += 1;
      }
    }
    await refreshTags();
    await refreshTagCounts();
    pushToast(`已删除 ${ok2} 个未使用标签${fail2 > 0 ? `，${fail2} 个失败` : ''}`, 'success');
  }, [tags, tagCounts, ds, pushToast, refreshTags, refreshTagCounts]);

  // Phase 3.5.x：删除组（组内所有订阅源移到"未分组"，订阅源本身保留）
  const handleDeleteGroup = useCallback(
    async (groupName: string) => {
      const ok = await confirmRef.current?.open({
        title: '删除组',
        message: `确定要删除组「${groupName}」？组内订阅源会保留并移到「未分组」。`,
        confirmLabel: '删除',
        cancelLabel: '取消',
        danger: true
      });
      if (!ok) return;
      try {
        const r = await ds.feedClearGroup(groupName);
        if (r.kind === 'ready') {
          setGroups((prev) => prev.filter((g) => g !== groupName));
          await refreshFeeds();
          await refreshGroups();
          pushToast(`已删除组「${groupName}」（${r.data} 个订阅源移到未分组）`, 'success');
        } else {
          pushToast(`删除失败：${r.kind === 'error' ? r.error : '未知'}`, 'error');
        }
      } catch (e) {
        pushToast(`删除失败：${String(e)}`, 'error');
      }
    },
    [ds, pushToast, refreshFeeds, refreshGroups]
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
        tags={tags}
        tagCounts={tagCounts}
        groups={groups}
        onAddGroup={() => setAddGroupDialogOpen(true)}
        onMoveFeedToGroup={handleMoveFeedToGroup}
        onDeleteGroup={handleDeleteGroup}
        onDeleteTag={handleDeleteTag}
        onDeleteUnusedTags={handleDeleteUnusedTags}
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
          // P2 体验打磨：统一空态 title 为"还没有 X"格式
          selection.feedId === 'starred' ? '还没有星标文章' :
          selection.feedId === 'unread' ? '所有文章都已读完' :
          '还没有匹配的文章'
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

  // 专题脉络图 / 专题文章列表点击来源后回到阅读器并定位原文。
  const handleTopicOpenArticle = useCallback((article: Article) => {
    setExternalSelectedArticle(article);
    selectFeed(article.feedId);
    selectArticle(article.id);
    setCurrentPage('reader');
  }, [selectArticle, selectFeed]);

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
      pageSlot = <TopicsPage onToast={pushToast} onOpenArticle={handleTopicOpenArticle} />;
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
      <AddGroupDialog
        open={addGroupDialogOpen}
        existingGroups={groups}
        onClose={() => setAddGroupDialogOpen(false)}
        onSubmit={handleAddGroup}
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
