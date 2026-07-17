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
  Digest,
  DigestCreateInput,
  Topic,
  TopicCreateInput,
  TopicUpdateInput,
  Briefing,
  TimelineEntry,
  EventGroup,
  AIProvider,
  AIProviderCreateInput,
  AIProviderUpdateInput,
  AppSettings,
  LogEntry,
  OpmlImportResult,
  ExportFormat,
  Language,
  SummaryDetailLevel
} from '@shared/types';
import type { DataSource, DataSourceState } from '../types/dataSource';
import { MOCK_ARTICLES, MOCK_FEEDS } from './mockData';

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

// 浅拷贝 + 数组复制，避免外部 mutate mock
const cloneFeeds = (): Feed[] => MOCK_FEEDS.map((f) => ({ ...f }));
const cloneArticles = (): Article[] => MOCK_ARTICLES.map((a) => ({ ...a }));

export class MockDataSource implements DataSource {
  private feedsState: Feed[] = cloneFeeds();
  private articlesState: Article[] = cloneArticles();
  private tagsState: Tag[] = [];
  private notesState: Note[] = [];
  private digestsState: Digest[] = [];
  private topicsState: Topic[] = [];
  private providersState: AIProvider[] = [];
  private logsState: LogEntry[] = [];
  private id = 0;

  private nextId(prefix: string): string {
    this.id += 1;
    return `${prefix}-mock-${this.id}`;
  }

  // ============== Feed / Article / Sync ==============

  async feeds(): Promise<DataSourceState<Feed[]>> {
    await delay(150);
    return { kind: 'ready', data: this.feedsState };
  }

  async articles(filter: {
    feedId?: string;
    isRead?: boolean;
    isStarred?: boolean;
    search?: string;
  }): Promise<DataSourceState<Article[]>> {
    await delay(150);
    let items = this.articlesState;
    if (filter.feedId) items = items.filter((a) => a.feedId === filter.feedId);
    if (filter.isRead !== undefined) items = items.filter((a) => a.isRead === filter.isRead);
    if (filter.isStarred !== undefined) items = items.filter((a) => a.isStarred === filter.isRead);
    // Phase 3.4.3.3：mock 模式简易搜索
    if (filter.search && filter.search.trim()) {
      const q = filter.search.toLowerCase();
      items = items.filter((a) =>
        a.title.toLowerCase().includes(q) ||
        (a.cleanedMarkdown ?? '').toLowerCase().includes(q) ||
        (a.summary ?? '').toLowerCase().includes(q)
      );
    }
    items = [...items].sort((a, b) => {
      const ta = a.publishedAt ? Date.parse(a.publishedAt) : 0;
      const tb = b.publishedAt ? Date.parse(b.publishedAt) : 0;
      return tb - ta;
    });
    return { kind: 'ready', data: items };
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

  async syncFeed(feedId: string): Promise<{ ok: boolean; message: string }> {
    if (feedId === 'feed-36kr') {
      return { ok: false, message: '远程服务器返回错误: 503' };
    }
    return { ok: true, message: '同步成功（mock）' };
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

  // ============== Tag ==============

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
    return { kind: 'ready', data: updated };
  }

  async tagDelete(id: string): Promise<void> {
    this.tagsState = this.tagsState.filter((t) => t.id !== id);
  }

  async tagAddToArticle(_articleId: string, _tagId: string): Promise<void> {
    /* mock: 不持久化 */
  }

  async tagRemoveFromArticle(_articleId: string, _tagId: string): Promise<void> {
    /* mock: 不持久化 */
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

  // ============== Digest ==============

  async digestList(): Promise<DataSourceState<Digest[]>> {
    return { kind: 'ready', data: this.digestsState };
  }

  async digestGet(id: string): Promise<DataSourceState<Digest>> {
    const d = this.digestsState.find((x) => x.id === id);
    if (!d) return { kind: 'error', error: `文摘 ${id} 不存在` };
    return { kind: 'ready', data: d };
  }

  async digestCreate(input: DigestCreateInput): Promise<DataSourceState<Digest>> {
    const digest: Digest = {
      id: this.nextId('digest'),
      name: input.name,
      noteIds: input.noteIds,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.digestsState = [...this.digestsState, digest];
    return { kind: 'ready', data: digest };
  }

  async digestDelete(id: string): Promise<void> {
    this.digestsState = this.digestsState.filter((d) => d.id !== id);
  }

  async digestExport(_id: string, _format: ExportFormat): Promise<DataSourceState<string>> {
    return { kind: 'error', error: 'mock 模式不支持导出' };
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
    return { ok: false, message: 'mock 模式无 AI 服务' };
  }

  async aiGetSummary(_articleId: string): Promise<DataSourceState<string>> {
    return { kind: 'ready', data: '' };
  }

  async aiGenerateTranslation(
    _articleId: string,
    _targetLanguage?: Language
  ): Promise<{ ok: boolean; message: string }> {
    return { ok: false, message: 'mock 模式无 AI 服务' };
  }

  async aiGetTranslation(_articleId: string): Promise<DataSourceState<Array<{ index: number; original: string; translated: string }>>> {
    return { kind: 'ready', data: [] };
  }

  async aiSuggestTags(_articleId: string): Promise<{ ok: boolean; message: string }> {
    return { ok: false, message: 'mock 模式无 AI 服务' };
  }

  async aiGetTagSuggestions(_articleId: string): Promise<DataSourceState<Array<{ name: string; confidence: number; reason: string }>>> {
    return { kind: 'ready', data: [] };
  }

  // ============== Settings / Log ==============

  async settingsGet(): Promise<DataSourceState<AppSettings>> {
    return { kind: 'error', error: 'mock 模式无设置' };
  }

  async settingsUpdate(_settings: Partial<AppSettings>): Promise<DataSourceState<AppSettings>> {
    return { kind: 'error', error: 'mock 模式不保存设置' };
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

  async opmlExport(): Promise<DataSourceState<boolean>> {
    return { kind: 'ready', data: false };
  }
}
