/**
 * MockDataSource — Task 2.1 阶段的本地数据源
 *
 * 与真 IPC 的差距：返回 mock 数据；markRead/markStarred/syncFeed 走
 * 内存态更新并通过 console 留下可见轨迹，便于 debug。
 *
 * Phase 3 起实现 FullDataSource 全部方法；mock 模式下 Tag/Note/Digest/Topic/AI/Settings/Log
 * 的实现是 in-memory 占位（仅供 UI 演示用，不保证持久化或调用真模型）。
 */
import type {
  Article,
  Feed,
  Tag,
  TagCreateInput,
  TagUpdateInput,
  Note,
  NoteCreateInput,
  NoteUpdateInput,
  Topic,
  TopicCreateInput,
  TopicUpdateInput,
  Briefing,
  TimelineEntry,
  EventGroup,
  TopicGraph,
  AIProvider,
  AIProviderCreateInput,
  AIProviderUpdateInput,
  AppSettings,
  LogEntry,
  OpmlImportResult,
  ExportFormat,
  Language,
  SummaryDetailLevel,
  AIChatMessage,
  AIChatReply,
  AITopicRecommendation,
  AITranslationProgressEvent,
  SyncProgress,
  SyncStageEvent,
  ArticleFilter
} from '@shared/types';
import type {
  DataSource,
  DataSourceState,
  FeedSyncOutcome
} from '../types/dataSource';
import { MOCK_ARTICLES, MOCK_FEEDS } from './mockData';
// 浏览器端 mock split：与主进程（张宇凡 b53e7a2）行为对齐 —
// 顶层块级元素独立成块，行内节点合并为合成 <p>，代码/表格不切内部。
import { splitCleanedHtmlIntoBlocks, type HtmlBlock } from '../utils/html-split';

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

// 浅拷贝 + 数组复制，避免外部 mutate mock
const cloneFeeds = (): Feed[] => MOCK_FEEDS.map((f) => ({ ...f }));
const cloneArticles = (): Article[] => MOCK_ARTICLES.map((a) => ({ ...a }));

export class MockDataSource implements DataSource {
  private feedsState: Feed[] = cloneFeeds();
  private articlesState: Article[] = cloneArticles();
  // Phase 3.7.1:上次 articles 查询的 total(切片前,供"加载更多"判断 hasMore)
  private _lastArticleTotal = 0;
  private tagsState: Tag[] = [];
  // Phase 3.5.x:mock 模式维护 articleId -> Set<tagId> 映射,
  // 让 tagAddToArticle / tagRemoveFromArticle / tagGetByArticle / articles(tagIds) 真正可用
  private articleTagMap: Map<string, Set<string>> = new Map();
  private notesState: Note[] = [];
  private topicsState: Topic[] = [];
  private topicGraphState: Map<string, TopicGraph> = new Map();
  private providersState: AIProvider[] = [];
  private logsState: LogEntry[] = [];
  private syncProgressState: SyncProgress = {
    totalFeeds: 0,
    completedFeeds: 0,
    results: [],
    currentFeedId: null,
    currentStage: null
  };
  private id = 0;

  constructor(options: { onboardingCompleted?: boolean } = {}) {
    // 常规 mock/smoke 默认跳过首次引导，避免遮罩影响既有探针；
    // onboarding 专项探针显式传 false，覆盖真实首次启动流程。
    this.settingsState.onboardingCompleted = options.onboardingCompleted ?? true;
  }

  private nextId(prefix: string): string {
    this.id += 1;
    return `${prefix}-mock-${this.id}`;
  }

  // ============== Feed / Article / Sync ==============

  async feeds(): Promise<DataSourceState<Feed[]>> {
    await delay(150);
    return { kind: 'ready', data: this.feedsState };
  }

  async articles(filter: ArticleFilter): Promise<DataSourceState<Article[]>> {
    await delay(150);
    let items = this.articlesState;
    if (filter.feedId) items = items.filter((a) => a.feedId === filter.feedId);
    if (filter.isRead !== undefined) items = items.filter((a) => a.isRead === filter.isRead);
    if (filter.isStarred !== undefined) items = items.filter((a) => a.isStarred === filter.isStarred);
    // Phase 3.5.x:按 tag 过滤(AND 语义,文章必须同时具备所有 tag)
    if (filter.tagIds && filter.tagIds.length > 0) {
      items = items.filter((a) => {
        const applied = this.articleTagMap.get(a.id);
        if (!applied) return false;
        return filter.tagIds!.every((tagId) => applied.has(tagId));
      });
    }
    // Phase 3.7.2：与生产搜索范围保持一致（标题 + Feed 原文 + 清洗正文）
    if (filter.search && filter.search.trim()) {
      const q = filter.search.toLowerCase();
      items = items.filter((a) =>
        a.title.toLowerCase().includes(q) ||
        (a.rawText ?? '').toLowerCase().includes(q) ||
        (a.cleanedMarkdown ?? '').toLowerCase().includes(q)
      );
    }
    items = [...items].sort((a, b) => {
      const ta = a.publishedAt ? Date.parse(a.publishedAt) : 0;
      const tb = b.publishedAt ? Date.parse(b.publishedAt) : 0;
      return tb - ta;
    });
    // Phase 3.7.1:缓存 total(给"加载更多"判断 hasMore)
    this._lastArticleTotal = items.length;
    // Phase 3.7.1:分页(limit + offset)。搜索模式不需要分页(全量 top N)
    if (filter.limit !== undefined) {
      const offset = filter.offset ?? 0;
      items = items.slice(offset, offset + filter.limit);
    }
    return { kind: 'ready', data: items };
  }

  async articleCount(filter: ArticleFilter): Promise<DataSourceState<number>> {
    await delay(20);
    let items = this.articlesState;
    if (filter.feedId) items = items.filter((a) => a.feedId === filter.feedId);
    if (filter.isRead !== undefined) items = items.filter((a) => a.isRead === filter.isRead);
    if (filter.isStarred !== undefined) items = items.filter((a) => a.isStarred === filter.isStarred);
    if (filter.tagIds && filter.tagIds.length > 0) {
      items = items.filter((a) => {
        const applied = this.articleTagMap.get(a.id);
        return !!applied && filter.tagIds!.every((tagId) => applied.has(tagId));
      });
    }
    if (filter.search?.trim()) {
      const q = filter.search.toLowerCase();
      items = items.filter((a) =>
        a.title.toLowerCase().includes(q) ||
        (a.rawText ?? '').toLowerCase().includes(q) ||
        (a.cleanedMarkdown ?? '').toLowerCase().includes(q)
      );
    }
    return { kind: 'ready', data: items.length };
  }

  // Phase 3.7.3：按 ID 获取单篇文章（搜索跳转保底）
  async getArticle(id: string): Promise<DataSourceState<Article>> {
    await delay(20);
    const article = this.articlesState.find((a) => a.id === id);
    if (!article) return { kind: 'error', error: `文章 ${id} 不存在` };
    return { kind: 'ready', data: article };
  }

  // Phase 3.7.1:上次 articles 查询的 total(供"加载更多"判断 hasMore)
  lastArticleTotal(): number {
    return this._lastArticleTotal;
  }

  async markRead(articleId: string, isRead: boolean): Promise<void> {
    this.articlesState = this.articlesState.map((a) =>
      a.id === articleId ? { ...a, isRead } : a
    );
    // eslint-disable-next-line no-console
    console.log('[mock:ds] markRead', { articleId, isRead });
  }

  async markStarred(articleId: string, isStarred: boolean): Promise<void> {
    this.articlesState = this.articlesState.map((a) =>
      a.id === articleId ? { ...a, isStarred } : a
    );
    // eslint-disable-next-line no-console
    console.log('[mock:ds] markStarred', { articleId, isStarred });
  }

  // Phase 4.1.3：将指定订阅源下所有未读文章批量标为已读
  async markAllReadByFeed(feedId: string): Promise<number> {
    let count = 0;
    this.articlesState = this.articlesState.map((a) => {
      if (a.feedId === feedId && !a.isRead) {
        count += 1;
        return { ...a, isRead: true };
      }
      return a;
    });
    // eslint-disable-next-line no-console
    console.log('[mock:ds] markAllReadByFeed', { feedId, updated: count });
    return count;
  }

  async articleCounts(): Promise<DataSourceState<{ all: number; unread: number; starred: number }>> {
    const all = this.articlesState.length;
    const unread = this.articlesState.filter(a => !a.isRead).length;
    const starred = this.articlesState.filter(a => a.isStarred).length;
    return { kind: 'ready', data: { all, unread, starred } };
  }

  // Phase 3.5.x:按 tag 统计文章数
  async articleCountsByTag(): Promise<DataSourceState<Record<string, number>>> {
    const result: Record<string, number> = {};
    for (const tagSet of this.articleTagMap.values()) {
      for (const tagId of tagSet) {
        result[tagId] = (result[tagId] ?? 0) + 1;
      }
    }
    return { kind: 'ready', data: result };
  }

  async syncFeed(feedId: string): Promise<FeedSyncOutcome> {
    const at = new Date().toISOString();
    if (feedId === 'feed-36kr') {
      const stages: SyncStageEvent[] = [{ stage: 'fetching', at }];
      const error = '[HTTP_BAD_STATUS] 请求返回 HTTP 503：mock.example';
      this.syncProgressState = {
        totalFeeds: 1,
        completedFeeds: 0,
        results: [],
        currentFeedId: feedId,
        currentStage: stages[0]
      };
      await delay(100);
      const failedAt = new Date().toISOString();
      stages.push({ stage: 'failed', at: failedAt });
      this.syncProgressState = {
        totalFeeds: 1,
        completedFeeds: 1,
        results: [{
          feedId,
          success: false,
          error,
          newArticles: 0,
          updatedArticles: 0,
          stages,
          startedAt: at,
          finishedAt: failedAt
        }],
        currentFeedId: feedId,
        currentStage: stages[1]
      };
      this.feedsState = this.feedsState.map((feed) =>
        feed.id === feedId
          ? {
              ...feed,
              lastSyncAt: failedAt,
              lastSyncSuccess: false,
              lastSyncError: error,
              updatedAt: failedAt
            }
          : feed
      );
      return {
        ok: false,
        message: error,
        newArticles: 0,
        updatedArticles: 0,
        error,
        stages
      };
    }
    const stages: SyncStageEvent[] = [{ stage: 'fetching', at }];
    this.syncProgressState = {
      totalFeeds: 1,
      completedFeeds: 0,
      results: [],
      currentFeedId: feedId,
      currentStage: stages[0]
    };
    for (const stage of ['parsing', 'saving'] as const) {
      await delay(100);
      const stageEvent = { stage, at: new Date().toISOString() };
      stages.push(stageEvent);
      this.syncProgressState = {
        ...this.syncProgressState,
        currentStage: stageEvent
      };
    }
    await delay(100);
    const completedAt = new Date().toISOString();
    stages.push({ stage: 'completed', at: completedAt });
    this.syncProgressState = {
      totalFeeds: 1,
      completedFeeds: 1,
      results: [{
        feedId,
        success: true,
        error: null,
        newArticles: 0,
        updatedArticles: 0,
        stages,
        startedAt: at,
        finishedAt: completedAt
      }],
      currentFeedId: feedId,
      currentStage: stages[3]
    };
    this.feedsState = this.feedsState.map((feed) =>
      feed.id === feedId
        ? {
            ...feed,
            lastSyncAt: completedAt,
            lastSyncSuccess: true,
            lastSyncError: null,
            updatedAt: completedAt
          }
        : feed
    );
    return {
      ok: true,
      message: '同步成功（新增 0，更新 0）',
      newArticles: 0,
      updatedArticles: 0,
      error: null,
      stages
    };
  }

  async syncProgress(): Promise<DataSourceState<SyncProgress>> {
    return { kind: 'ready', data: this.syncProgressState };
  }

  async createFeed(url: string, title?: string): Promise<DataSourceState<Feed>> {
    const feed: Feed = {
      id: this.nextId('feed'),
      title: title ?? url,
      url,
      siteTitle: '',
      description: '',
      link: '',
      feedType: 'rss',
      groupName: null,
      iconUrl: null,
      lastSyncAt: null,
      lastSyncSuccess: false,
      lastSyncError: null,
      syncIntervalMin: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.feedsState = [...this.feedsState, feed];
    return { kind: 'ready', data: feed };
  }

  // Phase 3.5.x: 更新订阅源(title / groupName / syncIntervalMin)
  async updateFeed(
    id: string,
    input: { title?: string; groupName?: string | null; syncIntervalMin?: number | null }
  ): Promise<DataSourceState<Feed>> {
    const idx = this.feedsState.findIndex((f) => f.id === id);
    if (idx < 0) return { kind: 'error', error: `订阅源 ${id} 不存在` };
    const existing = this.feedsState[idx];
    const updated: Feed = {
      ...existing,
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.groupName !== undefined ? { groupName: input.groupName } : {}),
      ...(input.syncIntervalMin !== undefined ? { syncIntervalMin: input.syncIntervalMin } : {}),
      updatedAt: new Date().toISOString()
    };
    this.feedsState = this.feedsState.map((f) => (f.id === id ? updated : f));
    return { kind: 'ready', data: updated };
  }

  // Phase 3.5.x: 列出所有订阅源组名(去重, 按字典序)
  async feedListGroups(): Promise<DataSourceState<string[]>> {
    const set = new Set<string>();
    for (const f of this.feedsState) {
      if (f.groupName) set.add(f.groupName);
    }
    return { kind: 'ready', data: Array.from(set).sort((a, b) => a.localeCompare(b, 'zh')) };
  }

  // Phase 3.5.x: 把指定组的所有订阅源移到"未分组"(groupName = null)
  async feedClearGroup(groupName: string): Promise<DataSourceState<number>> {
    let count = 0;
    this.feedsState = this.feedsState.map((f) => {
      if (f.groupName === groupName) {
        count += 1;
        return { ...f, groupName: null, updatedAt: new Date().toISOString() };
      }
      return f;
    });
    return { kind: 'ready', data: count };
  }

  async getCleanedHtml(articleId: string): Promise<DataSourceState<string>> {
    const article = this.articlesState.find((a) => a.id === articleId);
    if (!article) return { kind: 'error', error: `文章 ${articleId} 不存在` };
    if (!article.cleanedHtml) {
      await delay(300);
      return { kind: 'ready', data: '<p>（mock 数据：此文章尚未生成 Cleaned HTML）</p>' };
    }
    return { kind: 'ready', data: article.cleanedHtml };
  }

  async getCleanedMarkdown(articleId: string): Promise<DataSourceState<string>> {
    const article = this.articlesState.find((a) => a.id === articleId);
    if (!article) return { kind: 'error', error: `文章 ${articleId} 不存在` };
    return { kind: 'ready', data: article.cleanedMarkdown ?? article.cleanedHtml ?? '' };
  }

  // Phase 3.5.2：mock 模式直接走浏览器 DOMParser 实现
  // （与主进程 splitCleanedHtmlIntoBlocks 行为对齐）
  // 注意：返回时手动扁平化为 HtmlBlock[]（utils 版本返回 {blocks, fallback}）
  async htmlBlockSplit(html: string): Promise<DataSourceState<HtmlBlock[]>> {
    // Phase 3.5.2 fallback 验证：探针可设 window.__JUHE_MOCK_SPLIT_ERROR__ = true
    // 模拟 IPC split 抛错，验证 UI 不卡在"正在切分段落…"、能 fallback 到单块 ready
    if (typeof window !== 'undefined' && (window as unknown as { __JUHE_MOCK_SPLIT_ERROR__?: boolean }).__JUHE_MOCK_SPLIT_ERROR__) {
      throw new Error('mock split 异常（探针注入）');
    }
    const result = splitCleanedHtmlIntoBlocks(html);
    return { kind: 'ready', data: result.blocks };
  }

  // ============== Tag ==============

  // Phase 4.1.3：重建 article.title 的标签前缀（与 IPC 后端 buildTaggedArticleTitle 行为一致）
  //   让 mock 模式的 article.title 也能在 ArticleList 标题前渲染彩色 chips
  //   复用 src/utils/article-title-tags 的 TAG_TITLE_PREFIX_RE 正则（避免重复定义）
  private rebuildArticleTitleTags(articleId: string): void {
    const idx = this.articlesState.findIndex((a) => a.id === articleId);
    if (idx < 0) return;
    const article = this.articlesState[idx];
    const appliedTagIds = this.articleTagMap.get(articleId);
    const tags = appliedTagIds && appliedTagIds.size > 0
      ? this.tagsState.filter((t) => appliedTagIds.has(t.id))
      : [];
    // 复用后端 article-title-tags.ts 的同一格式：[tag:NAME|COLOR]  原标题
    const TAG_TITLE_PREFIX_RE = /^(?:\[tag:[^\]\r\n]+\]\s*)+/;
    const cleanTitle = article.title.replace(TAG_TITLE_PREFIX_RE, '').trim();
    const newTitle = tags.length === 0
      ? cleanTitle
      : `${tags.map((t) => `[tag:${t.name}|${t.color ?? 'inherit'}]`).join(' ')} ${cleanTitle}`;
    this.articlesState = this.articlesState.map((a) => (a.id === articleId ? { ...a, title: newTitle } : a));
  }

  async tagList(): Promise<DataSourceState<Tag[]>> {
    return { kind: 'ready', data: this.tagsState };
  }

  async tagCreate(input: TagCreateInput): Promise<DataSourceState<Tag>> {
    const tag: Tag = {
      id: this.nextId('tag'),
      name: input.name,
      color: input.color ?? null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.tagsState = [...this.tagsState, tag];
    return { kind: 'ready', data: tag };
  }

  async tagUpdate(id: string, input: TagUpdateInput): Promise<DataSourceState<Tag>> {
    const idx = this.tagsState.findIndex((t) => t.id === id);
    if (idx < 0) return { kind: 'error', error: `标签 ${id} 不存在` };
    const updated: Tag = {
      ...this.tagsState[idx],
      ...input,
      updatedAt: new Date().toISOString()
    };
    this.tagsState = this.tagsState.map((t) => (t.id === id ? updated : t));
    // Phase 4.1.3：颜色/名字变更需要重建所有引用此 tag 的文章 title
    for (const [articleId, tagSet] of this.articleTagMap.entries()) {
      if (tagSet.has(id)) this.rebuildArticleTitleTags(articleId);
    }
    return { kind: 'ready', data: updated };
  }

  async tagDelete(id: string): Promise<void> {
    this.tagsState = this.tagsState.filter((t) => t.id !== id);
    // Phase 4.1.3：删 tag 后需要从 articleTagMap 清理 + 重建所有相关 article 的 title
    for (const [articleId, tagSet] of this.articleTagMap.entries()) {
      if (tagSet.has(id)) {
        tagSet.delete(id);
        this.rebuildArticleTitleTags(articleId);
      }
    }
  }

  async tagAddToArticle(articleId: string, tagId: string): Promise<void> {
    // Phase 3.5.x:维护 articleTagMap(让 mock 模式也能跨组件共享 tag 状态)
    let set = this.articleTagMap.get(articleId);
    if (!set) {
      set = new Set();
      this.articleTagMap.set(articleId, set);
    }
    set.add(tagId);
    // Phase 4.1.3:同步重建 article.title 的标签前缀(与 IPC 后端行为一致)
    this.rebuildArticleTitleTags(articleId);
  }

  async tagRemoveFromArticle(articleId: string, tagId: string): Promise<void> {
    const set = this.articleTagMap.get(articleId);
    if (set) set.delete(tagId);
    // Phase 4.1.3:同步重建 article.title
    this.rebuildArticleTitleTags(articleId);
  }

  async tagGetByArticle(articleId: string): Promise<DataSourceState<Tag[]>> {
    // Phase 3.5.x:从 articleTagMap + tagsState 查实际数据
    const tagIds = this.articleTagMap.get(articleId);
    if (!tagIds || tagIds.size === 0) {
      return { kind: 'ready', data: [] };
    }
    const tags = this.tagsState.filter((t) => tagIds.has(t.id));
    return { kind: 'ready', data: tags };
  }

  // ============== Note ==============

  async noteListByArticle(articleId: string): Promise<DataSourceState<Note[]>> {
    return {
      kind: 'ready',
      data: this.notesState.filter((n) => n.articleId === articleId)
    };
  }

  async noteCreate(input: NoteCreateInput): Promise<DataSourceState<Note>> {
    const note: Note = {
      id: this.nextId('note'),
      articleId: input.articleId,
      excerptText: input.excerptText ?? null,
      excerptOffset: input.excerptOffset ?? null,
      markdownContent: input.markdownContent,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.notesState = [...this.notesState, note];
    return { kind: 'ready', data: note };
  }

  async noteUpdate(id: string, input: NoteUpdateInput): Promise<DataSourceState<Note>> {
    const idx = this.notesState.findIndex((n) => n.id === id);
    if (idx < 0) return { kind: 'error', error: `笔记 ${id} 不存在` };
    const updated: Note = {
      ...this.notesState[idx],
      markdownContent: input.markdownContent ?? this.notesState[idx].markdownContent,
      updatedAt: new Date().toISOString()
    };
    this.notesState = this.notesState.map((n) => (n.id === id ? updated : n));
    return { kind: 'ready', data: updated };
  }

  async noteDelete(id: string): Promise<void> {
    this.notesState = this.notesState.filter((n) => n.id !== id);
  }

  // ============== Topic ==============

  async topicList(): Promise<DataSourceState<Topic[]>> {
    return { kind: 'ready', data: this.topicsState };
  }

  async topicGet(id: string): Promise<DataSourceState<Topic>> {
    const t = this.topicsState.find((x) => x.id === id);
    if (!t) return { kind: 'error', error: `专题 ${id} 不存在` };
    return { kind: 'ready', data: t };
  }

  async topicCreate(input: TopicCreateInput): Promise<DataSourceState<Topic>> {
    const topic: Topic = {
      id: this.nextId('topic'),
      name: input.name,
      description: input.description,
      keywords: input.keywords ?? [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.topicsState = [...this.topicsState, topic];
    return { kind: 'ready', data: topic };
  }

  async topicUpdate(id: string, input: TopicUpdateInput): Promise<DataSourceState<Topic>> {
    const idx = this.topicsState.findIndex((t) => t.id === id);
    if (idx < 0) return { kind: 'error', error: `专题 ${id} 不存在` };
    const updated: Topic = {
      ...this.topicsState[idx],
      ...input,
      updatedAt: new Date().toISOString()
    };
    this.topicsState = this.topicsState.map((t) => (t.id === id ? updated : t));
    return { kind: 'ready', data: updated };
  }

  async topicDelete(id: string): Promise<void> {
    this.topicsState = this.topicsState.filter((t) => t.id !== id);
  }

  async topicGetArticles(_topicId: string): Promise<DataSourceState<Article[]>> {
    return { kind: 'ready', data: [] };
  }

  async topicGetGraph(topicId: string): Promise<DataSourceState<TopicGraph>> {
    const cached = this.topicGraphState.get(topicId);
    if (cached) return { kind: 'ready', data: cached };
    return {
      kind: 'ready',
      data: {
        topicId,
        directions: [],
        nodes: [],
        edges: [],
        generatedAt: new Date().toISOString(),
        sourceSignature: 'mock-empty'
      }
    };
  }

  async topicGetTimeline(_topicId: string): Promise<DataSourceState<TimelineEntry[]>> {
    return { kind: 'ready', data: [] };
  }

  async topicGetEventGroups(_topicId: string): Promise<DataSourceState<EventGroup[]>> {
    return { kind: 'ready', data: [] };
  }

  async topicGenerateBriefing(_topicId: string): Promise<{ ok: boolean; message: string }> {
    return { ok: false, message: 'Mock 模式不支持 AI 简报生成' };
  }

  async topicGetBriefing(_topicId: string): Promise<DataSourceState<Briefing | null>> {
    return { kind: 'ready', data: null };
  }

  async topicUpdateBriefing(_topicId: string, _editedContent: string): Promise<DataSourceState<Briefing>> {
    return { kind: 'error', error: 'Mock 模式不支持编辑简报' };
  }

  async topicExportBriefing(_topicId: string, _format: ExportFormat): Promise<DataSourceState<string>> {
    return { kind: 'error', error: 'Mock 模式不支持导出简报' };
  }

  // ============== AI Provider ==============

  async aiProviderList(): Promise<DataSourceState<AIProvider[]>> {
    return { kind: 'ready', data: this.providersState };
  }

  async aiProviderCreate(input: AIProviderCreateInput): Promise<DataSourceState<AIProvider>> {
    const p: AIProvider = {
      id: this.nextId('ai'),
      name: input.name,
      baseUrl: input.baseUrl,
      modelName: input.modelName,
      apiKeySet: !!input.apiKey,
      isDefault: input.isDefault ?? false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.providersState = [...this.providersState, p];
    return { kind: 'ready', data: p };
  }

  async aiProviderUpdate(id: string, input: AIProviderUpdateInput): Promise<DataSourceState<AIProvider>> {
    const idx = this.providersState.findIndex((p) => p.id === id);
    if (idx < 0) return { kind: 'error', error: `AI Provider ${id} 不存在` };
    const updated: AIProvider = {
      ...this.providersState[idx],
      name: input.name ?? this.providersState[idx].name,
      baseUrl: input.baseUrl ?? this.providersState[idx].baseUrl,
      modelName: input.modelName ?? this.providersState[idx].modelName,
      apiKeySet: input.apiKey !== undefined ? !!input.apiKey : this.providersState[idx].apiKeySet,
      isDefault: input.isDefault ?? this.providersState[idx].isDefault,
      updatedAt: new Date().toISOString()
    };
    this.providersState = this.providersState.map((p) => (p.id === id ? updated : p));
    return { kind: 'ready', data: updated };
  }

  async aiProviderDelete(id: string): Promise<void> {
    this.providersState = this.providersState.filter((p) => p.id !== id);
  }

  async aiProviderTest(_id: string): Promise<{ ok: boolean; message: string }> {
    return { ok: false, message: 'mock 模式无法测试 Provider' };
  }

  // ============== AI Operations ==============

  async aiGenerateSummary(
    _articleId: string,
    _language?: Language,
    _detailLevel?: SummaryDetailLevel
  ): Promise<{ ok: boolean; message: string }> {
    // mock 模式模拟成功路径 + ~50ms 延迟，让 smoke 探针和 dev 演示可以走通完整流程。
    // 真实 AI 行为由 IPC 模式下 IpcDataSource 转发到主进程。
    await delay(50);
    return { ok: true, message: '已生成（mock）' };
  }

  async aiGetSummary(_articleId: string): Promise<DataSourceState<string>> {
    await delay(50);
    return {
      kind: 'ready',
      data: '## mock 摘要\n\n**概览**：实际使用时会调用配置的 AI Provider 生成摘要。\n\n### 关键点\n\n- 支持多级标题\n- 支持无序列表\n  - 支持嵌套条目'
    };
  }

  async aiGenerateTranslation(
    _articleId: string,
    _targetLanguage?: Language
  ): Promise<{ ok: boolean; message: string }> {
    // Phase 3.5.2：mock 模式返回 ok，让 UI 切到 translation 面板
    // 真实进度由 aiSubscribeTranslationProgress 异步推送（30ms started + 每 50ms 一段）
    return { ok: true, message: '已触发（mock 模拟流式进度）' };
  }

  async aiChat(
    articleId: string,
    messages: AIChatMessage[]
  ): Promise<DataSourceState<AIChatReply>> {
    await delay(40);
    const lastQuestion = [...messages].reverse().find((message) => message.role === 'user')?.content ?? '';
    const translating = lastQuestion.includes('翻译') || lastQuestion.toLowerCase().includes('translate');
    return {
      kind: 'ready',
      data: {
        articleId,
        providerId: 'mock-provider',
        modelName: 'mock-model',
        message: translating
          ? '这是选中内容的 mock 译文。'
          : `这是基于当前文章的 mock 回答：${lastQuestion.slice(0, 80)}`,
        generatedAt: new Date().toISOString()
      }
    };
  }

  async aiRecommendTopics(
    articleId: string,
    _refresh = false
  ): Promise<DataSourceState<AITopicRecommendation>> {
    await delay(80);
    return {
      kind: 'ready',
      data: {
        articleId,
        providerId: 'mock-provider',
        modelName: 'mock-model',
        sourceSignature: `mock-${articleId}`,
        generatedAt: new Date().toISOString(),
        suggestions: [
          {
            name: 'RSS 阅读器演进',
            description: '持续追踪 RSS 阅读器的产品能力、本地化与 AI 阅读体验。',
            keywords: ['RSS 阅读器', 'RSS', '本地优先', 'AI 阅读'],
            reason: '主体稳定，可以聚合不同产品和版本的后续报道。'
          },
          {
            name: '本地优先阅读工具',
            description: '关注本地优先阅读工具的隐私、离线数据与跨平台实现。',
            keywords: ['本地优先', '阅读工具', '隐私', '离线数据'],
            reason: '把追踪范围聚焦在本地数据和隐私设计上。'
          },
          {
            name: 'AI 辅助阅读',
            description: '追踪摘要、翻译、标签与上下文问答在阅读器中的应用。',
            keywords: ['AI 阅读', '文章摘要', '翻译', '上下文问答'],
            reason: '适合汇集智能阅读能力的跨产品进展。'
          },
          {
            name: '桌面信息聚合',
            description: '持续关注桌面端信息聚合工具的工作流和跨平台体验。',
            keywords: ['桌面应用', '信息聚合', 'Electron', '跨平台'],
            reason: '范围更宽，便于对比不同类型的聚合工具。'
          }
        ]
      }
    };
  }

  /**
   * Mock 模式：模拟流式翻译进度事件（Phase 3.5.2 测试用）
   *  - 监听器注册后，30ms 内异步推送 started 事件（带原文 paragraphs）
   *  - 然后每 50ms 推一个 segmentCompleted 事件
   *  - 所有 paragraph 都完成后不再推事件
   *  - 真实 IPC 模式由主进程推送，mock 用 setTimeout 模拟
   *
   * unsubscribe 行为：
   *  - 真实 IPC：unregister listener
   *  - mock：no-op（让 setTimeout 自然跑完，因为 React 组件可能立刻 cleanup；
   *    setTimeout 回调检查 listener 是否还在内部 mock state 中）
   */
  aiSubscribeTranslationProgress(
    articleId: string,
    listener: (event: AITranslationProgressEvent) => void
  ): () => void {
    // 找到 mock 文章并按段切分它的正文
    const article = cloneArticles().find((a) => a.id === articleId);
    if (!article || !article.cleanedHtml) {
      return () => undefined;
    }
    // 简单按 <p> 切分作为 mock paragraph
    const matches = article.cleanedHtml.match(/<p[^>]*>[\s\S]*?<\/p>/g) ?? [];
    if (matches.length === 0) {
      return () => undefined;
    }
    const paragraphs = matches.map((html, idx) => ({
      index: idx,
      original: html.replace(/<[^>]+>/g, '').trim(),
      translated: ''
    }));
    if (paragraphs.length === 0) {
      return () => undefined;
    }

    const runId = `mock-run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const listeners = new Set<(event: AITranslationProgressEvent) => void>();
    listeners.add(listener);
    const timers: Array<ReturnType<typeof setTimeout>> = [];

    // 30ms 后推 started
    timers.push(setTimeout(() => {
      if (listeners.size === 0) return;
      listener({ type: 'started', articleId, runId, paragraphs });
    }, 30));

    // 每 50ms 推一个 segmentCompleted
    paragraphs.forEach((p, i) => {
      timers.push(setTimeout(() => {
        if (listeners.size === 0) return;
        listener({
          type: 'segmentCompleted',
          articleId,
          runId,
          paragraph: {
            index: p.index,
            original: p.original,
            translated: `[译文 ${p.index}] ${p.original}`
          }
        });
      }, 80 + i * 50));
    });

    return () => {
      // mock 模式：unsubscribe 设计为 no-op
      // 因为 handleTranslation 会在 try/finally 立即 unsubscribe，
      // 此时 setTimeout 还没触发（30ms / 80ms+ 延迟），删 listener 会导致
      // started / segmentCompleted 永远不发送
      // 让 listener 一直存在直到所有 setTimeout 触发完毕
    };
  }

  async aiGetTranslation(_articleId: string): Promise<DataSourceState<Array<{ index: number; original: string; translated: string }>>> {
    // mock 模式：返回空（不覆盖 started 流式事件的 state）
    return { kind: 'ready', data: [] };
  }

  async aiSuggestTags(_articleId: string): Promise<{ ok: boolean; message: string }> {
    // mock 模式模拟成功路径 + 50ms 延迟，让 smoke 探针能捕获 loading → ready 转换
    await delay(50);
    return { ok: true, message: '已触发（mock）' };
  }

  async aiGetTagSuggestions(_articleId: string): Promise<DataSourceState<Array<{ name: string; confidence: number; reason: string }>>> {
    await delay(50);
    return {
      kind: 'ready',
      data: [
        { name: '技术', confidence: 0.92, reason: '正文含多个技术术语' },
        { name: '开源', confidence: 0.85, reason: '提到开源项目 RSS 阅读器' },
        { name: 'Rust', confidence: 0.78, reason: '明确提到 Rust 编程语言' },
        { name: '桌面应用', confidence: 0.71, reason: '讨论本地应用架构' }
      ]
    };
  }

  // ============== Settings / Log ==============

  // Phase 4.2.1:mock 模式也维护一份 settings(state),让 useAppearance 初次加载就能拿到默认值
  //   - 之前 mock settingsGet 返回 error → useAppearance 不调 applyToHtml → data-sidebar-visible 属性不写
  //     → Layout 不知道 sidebarVisible → 隐藏按钮 click 后 UI 不更新
  //   - 现在 mock 返回 ready + state,settingsUpdate 改 state(并 clone 返回)
  //   - 与 IPC 后端行为一致:settingsGet 返回 full AppSettings,settingsUpdate 返回更新后结果
  //   - 不持久化(用户重启 mock 模式会重置)— 这是 mock 模式预期行为
  private settingsState: AppSettings = {
    language: 'zh',
    theme: 'system',
    fontSize: 16,
    readingWidth: 800,
    defaultSummaryLanguage: 'zh',
    defaultSummaryDetail: 'standard',
    defaultTranslationTarget: 'zh',
    defaultProviderId: null,
    summaryPromptTemplate: null,
    translationPromptTemplate: null,
    tagPromptTemplate: null,
    fontTheme: 'default',
    visualTheme: 'classic',
    sidebarPercent: 18,
    listPercent: 28,
    systemFontSize: 14,
    sidebarVisible: true,
    // Phase 4.3:首次启动引导(陈冠中 AppSettings 扩展)
    onboardingCompleted: true
  };

  async settingsGet(): Promise<DataSourceState<AppSettings>> {
    return { kind: 'ready', data: { ...this.settingsState } };
  }

  async settingsUpdate(settings: Partial<AppSettings>): Promise<DataSourceState<AppSettings>> {
    this.settingsState = { ...this.settingsState, ...settings };
    // Phase 4.3.1:mock 模式也通知 useAppearance 等订阅者重拉 settings
    //   - IPC 模式下 settings:update 不会跨进程通知,只在使用 useAppearance.setXxx() 时
    //     才会同步 setState;
    //   - 但 mock 模式 + smoke 探针直接调 ds.settingsUpdate 改语言,
    //     不会经过 useAppearance 的 update,需要事件通知 React 重新拉。
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('juhe:settings-changed', { detail: { ...this.settingsState } })
      );
    }
    return { kind: 'ready', data: { ...this.settingsState } };
  }

  async logList(_limit?: number): Promise<DataSourceState<LogEntry[]>> {
    return { kind: 'ready', data: this.logsState };
  }

  async logExport(): Promise<DataSourceState<string>> {
    return { kind: 'error', error: 'mock 模式无法导出日志' };
  }

  // ============== OPML ==============

  async opmlImport(): Promise<DataSourceState<OpmlImportResult | null>> {
    return { kind: 'ready', data: null };
  }

  // Phase 4.1.6：feedIds 用于选择性导出 OPML
  async opmlExport(_feedIds?: string[]): Promise<DataSourceState<boolean>> {
    return { kind: 'ready', data: true };
  }
}
