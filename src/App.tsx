/**
 * App 入口
 * Task 2.1 + Phase 2.5.1 + Phase 3 Integration
 *
 * 数据流：FullDataSource 抽象 → feeds / articles / content / tag / note / digest / topic / ai / settings / log
 * 状态：useSelection（feedId / articleId）、usePaneWidths（三栏宽度）、currentPage（页面切换）
 *
 * Phase 2.5.1：删除订阅源、OPML 导入自动同步、三栏拖拽
 * Phase 3 Integration：
 *  - 工作台页面入口（标签/笔记/文摘/专题）+ 设置工作区（通用/AI/日志）
 *  - SettingsPage 含 AI Provider、字体/视觉主题、多语言
 *  - ArticleReader 接入 AI 工具栏（摘要/翻译/标签建议/笔记/专题）
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Article, Feed, SyncStage, Tag } from '@shared/types';
import { useDataSource } from './context/DataSourceContext';
import { useSelection } from './hooks/useSelection';
import { usePaneWidths } from './hooks/usePaneWidths';
import { ThemeProvider, useTheme } from './hooks/useTheme';
import { useAppearance } from './hooks/useAppearance';
import {
  Layout,
  type AppPage,
  type DirectoryMode,
  nextDirectoryMode,
  type WorkbenchTab
} from './components/Layout/Layout';
import { FeedList } from './components/FeedList/FeedList';
import { ArticleList } from './components/ArticleList/ArticleList';
import { ArticleReader } from './components/ArticleReader/ArticleReader';
import { AddFeedDialog } from './components/AddFeedDialog/AddFeedDialog';
import { AddGroupDialog } from './components/AddGroupDialog/AddGroupDialog';
import { Toast, type ToastItem } from './components/Toast/Toast';
import { ConfirmDialog, type ConfirmDialogHandle } from './components/ConfirmDialog/ConfirmDialog';
import { ContextMenuHost } from './components/ContextMenu/ContextMenu';
import { OnboardingOverlay } from './components/OnboardingOverlay/OnboardingOverlay';
import { SearchBar } from './components/SearchBar/SearchBar';
import { LoadingView } from './components/StatusView/LoadingView';
import { ErrorView } from './components/StatusView/ErrorView';
import { TagsPage } from './pages/TagsPage/TagsPage';
import { NotesPage } from './pages/NotesPage/NotesPage';
import { DigestsPage } from './pages/DigestsPage/DigestsPage';
import { TopicsPage } from './pages/TopicsPage/TopicsPage';
import { OpmlExportPage } from './pages/OpmlExportPage/OpmlExportPage';
import { UnifiedSettingsPage } from './pages/UnifiedSettingsPage/UnifiedSettingsPage';
import {
  openWorkbenchTab as mergeWorkbenchTab,
  pinWorkbenchTab
} from './utils/workbench-tabs';
import './index.css';
import './styles/workbench-polish.css';

type FeedsState =
  | { kind: 'loading' }
  | { kind: 'ready'; data: Feed[] }
  | { kind: 'error'; error: string };

type ArticlesState =
  | { kind: 'loading' }
  | { kind: 'ready'; data: Article[] }
  | { kind: 'error'; error: string };

const SYNC_STAGE_LABELS: Record<SyncStage, string> = {
  fetching: '正在抓取',
  parsing: '正在解析',
  saving: '正在保存',
  completed: '已完成',
  failed: '失败'
};

export function App() {
  const ds = useDataSource();
  const { selection, selectFeed, selectArticle } = useSelection();
  const selectedFeedIdRef = useRef(selection.feedId);
  selectedFeedIdRef.current = selection.feedId;
  const { widths, setSidebar, setList } = usePaneWidths();
  // Phase 4.2.1:useAppearance 接入 → systemFontSize / sidebarVisible
  //   - useTheme 必须在外层 ThemeProvider 内(由 AppWithProvider 包装)
  //   - useAppearance 必须在所有条件 return 之前调用(Rules of Hooks)
  const { effective: effectiveTheme } = useTheme();
  const appearance = useAppearance(effectiveTheme);

  const [directoryMode, setDirectoryMode] = useState<DirectoryMode>('both');
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const onboardingAutoHandledRef = useRef(false);
  const onboardingRestoreRef = useRef<{
    activeTabId: string;
    directoryMode: DirectoryMode;
  } | null>(null);
  const directoryModeHydratedRef = useRef(false);
  useEffect(() => {
    if (!appearance.loaded || directoryModeHydratedRef.current) return;
    directoryModeHydratedRef.current = true;
    setDirectoryMode(appearance.sidebarVisible ? 'both' : 'secondary');
  }, [appearance.loaded, appearance.sidebarVisible]);

  const [openTabs, setOpenTabs] = useState<WorkbenchTab[]>([]);
  const [activeTabId, setActiveTabId] = useState('reader');
  const [aiDockOpen, setAiDockOpen] = useState(false);
  const articleTabSnapshotsRef = useRef<Map<string, Article>>(new Map());
  const activeTab = openTabs.find((tab) => tab.id === activeTabId);
  const currentPage: AppPage = activeTab?.page ?? 'reader';
  const [feedsState, setFeedsState] = useState<FeedsState>({ kind: 'loading' });
  const [articlesState, setArticlesState] = useState<ArticlesState>({ kind: 'loading' });
  // 从专题图打开的文章可能不在当前分页的前 50 条，用独立快照保证阅读器仍能立即显示。
  const [externalSelectedArticle, setExternalSelectedArticle] = useState<Article | null>(null);
  // Phase 3.7.1:文章列表分页
  // offset/limit 用于追加加载；total 用于判断 hasMore + 显示 "10 / 433"
  // 切换筛选条件时由 refreshArticles 重置 offset = 0
  // **重要:articleOffset 用 ref 不用 state**
  //   - state 模式:setArticleOffset 会让 refreshArticles 引用变化(deps 包含 offset)→
  //     useEffect 2 (selection.feedId 监听) 重跑→refreshArticles 再调→
  //     setArticleOffset 再变→死循环("App refreshArticles" 日志刷屏)
  //   - ref 模式:set 不触发 re-render,refreshArticles 引用稳定,useEffect 只在
  //     selection.feedId 变时跑
  const ARTICLE_PAGE_SIZE = 50;
  const articleOffsetRef = useRef(0);
  const [articleTotal, setArticleTotal] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
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
  const [feedUnreadCounts, setFeedUnreadCounts] = useState<Record<string, number>>({});
  // Phase 3.6.2：同步进度（两态：进行中 / 完成；完成后 3 秒自动消失）
  type SyncProgress =
    | { kind: 'progress'; feedName: string; completed: number; total: number; okCount: number; failCount: number; stage?: SyncStage | null }
    | { kind: 'done'; total: number; okCount: number; failCount: number };
  const [syncingProgress, setSyncingProgress] = useState<SyncProgress | null>(null);
  const [failedFeedIds, setFailedFeedIds] = useState<string[]>([]);
  // Phase 3.6.2：3 秒延迟清理计时器 ref
  const syncDoneTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncProgressPollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const pushToast = useCallback((message: string, kind: ToastItem['kind'] = 'info') => {
    toastIdRef.current += 1;
    const id = toastIdRef.current;
    setToasts((prev) => [...prev, { id, message, kind }]);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showOnboarding = useCallback(() => {
    onboardingRestoreRef.current = { activeTabId, directoryMode };
    directoryModeHydratedRef.current = true;
    setDirectoryMode('both');
    setActiveTabId('reader');
    setAiDockOpen(false);
    setOnboardingOpen(true);
  }, [activeTabId, directoryMode]);

  const mainUiReady = feedsState.kind === 'ready' && articlesState.kind !== 'loading';
  useEffect(() => {
    if (
      !appearance.settingsReady ||
      !mainUiReady ||
      onboardingAutoHandledRef.current
    ) return;
    const timer = window.setTimeout(() => {
      if (onboardingAutoHandledRef.current) return;
      onboardingAutoHandledRef.current = true;
      if (!appearance.onboardingCompleted) showOnboarding();
    }, 200);
    return () => window.clearTimeout(timer);
  }, [
    appearance.onboardingCompleted,
    appearance.settingsReady,
    mainUiReady,
    showOnboarding
  ]);

  const handleStartOnboarding = useCallback(() => {
    void (async () => {
      const saved = await appearance.setOnboardingCompleted(false);
      if (!saved) {
        pushToast(
          appearance.language === 'zh'
            ? '无法启动新手教程：设置状态保存失败'
            : 'Could not start Getting Started because its state could not be saved.',
          'error'
        );
        return;
      }
      showOnboarding();
    })();
  }, [appearance, pushToast, showOnboarding]);

  const handleDismissOnboarding = useCallback(async (
    reason: 'completed' | 'skipped'
  ): Promise<boolean> => {
    const saved = await appearance.setOnboardingCompleted(true);
    if (!saved) return false;
    setOnboardingOpen(false);
    const restore = onboardingRestoreRef.current;
    onboardingRestoreRef.current = null;
    if (restore) {
      setDirectoryMode(restore.directoryMode);
      setActiveTabId(restore.activeTabId);
    }
    pushToast(
      appearance.language === 'zh'
        ? (reason === 'completed' ? '新手教程已完成' : '已跳过新手教程')
        : (reason === 'completed' ? 'Getting Started completed' : 'Getting Started skipped'),
      'success'
    );
    return true;
  }, [appearance, pushToast]);

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
    async (filter: { feedId?: string; isRead?: boolean; isStarred?: boolean; tagIds?: string[]; search?: string }, options?: { append?: boolean }) => {
      const append = options?.append === true;
      // Phase 3.7.1:从 ref 读 offset(避免 setState 触发 re-render 引起的死循环)
      const offset = append ? articleOffsetRef.current : 0;
      if (!append) {
        setArticlesState({ kind: 'loading' });
        articleOffsetRef.current = 0;
      } else {
        setLoadingMore(true);
      }
      // Phase 3.7.1:透传 limit/offset 给后端分页;total 从 ds.lastArticleTotal() 同步读(IPC 已返回)
      const result = await ds.articles({ ...filter, limit: ARTICLE_PAGE_SIZE, offset });
      if (result.kind === 'ready') {
        if (append) {
          setArticlesState((prev) => {
            if (prev.kind !== 'ready') {
              return { kind: 'ready', data: result.data };
            }
            // 追加模式:把新 items 接到现有列表后面(去重防 refreshFeeds 期间列表更新)
            const seen = new Set(prev.data.map((a) => a.id));
            const merged = [...prev.data];
            for (const a of result.data) {
              if (!seen.has(a.id)) merged.push(a);
            }
            return { kind: 'ready', data: merged };
          });
          articleOffsetRef.current += result.data.length;
        } else {
          setArticlesState({ kind: 'ready', data: result.data });
          articleOffsetRef.current = result.data.length;
        }
        // Phase 3.7.1:同步刷新 total（用于自动分页 + 显示 "10 / 433"）
        setArticleTotal(ds.lastArticleTotal());
      } else if (result.kind === 'error') {
        setArticlesState({ kind: 'error', error: result.error });
      } else {
        if (!append) setArticlesState({ kind: 'ready', data: [] });
        articleOffsetRef.current = 0;
        setArticleTotal(0);
      }
      if (append) setLoadingMore(false);
    },
    [ds]
  );

  // Phase 3.7.1:滚动到底自动加载下一页
  const handleLoadMore = useCallback(async () => {
    // 用当前的 selection.feedId 复用筛选
    const filter: Parameters<typeof refreshArticles>[0] = {};
    const fid = selection.feedId;
    if (fid === 'unread') filter.isRead = false;
    else if (fid === 'starred') filter.isStarred = true;
    else if (typeof fid === 'string' && fid.startsWith('tag:')) {
      filter.tagIds = [fid.slice(4)];
    } else if (fid !== 'all' && typeof fid === 'string') {
      filter.feedId = fid;
    }
    await refreshArticles(filter, { append: true });
  }, [refreshArticles, selection.feedId]);

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

  // 初次拉取目录数据。文章列表由当前筛选的分页请求独立加载。
  useEffect(() => {
    void refreshFeeds();
    void refreshCounts();
    void refreshTags();
    void refreshTagCounts();
    void refreshGroups();
  }, [refreshCounts, refreshFeeds, refreshGroups, refreshTagCounts, refreshTags]);

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
    };
    window.addEventListener('juhe:refresh', handler);
    return () => window.removeEventListener('juhe:refresh', handler);
  }, [refreshCounts, refreshFeeds, refreshGroups, refreshTagCounts, refreshTags]);

  // Phase 3.6.2：组件卸载时清理进度条延迟计时器
  useEffect(() => {
    return () => {
      if (syncDoneTimerRef.current !== null) {
        clearTimeout(syncDoneTimerRef.current);
        syncDoneTimerRef.current = null;
      }
      if (syncProgressPollTimerRef.current !== null) {
        clearInterval(syncProgressPollTimerRef.current);
        syncProgressPollTimerRef.current = null;
      }
    };
  }, []);

  const feeds = feedsState.kind === 'ready' ? feedsState.data : [];
  const articles = articlesState.kind === 'ready' ? articlesState.data : [];

  // 单个订阅源的未读数也必须是数据库全集计数，不能从当前 50 条分页中推导。
  // 这里复用既有 articleCount，不扩大共享 IPC 协议；失败的条目不写入 map，
  // FeedList 会回退到当前页计数而不是展示一个伪精确值。
  useEffect(() => {
    let cancelled = false;
    if (feeds.length === 0) {
      setFeedUnreadCounts({});
      return () => {
        cancelled = true;
      };
    }
    void (async () => {
      const entries = await Promise.all(feeds.map(async (feed) => {
        const result = await ds.articleCount({ feedId: feed.id, isRead: false });
        return result.kind === 'ready' ? ([feed.id, result.data] as const) : null;
      }));
      if (cancelled) return;
      setFeedUnreadCounts(Object.fromEntries(
        entries.filter((entry): entry is readonly [string, number] => entry !== null)
      ));
    })();
    return () => {
      cancelled = true;
    };
  }, [counts.unread, ds, feeds]);

  // Phase 3.5.x：tagCounts 已从 articleCountsByTag 真实拉取（ArticleRepository.countByTag），
  // 直接用 state 即可，不用 useMemo 推导（推导会覆盖真实数据）。

  const selectedArticle = useMemo<Article | null>(() => {
    if (!selection.articleId) return null;
    return articles.find((a) => a.id === selection.articleId) ??
      articleTabSnapshotsRef.current.get(selection.articleId) ??
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

  const showWorkbenchTab = useCallback((tab: WorkbenchTab) => {
    setOpenTabs((prev) => {
      const result = mergeWorkbenchTab(prev, tab);
      const replacedArticleId = result.replacedTab?.articleId;
      if (replacedArticleId && replacedArticleId !== tab.articleId) {
        articleTabSnapshotsRef.current.delete(replacedArticleId);
      }
      return result.tabs;
    });
    setActiveTabId(tab.id);
  }, []);

  const ensurePageTab = useCallback((page: AppPage) => {
    if (page === 'reader') {
      const selectedArticleTabId = selection.articleId ? `article:${selection.articleId}` : null;
      setActiveTabId(
        selectedArticleTabId && openTabs.some((tab) => tab.id === selectedArticleTabId)
          ? selectedArticleTabId
          : 'reader'
      );
      return;
    }
    const metadata: Record<Exclude<AppPage, 'reader'>, Omit<WorkbenchTab, 'id' | 'page'>> = {
      settings: { label: '设置', icon: 'settings', closeable: true },
      tags: { label: '标签管理', icon: 'tags', closeable: true },
      notes: { label: '笔记', icon: 'notes', closeable: true },
      digests: { label: '文摘', icon: 'digests', closeable: true },
      topics: { label: '专题', icon: 'topics', closeable: true },
      'opml-export': { label: '导出 OPML', icon: 'export', closeable: true }
    };
    const id = `page:${page}`;
    showWorkbenchTab({
      id,
      page,
      ...metadata[page],
      preview: true
    });
  }, [openTabs, selection.articleId, showWorkbenchTab]);

  const handleReaderAction = useCallback(() => {
    if (currentPage !== 'reader') {
      ensurePageTab('reader');
      return;
    }
    directoryModeHydratedRef.current = true;
    const nextMode = nextDirectoryMode(directoryMode);
    setDirectoryMode(nextMode);
    if (directoryMode === 'both' || nextMode === 'both') {
      void appearance.setSidebarVisible(nextMode === 'both');
    }
  }, [appearance, currentPage, directoryMode, ensurePageTab]);

  const openArticleTab = useCallback((article: Article, permanent = false) => {
    articleTabSnapshotsRef.current.set(article.id, article);
    const id = `article:${article.id}`;
    const label = article.title.trim() || '未命名文章';
    showWorkbenchTab({
      id,
      label,
      page: 'reader',
      articleId: article.id,
      icon: 'article',
      closeable: true,
      preview: !permanent
    });
  }, [showWorkbenchTab]);

  const activateWorkbenchTab = useCallback((tab: WorkbenchTab) => {
    setActiveTabId(tab.id);
    if (tab.page !== 'reader') return;
    if (!tab.articleId) {
      setExternalSelectedArticle(null);
      selectArticle(null);
      return;
    }
    const article = articles.find((item) => item.id === tab.articleId)
      ?? articleTabSnapshotsRef.current.get(tab.articleId)
      ?? null;
    if (!article) return;
    articleTabSnapshotsRef.current.set(article.id, article);
    setExternalSelectedArticle(article);
    selectFeed(article.feedId);
    selectArticle(article.id);
  }, [articles, selectArticle, selectFeed]);

  const handleTabSelect = useCallback((tabId: string) => {
    const tab = openTabs.find((item) => item.id === tabId);
    if (tab) activateWorkbenchTab(tab);
  }, [activateWorkbenchTab, openTabs]);

  const handleTabPin = useCallback((tabId: string) => {
    setOpenTabs((prev) => pinWorkbenchTab(prev, tabId));
  }, []);

  const handleTabClose = useCallback((tabId: string) => {
    const closingIndex = openTabs.findIndex((tab) => tab.id === tabId);
    if (closingIndex < 0 || !openTabs[closingIndex].closeable) return;
    const closingTab = openTabs[closingIndex];
    if (closingTab.articleId) {
      articleTabSnapshotsRef.current.delete(closingTab.articleId);
    }
    const nextTabs = openTabs.filter((tab) => tab.id !== tabId);
    setOpenTabs(nextTabs);
    if (activeTabId !== tabId) return;
    const fallback = nextTabs[Math.max(0, closingIndex - 1)] ?? nextTabs[0];
    if (fallback) {
      activateWorkbenchTab(fallback);
      return;
    }
    setActiveTabId('reader');
    setExternalSelectedArticle(null);
    selectArticle(null);
  }, [activateWorkbenchTab, activeTabId, openTabs, selectArticle]);

  const updateArticleEverywhere = useCallback(
    (id: string, patch: Partial<Pick<Article, 'isRead' | 'isStarred'>>) => {
      setArticlesState((prev) => {
        if (prev.kind !== 'ready') return prev;
        return {
          kind: 'ready',
          data: prev.data.map((article) => article.id === id ? { ...article, ...patch } : article)
        };
      });
      setExternalSelectedArticle((prev) => prev?.id === id ? { ...prev, ...patch } : prev);
      const snapshot = articleTabSnapshotsRef.current.get(id);
      if (snapshot) {
        articleTabSnapshotsRef.current.set(id, { ...snapshot, ...patch });
      }
    },
    []
  );

  const markSnapshotsReadByFeed = useCallback((feedIds: ReadonlySet<string>) => {
    for (const [articleId, article] of articleTabSnapshotsRef.current) {
      if (feedIds.has(article.feedId) && !article.isRead) {
        articleTabSnapshotsRef.current.set(articleId, { ...article, isRead: true });
      }
    }
    setExternalSelectedArticle((prev) =>
      prev && feedIds.has(prev.feedId) ? { ...prev, isRead: true } : prev
    );
  }, []);

  const purgeArticleTabsByFeed = useCallback((feedIds: ReadonlySet<string>) => {
    const removedTabIds = new Set<string>();
    for (const tab of openTabs) {
      if (!tab.articleId) continue;
      const snapshot = articleTabSnapshotsRef.current.get(tab.articleId);
      if (snapshot && feedIds.has(snapshot.feedId)) {
        removedTabIds.add(tab.id);
        articleTabSnapshotsRef.current.delete(tab.articleId);
      }
    }
    if (removedTabIds.size === 0) return;
    setOpenTabs((prev) => prev.filter((tab) => !removedTabIds.has(tab.id)));
    if (removedTabIds.has(activeTabId)) {
      setActiveTabId('reader');
      setExternalSelectedArticle(null);
      setAiDockOpen(false);
      selectArticle(null);
    }
  }, [activeTabId, openTabs, selectArticle]);

  const handleSelectArticle = useCallback(
    (id: string) => {
      setExternalSelectedArticle(null);
      selectArticle(id);
      const a = articles.find((x) => x.id === id)
        ?? articleTabSnapshotsRef.current.get(id);
      if (a) openArticleTab(a);
      if (a && !a.isRead) {
        void (async () => {
          try {
            await ds.markRead(id, true);
            updateArticleEverywhere(id, { isRead: true });
            await refreshCounts();
          } catch (error) {
            pushToast(
              `标记已读失败：${error instanceof Error ? error.message : String(error)}`,
              'error'
            );
          }
        })();
      }
    },
    [articles, ds, openArticleTab, pushToast, refreshCounts, selectArticle, updateArticleEverywhere]
  );

  const handleOpenArticlePermanent = useCallback((id: string) => {
    const article = articles.find((item) => item.id === id)
      ?? articleTabSnapshotsRef.current.get(id);
    if (!article) return;
    setExternalSelectedArticle(null);
    selectArticle(id);
    openArticleTab(article, true);
  }, [articles, openArticleTab, selectArticle]);

  const handleToggleStar = useCallback(
    (id: string, isStarred: boolean) => {
      void (async () => {
        try {
          await ds.markStarred(id, isStarred);
          updateArticleEverywhere(id, { isStarred });
          await refreshCounts();
        } catch (error) {
          pushToast(
            `更新星标失败：${error instanceof Error ? error.message : String(error)}`,
            'error'
          );
        }
      })();
    },
    [ds, pushToast, refreshCounts, updateArticleEverywhere]
  );

  // Phase 4.1.1:同步当前选中订阅源(中栏顶部"同步"按钮)
  //   - 进度通过底部 syncingProgress bar 展示
  //   - 完成后通过 toast 报告"新增 X 篇,更新 Y 篇"或具体错误
  //   - 完成后刷新 articles + counts
  //   - 同步后调 refreshArticles 走分页通道,触发文章列表更新
  const [feedActionBusy, setFeedActionBusy] = useState(false);
  const handleSyncSelectedFeed = useCallback(async () => {
    const fid = selection.feedId;
    if (typeof fid !== 'string') return;
    if (fid === 'all' || fid === 'unread' || fid === 'starred' || fid.startsWith('tag:')) return;
    const feed = feeds.find((f) => f.id === fid);
    if (!feed || feedActionBusy || syncing) return;
    setFeedActionBusy(true);
    if (syncDoneTimerRef.current !== null) {
      clearTimeout(syncDoneTimerRef.current);
      syncDoneTimerRef.current = null;
    }
    if (syncProgressPollTimerRef.current !== null) {
      clearInterval(syncProgressPollTimerRef.current);
      syncProgressPollTimerRef.current = null;
    }
    // 启动底部进度条(progress 态,等同步完成切 done)
    setSyncingProgress({
      kind: 'progress',
      feedName: feed.siteTitle || feed.title,
      completed: 0,
      total: 1,
      okCount: 0,
      failCount: 0,
      stage: 'fetching'
    });
    pushToast(`正在同步「${feed.siteTitle || feed.title}」…`, 'info');

    const pollProgress = async () => {
      try {
        const progress = await ds.syncProgress();
        if (
          progress.kind === 'ready' &&
          progress.data.currentFeedId === feed.id &&
          progress.data.currentStage
        ) {
          setSyncingProgress((prev) =>
            prev?.kind === 'progress'
              ? { ...prev, stage: progress.data.currentStage?.stage ?? null }
              : prev
          );
        }
      } catch {
        // 进度查询失败不应制造未处理 Promise；最终同步结果仍负责展示成功或失败。
      }
    };

    const finishProgress = (ok: boolean) => {
      setSyncingProgress({
        kind: 'done',
        total: 1,
        okCount: ok ? 1 : 0,
        failCount: ok ? 0 : 1
      });
      syncDoneTimerRef.current = setTimeout(() => {
        setSyncingProgress(null);
        syncDoneTimerRef.current = null;
      }, 3000);
    };

    try {
      const syncPromise = ds.syncFeed(feed.id);
      void pollProgress();
      syncProgressPollTimerRef.current = setInterval(() => {
        void pollProgress();
      }, 80);
      const r = await syncPromise;
      if (r.ok) {
        const msg = `同步完成：新增 ${r.newArticles} 篇${r.updatedArticles > 0 ? `，更新 ${r.updatedArticles} 篇` : ''}`;
        pushToast(msg, 'success');
        finishProgress(true);
        setFailedFeedIds((prev) => prev.filter((id) => id !== feed.id));
      } else {
        pushToast(`同步失败：${r.error ?? '未知错误'}`, 'error');
        finishProgress(false);
        setFailedFeedIds((prev) => prev.includes(feed.id) ? prev : [...prev, feed.id]);
      }
    } catch (e) {
      pushToast(`同步出错：${String(e)}`, 'error');
      finishProgress(false);
      setFailedFeedIds((prev) => prev.includes(feed.id) ? prev : [...prev, feed.id]);
    } finally {
      if (syncProgressPollTimerRef.current !== null) {
        clearInterval(syncProgressPollTimerRef.current);
        syncProgressPollTimerRef.current = null;
      }
      // 成功和失败都刷新 Feed，保证 lastSyncSuccess / lastSyncError 立即反映到侧栏。
      await refreshFeeds();
      // 用户可能在同步期间切换订阅源，不能用旧请求覆盖新选择的文章列表。
      if (selectedFeedIdRef.current === feed.id) {
        await refreshArticles({ feedId: feed.id });
      }
      void refreshCounts();
      setFeedActionBusy(false);
    }
  }, [
    selection.feedId,
    feeds,
    feedActionBusy,
    syncing,
    ds,
    pushToast,
    refreshFeeds,
    refreshArticles,
    refreshCounts
  ]);

  // Phase 4.1.1:全部标为已读(中栏顶部"全部已读"按钮)
  //   - 对具体 feed 生效；“所有订阅源”由下面的全局处理器统一处理
  //   - 调 ds.markAllReadByFeed 返回更新的文章数
  //   - 完成后本地 articles 状态同步 isRead=true + 调 refreshArticles 触发重新分页
  //   - 调 refreshCounts 侧栏未读数实时更新
  const handleMarkAllReadByFeed = useCallback(async () => {
    const fid = selection.feedId;
    if (typeof fid !== 'string') return;
    if (fid === 'all' || fid === 'unread' || fid === 'starred' || fid.startsWith('tag:')) return;
    const feed = feeds.find((f) => f.id === fid);
    if (!feed || feedActionBusy || syncing) return;
    setFeedActionBusy(true);
    try {
      const unreadCountResult = await ds.articleCount({ feedId: feed.id, isRead: false });
      if (unreadCountResult.kind !== 'ready') {
        throw new Error(
          unreadCountResult.kind === 'error' ? unreadCountResult.error : '未读文章数仍在加载'
        );
      }
      const unreadCount = unreadCountResult.data;
      if (unreadCount === 0) {
        pushToast('该订阅源下没有未读文章', 'info');
        return;
      }
      const ok = await confirmRef.current?.open({
        title: '全部标为已读',
        message: `确定要把「${feed.siteTitle || feed.title}」下 ${unreadCount} 篇未读文章全部标为已读？`,
        confirmLabel: '全部已读',
        cancelLabel: '取消'
      });
      if (!ok) return;
      const count = await ds.markAllReadByFeed(feed.id);
      pushToast(
        count > 0 ? `已标记 ${count} 篇为已读` : '该订阅源下没有未读文章',
        count > 0 ? 'success' : 'info'
      );
      // 本地 articles 状态批量更新 isRead=true
      setArticlesState((prev) => {
        if (prev.kind !== 'ready') return prev;
        return {
          kind: 'ready',
          data: prev.data.map((a) => (a.feedId === feed.id ? { ...a, isRead: true } : a))
        };
      });
      markSnapshotsReadByFeed(new Set([feed.id]));
      // 刷新当前分页 articles + 侧栏计数
      if (selectedFeedIdRef.current === feed.id) {
        await refreshArticles({ feedId: feed.id });
      }
      void refreshCounts();
    } catch (e) {
      pushToast(`标记失败：${e instanceof Error ? e.message : String(e)}`, 'error');
    } finally {
      setFeedActionBusy(false);
    }
  }, [
    selection.feedId,
    feeds,
    feedActionBusy,
    syncing,
    ds,
    pushToast,
    markSnapshotsReadByFeed,
    refreshArticles,
    refreshCounts
  ]);

  // “所有订阅源”的全部已读：沿用现有逐订阅源接口，避免扩大共享 IPC 协议。
  const handleMarkAllReadAcrossFeeds = useCallback(async () => {
    if (selection.feedId !== 'all' || feedActionBusy || syncing) return;
    setFeedActionBusy(true);
    try {
      const unreadCountResult = await ds.articleCount({ isRead: false });
      if (unreadCountResult.kind !== 'ready') {
        throw new Error(
          unreadCountResult.kind === 'error' ? unreadCountResult.error : '未读文章数仍在加载'
        );
      }
      const unreadCount = unreadCountResult.data;
      if (unreadCount === 0) {
        pushToast('所有订阅源中没有未读文章', 'info');
        return;
      }
      const ok = await confirmRef.current?.open({
        title: '全部标为已读',
        message: `确定要把所有订阅源中的 ${unreadCount} 篇未读文章全部标为已读？`,
        confirmLabel: '全部已读',
        cancelLabel: '取消'
      });
      if (!ok) return;

      let markedCount = 0;
      const updatedFeedIds = new Set<string>();
      const failedFeedNames: string[] = [];
      for (const feed of feeds) {
        try {
          markedCount += await ds.markAllReadByFeed(feed.id);
          updatedFeedIds.add(feed.id);
        } catch {
          failedFeedNames.push(feed.siteTitle || feed.title || feed.url);
        }
      }

      const markSuccessfulFeedsRead = (prev: ArticlesState): ArticlesState => {
        if (prev.kind !== 'ready') return prev;
        return {
          kind: 'ready',
          data: prev.data.map((article) =>
            updatedFeedIds.has(article.feedId) ? { ...article, isRead: true } : article
          )
        };
      };
      setArticlesState(markSuccessfulFeedsRead);
      markSnapshotsReadByFeed(updatedFeedIds);

      if (selectedFeedIdRef.current === 'all') {
        await refreshArticles({});
      }
      void refreshCounts();

      if (failedFeedNames.length === 0) {
        pushToast(`已标记 ${markedCount} 篇为已读`, 'success');
      } else {
        pushToast(
          `已标记 ${markedCount} 篇为已读；${failedFeedNames.length} 个订阅源处理失败`,
          'error'
        );
      }
    } catch (e) {
      pushToast(`标记失败：${e instanceof Error ? e.message : String(e)}`, 'error');
    } finally {
      setFeedActionBusy(false);
    }
  }, [
    selection.feedId,
    feedActionBusy,
    syncing,
    ds,
    feeds,
    markSnapshotsReadByFeed,
    pushToast,
    refreshArticles,
    refreshCounts
  ]);

  // Phase 4.1.1:判断当前选中的 feedId 是否显示同步/全部已读按钮
  //   - “所有订阅源”和具体 feed 显示；未读/星标/tag 筛选不显示，避免范围歧义
  const showFeedActionBar = useMemo(() => {
    const fid = selection.feedId;
    if (typeof fid !== 'string') return false;
    if (fid === 'all') return true;
    if (fid === 'unread' || fid === 'starred' || fid.startsWith('tag:')) return false;
    return feeds.some((f) => f.id === fid);
  }, [selection.feedId, feeds]);
  const isAllFeedSelection = selection.feedId === 'all';
  const feedActionBarBusy = feedActionBusy || syncing;

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
      if (key === 'o' && selectedArticle) {
        e.preventDefault();
        void window.api.shell.openExternal(selectedArticle.url);
        return;
      }

      // s: 切换星标
      if (key === 's' && selectedArticle) {
        e.preventDefault();
        handleToggleStar(selectedArticle.id, !selectedArticle.isStarred);
        return;
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [
    articlesState,
    feedsState,
    handleSelectArticle,
    handleToggleStar,
    selectFeed,
    selectedArticle,
    selection.articleId,
    selection.feedId
  ]);

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
          if (selectedFeedIdRef.current === feed.id) {
            await refreshArticles({ feedId: feed.id });
          }
          await refreshCounts();
        } catch (error) {
          const message = error instanceof Error ? error.message : '未知错误';
          pushToast(`「${feed.title || url}」同步失败：${message}`, 'error');
        }
      })();

      return { ok: true, message: '已添加，正在后台同步' };
    },
    [ds, pushToast, refreshArticles, refreshCounts, refreshFeeds, selectFeed]
  );

  // 同步全部（Phase 3.6.2：进度反馈 + 完成后 3 秒延迟消失）
  const handleSyncAll = useCallback(async () => {
    if (syncing || feedActionBusy) return;
    setSyncing(true);
    // 清理上一次完成态的延迟计时器（避免快速重复同步时计时器泄漏）
    if (syncDoneTimerRef.current !== null) {
      clearTimeout(syncDoneTimerRef.current);
      syncDoneTimerRef.current = null;
    }
    setSyncingProgress(null);
    const failedIds: string[] = [];
    // 失败源详情：{ name, error } — toast 用 \n 分隔多行展示
    const failedFeedErrors: Array<{ name: string; error: string }> = [];
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
        else {
          failCount += 1;
          failedIds.push(f.id);
          // 收集失败源名称和具体错误原因(后端 diagnosticErrorMessage 已规范化文本)
          failedFeedErrors.push({
            name: f.siteTitle || f.title || f.url,
            error: r.message || r.error || '未知错误'
          });
        }
      }
      // Phase 3.6.2：完成态保留 3 秒让用户看到结果，PLAN 明确要求
      setSyncingProgress({ kind: 'done', total, okCount, failCount });
      setFailedFeedIds(failedIds);
      await refreshFeeds();
      if (selectedFeedIdRef.current === 'all') {
        await refreshArticles({});
      }
      void refreshCounts();

      if (failCount === 0) {
        pushToast(`同步完成：${okCount}/${total} 成功`, 'success');
      } else {
        // 多行 toast：汇总 + 逐条失败源（Toast CSS white-space: pre-line 让 \n 换行）
        // 失败太多时(>5)只显示前 5 条 + "...还有 N 个"避免 toast 过长
        const MAX_DETAILS = 5;
        const detailLines = failedFeedErrors
          .slice(0, MAX_DETAILS)
          .map((e) => `· ${e.name}：${e.error}`);
        if (failedFeedErrors.length > MAX_DETAILS) {
          detailLines.push(`…还有 ${failedFeedErrors.length - MAX_DETAILS} 个失败源`);
        }
        const message = `同步部分完成：成功 ${okCount}，失败 ${failCount}。未成功同步的订阅源已用红点标出\n${detailLines.join('\n')}`;
        pushToast(message, 'error');
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
  }, [syncing, feedActionBusy, feeds, ds, refreshFeeds, refreshArticles, refreshCounts, pushToast]);

  // 删除订阅源
  const handleDeleteFeed = useCallback(
    async (feed: Feed) => {
      const countResult = await ds.articleCount({ feedId: feed.id });
      if (countResult.kind !== 'ready') {
        pushToast(
          `无法获取文章数：${countResult.kind === 'error' ? countResult.error : '数据仍在加载'}`,
          'error'
        );
        return;
      }
      const articleCount = countResult.data;
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
        purgeArticleTabsByFeed(new Set([feed.id]));
        await refreshFeeds();
        await refreshCounts();
        pushToast(`已删除「${feed.siteTitle || feed.title}」`, 'success');
      } catch (e) {
        pushToast(`删除失败：${String(e)}`, 'error');
      }
    },
    [ds, purgeArticleTabsByFeed, pushToast, refreshCounts, refreshFeeds, selectFeed, selection.feedId]
  );

  // Bug 2 修复:批量删除订阅源(用户要求 ... 改为批量删除)
  const handleBatchDeleteFeeds = useCallback(
    async (feedIds: string[]) => {
      if (feedIds.length === 0) return;
      const countResults = await Promise.all(
        feedIds.map((feedId) => ds.articleCount({ feedId }))
      );
      const countError = countResults.find((result) => result.kind !== 'ready');
      if (countError) {
        pushToast(
          `无法获取文章数：${countError.kind === 'error' ? countError.error : '数据仍在加载'}`,
          'error'
        );
        return;
      }
      const articleCount = countResults.reduce(
        (total, result) => total + (result.kind === 'ready' ? result.data : 0),
        0
      );
      const names = feeds
        .filter((f) => feedIds.includes(f.id))
        .map((f) => f.siteTitle || f.title)
        .slice(0, 5)
        .join('、');
      const ok = await confirmRef.current?.open({
        title: '批量删除订阅源',
        message: `将删除 ${feedIds.length} 个订阅源${names ? `(${names}${feedIds.length > 5 ? '…' : ''})` : ''},同时删除其全部 ${articleCount} 篇文章,无法撤销。`,
        confirmLabel: `删除 ${feedIds.length} 个`,
        cancelLabel: '取消',
        danger: true
      });
      if (!ok) return;
      const api = (window as unknown as {
        api?: { feed?: { delete: (id: string) => Promise<{ success: boolean; error?: { message: string } }> } }
      }).api;
      if (!api?.feed?.delete) {
        pushToast('当前模式不支持删除', 'error');
        return;
      }
      let ok2 = 0;
      let fail2 = 0;
      const deletedFeedIds = new Set<string>();
      for (const id of feedIds) {
        try {
          const r = await api.feed.delete(id);
          if (r.success) {
            ok2 += 1;
            deletedFeedIds.add(id);
          } else {
            fail2 += 1;
          }
        } catch {
          fail2 += 1;
        }
      }
      // 如果当前选中在被删列表里,回退到 'all'
      if (typeof selection.feedId === 'string' && deletedFeedIds.has(selection.feedId)) {
        selectFeed('all');
      }
      purgeArticleTabsByFeed(deletedFeedIds);
      await refreshFeeds();
      await refreshGroups();
      await refreshCounts();
      pushToast(
        `已删除 ${ok2} 个订阅源${fail2 > 0 ? `,${fail2} 个失败` : ''}`,
        fail2 > 0 ? 'info' : 'success'
      );
    },
    [
      ds,
      feeds,
      purgeArticleTabsByFeed,
      pushToast,
      refreshCounts,
      refreshFeeds,
      refreshGroups,
      selectFeed,
      selection.feedId
    ]
  );

  // Bug 2 修复:批量删除标签
  const handleBatchDeleteTags = useCallback(
    async (tagIds: string[]) => {
      if (tagIds.length === 0) return;
      const names = (tags ?? [])
        .filter((t) => tagIds.includes(t.id))
        .map((t) => t.name)
        .slice(0, 5)
        .join('、');
      const ok = await confirmRef.current?.open({
        title: '批量删除标签',
        message: `将删除 ${tagIds.length} 个标签${names ? `(${names}${tagIds.length > 5 ? '…' : ''})` : ''},所有文章上的该标签关联会一并清除。`,
        confirmLabel: `删除 ${tagIds.length} 个`,
        cancelLabel: '取消',
        danger: true
      });
      if (!ok) return;
      let ok2 = 0;
      let fail2 = 0;
      for (const id of tagIds) {
        try {
          await ds.tagDelete(id);
          ok2 += 1;
        } catch {
          fail2 += 1;
        }
      }
      // 如果当前选中是被删的 tag,回退到 'all'
      if (typeof selection.feedId === 'string' && selection.feedId.startsWith('tag:')) {
        const tid = selection.feedId.slice(4);
        if (tagIds.includes(tid)) selectFeed('all');
      }
      await refreshTags();
      await refreshTagCounts();
      pushToast(
        `已删除 ${ok2} 个标签${fail2 > 0 ? `,${fail2} 个失败` : ''}`,
        fail2 > 0 ? 'info' : 'success'
      );
    },
    [tags, ds, pushToast, refreshTags, refreshTagCounts, selectFeed, selection.feedId]
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
      }
    }
    if (selectedFeedIdRef.current === 'all') {
      await refreshArticles({});
    }
    await refreshCounts();

    return { ok: true, message: 'done', result: r.data };
  }, [ds, pushToast, refreshArticles, refreshCounts, refreshFeeds]);

  // Phase 4.1.4:OPML 导出改为跳转到 OpmlExportPage 子页面,
  //   由子页面收集 feedIds 后调 window.api.opml.export(feedIds)
  //   这里只做路由跳转,不再直接触发原生保存对话框
  const handleOpmlExport = useCallback(() => {
    ensurePageTab('opml-export');
    return Promise.resolve({ ok: true, message: 'navigated' });
  }, [ensurePageTab]);

  const handleWorkbenchFeedSelect = useCallback((id: string) => {
    setActiveTabId('reader');
    setExternalSelectedArticle(null);
    setAiDockOpen(false);
    selectFeed(id);
  }, [selectFeed]);

  // ----- 渲染三栏（reader 页面） -----
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
        onSelect={handleWorkbenchFeedSelect}
        onDeleteFeed={handleDeleteFeed}
        allCount={counts.all}
        unreadCount={counts.unread}
        starredCount={counts.starred}
        feedUnreadCounts={feedUnreadCounts}
        failedFeedIds={syncing ? undefined : failedFeedIds}
        tags={tags}
        tagCounts={tagCounts}
        groups={groups}
        onAddFeed={() => setAddDialogOpen(true)}
        onImportOpml={() => {
          void handleOpmlImport();
        }}
        onAddGroup={() => setAddGroupDialogOpen(true)}
        onMoveFeedToGroup={handleMoveFeedToGroup}
        onDeleteGroup={handleDeleteGroup}
        onDeleteTag={handleDeleteTag}
        onDeleteUnusedTags={handleDeleteUnusedTags}
        onBatchDeleteFeeds={handleBatchDeleteFeeds}
        onBatchDeleteTags={handleBatchDeleteTags}
        onSyncFeed={async (feed: Feed) => {
          pushToast(`正在同步「${feed.siteTitle || feed.title}」…`, 'info');
          const r = await ds.syncFeed(feed.id);
          pushToast(r.message, r.ok ? 'success' : 'error');
          if (r.ok) {
            await refreshFeeds();
            if (selectedFeedIdRef.current === feed.id) {
              await refreshArticles({ feedId: feed.id });
            }
            await refreshCounts();
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
        onOpenPermanent={handleOpenArticlePermanent}
        filterLabel={filterLabel}
        filterHint={
          // P2 体验打磨：统一空态 title 为"还没有 X"格式
          selection.feedId === 'starred' ? '还没有星标文章' :
          selection.feedId === 'unread' ? '所有文章都已读完' :
          '还没有匹配的文章'
        }
        // Phase 3.7.1:分页滚动自动加载
        total={articleTotal}
        hasMore={articleTotal > articles.length}
        onLoadMore={handleLoadMore}
        loadingMore={loadingMore}
        // Phase 4.1.1:中栏顶部操作按钮(同步 / 全部已读)
        actionBar={showFeedActionBar ? (
          <>
            <button
              type="button"
              className={`feed-action-btn ${feedActionBarBusy ? 'is-busy' : ''}`}
              onClick={() => void (isAllFeedSelection ? handleSyncAll() : handleSyncSelectedFeed())}
              disabled={feedActionBarBusy}
              data-testid="feed-action__sync"
              title={isAllFeedSelection ? '同步所有订阅源' : '同步当前订阅源'}
            >
              {feedActionBarBusy ? '处理中…' : '↻ 同步'}
            </button>
            <button
              type="button"
              className={`feed-action-btn ${feedActionBarBusy ? 'is-busy' : ''}`}
              onClick={() => void (
                isAllFeedSelection ? handleMarkAllReadAcrossFeeds() : handleMarkAllReadByFeed()
              )}
              disabled={feedActionBarBusy}
              data-testid="feed-action__mark-all-read"
              title={
                isAllFeedSelection
                  ? '把所有订阅源中的未读文章标为已读'
                  : '把该订阅源下所有未读文章标为已读'
              }
            >
              {feedActionBarBusy ? '处理中…' : '✓ 全部已读'}
            </button>
          </>
        ) : undefined}
      />
    );

  const readerSlot = (
    <ArticleReader
      article={selectedArticle}
      feed={selectedFeed}
      onToggleStar={handleToggleStar}
      onToast={pushToast}
      aiDockOpen={aiDockOpen}
      onAiDockOpenChange={setAiDockOpen}
    />
  );

  // Phase 3.7.1 修复:搜索跳转直接复用 handleTopicOpenArticle 的 externalSelectedArticle
  // 模式,不再依赖内存数组查找 — 即使搜索结果在第 51+ 篇文章也能直接打开
  const handleSearchSelect = useCallback((article: Article) => {
    articleTabSnapshotsRef.current.set(article.id, article);
    setExternalSelectedArticle(article);
    selectFeed(article.feedId);
    selectArticle(article.id);
    openArticleTab(article);
  }, [openArticleTab, selectArticle, selectFeed]);

  // 专题脉络图 / 专题文章列表点击来源后回到阅读器并定位原文。
  const handleTopicOpenArticle = useCallback((article: Article) => {
    articleTabSnapshotsRef.current.set(article.id, article);
    setExternalSelectedArticle(article);
    selectFeed(article.feedId);
    selectArticle(article.id);
    openArticleTab(article);
  }, [openArticleTab, selectArticle, selectFeed]);

  // ----- 渲染 reader 之外的当前页面 -----
  let pageSlot: JSX.Element;
  switch (currentPage) {
    case 'settings':
      pageSlot = (
        <UnifiedSettingsPage
          onToast={pushToast}
          onStartOnboarding={handleStartOnboarding}
          language={appearance.language}
        />
      );
      break;
    case 'tags':
      pageSlot = <TagsPage onToast={pushToast} onOpenArticle={handleTopicOpenArticle} />;
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
    case 'opml-export':
      pageSlot = <OpmlExportPage onToast={pushToast} onClose={() => ensurePageTab('reader')} />;
      break;
    case 'reader':
    default:
      pageSlot = <></>;
      break;
  }

  return (
    <>
      <Layout
        sidebarSlot={feedsSlot}
        articlesSlot={articlesSlot}
        readerSlot={readerSlot}
        sidebarPercent={widths.sidebarPercent}
        listPercent={widths.listPercent}
        onResizeSidebar={setSidebar}
        onResizeList={setList}
        currentPage={currentPage}
        onPageChange={ensurePageTab}
        pageSlot={pageSlot}
        searchSlot={<SearchBar feeds={feeds} onSelect={handleSearchSelect} />}
        tabs={openTabs}
        activeTabId={activeTabId}
        onTabSelect={handleTabSelect}
        onTabPin={handleTabPin}
        onTabClose={handleTabClose}
        aiDockOpen={aiDockOpen}
        aiAvailable={currentPage === 'reader' && selectedArticle !== null}
        onToggleAiDock={() => setAiDockOpen((open) => !open)}
        onOpenSettings={() => ensurePageTab('settings')}
        directoryMode={directoryMode}
        onReaderAction={handleReaderAction}
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
      <OnboardingOverlay
        open={onboardingOpen}
        language={appearance.language}
        onDismiss={handleDismissOnboarding}
      />
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
          data-sync-stage={syncingProgress.kind === 'progress' ? syncingProgress.stage ?? 'starting' : undefined}
        >
          {syncingProgress.kind === 'progress' ? (
            <span className="sync-progress-bar__text">
              正在同步：{syncingProgress.feedName}
              {syncingProgress.stage ? ` · ${SYNC_STAGE_LABELS[syncingProgress.stage]}` : ''}
              {' '}进度：{syncingProgress.completed}/{syncingProgress.total}
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
