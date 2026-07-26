/**
 * IpcDataSource — 通过 window.api 走真实 IPC 的 DataSource 实现
 *
 * 适用于 Phase 2 集成及以后：UI 看到的所有数据都来自 SQLite + content-pipeline。
 * 错误处理：把 IpcResult 的 {success: false, error} 翻译成 DataSourceState 的 error；
 * 写入类（markRead/markStarred）抛错由调用方决定如何处理。
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
  TopicGraph,
  HtmlBlock,
  AIProvider,
  AIProviderCreateInput,
  AIProviderUpdateInput,
  AppSettings,
  LogEntry,
  OpmlImportResult,
  ExportFormat,
  Language,
  SummaryDetailLevel,
  AITranslationProgressEvent,
  SyncProgress
} from '@shared/types';
import type {
  DataSource,
  DataSourceState,
  FeedSyncOutcome
} from '../types/dataSource';

type ErrorResponse = { success: false; error: { code: string; message: string; detail?: string } };
type SuccessResponse<T> = { success: true; data: T };
type IpcResponse<T> = SuccessResponse<T> | ErrorResponse;

function toError<T>(r: ErrorResponse): DataSourceState<T> {
  return { kind: 'error', error: `${r.error.code}: ${r.error.message}` };
}

function unwrap<T>(r: IpcResponse<T>): DataSourceState<T> {
  return r.success ? { kind: 'ready', data: r.data } : toError(r);
}

function throwOnError(r: IpcResponse<unknown>, action: string): void {
  if (!r.success) {
    throw new Error(`${action} failed: ${r.error.code}: ${r.error.message}`);
  }
}

/**
 * DataSource 完整接口。
 *
 * 涵盖 Phase 1-3 所有 UI 侧需要的 IPC 操作。
 * MockDataSource 也会实现相同接口（用于 ?mock=1 演示模式）。
 */
export interface FullDataSource extends DataSource {
  // --- Feed（已有 DataSource 覆盖）---

  // --- Tag ---
  tagList(): Promise<DataSourceState<Tag[]>>;
  tagCreate(input: TagCreateInput): Promise<DataSourceState<Tag>>;
  tagUpdate(id: string, input: TagUpdateInput): Promise<DataSourceState<Tag>>;
  tagDelete(id: string): Promise<void>;
  tagAddToArticle(articleId: string, tagId: string): Promise<void>;
  tagRemoveFromArticle(articleId: string, tagId: string): Promise<void>;
  /** 获取某篇文章已应用的全部标签（ArticleReader 显示当前 tag 列表用） */
  tagGetByArticle(articleId: string): Promise<DataSourceState<Tag[]>>;

  // --- Note ---
  noteListByArticle(articleId: string): Promise<DataSourceState<Note[]>>;
  noteCreate(input: NoteCreateInput): Promise<DataSourceState<Note>>;
  noteUpdate(id: string, input: NoteUpdateInput): Promise<DataSourceState<Note>>;
  noteDelete(id: string): Promise<void>;

  // --- Digest ---
  digestList(): Promise<DataSourceState<Digest[]>>;
  digestGet(id: string): Promise<DataSourceState<Digest>>;
  digestCreate(input: DigestCreateInput): Promise<DataSourceState<Digest>>;
  digestDelete(id: string): Promise<void>;
  digestExport(id: string, format: ExportFormat): Promise<DataSourceState<string>>;

  // --- Topic（Phase 4.1 完整化：list/create/update/delete + 4 tab 数据）---
  topicList(): Promise<DataSourceState<Topic[]>>;
  topicGet(id: string): Promise<DataSourceState<Topic>>;
  topicCreate(input: TopicCreateInput): Promise<DataSourceState<Topic>>;
  topicUpdate(id: string, input: TopicUpdateInput): Promise<DataSourceState<Topic>>;
  topicDelete(id: string): Promise<void>;
  topicGetArticles(topicId: string): Promise<DataSourceState<Article[]>>;
  /** 时间 × 发展方向的专题演化图。 */
  topicGetGraph(topicId: string): Promise<DataSourceState<TopicGraph>>;
  /** 合并多源时间线（Phase 4.1 Timeline tab） */
  topicGetTimeline(topicId: string): Promise<DataSourceState<TimelineEntry[]>>;
  /** 事件分组（Phase 4.1 EventGroups tab） */
  topicGetEventGroups(topicId: string): Promise<DataSourceState<EventGroup[]>>;
  /** 生成简报（Phase 4.1 Briefing tab，AI 触发） */
  topicGenerateBriefing(topicId: string): Promise<{ ok: boolean; message: string }>;
  /** 获取最新简报（含 editedContent） */
  topicGetBriefing(topicId: string): Promise<DataSourceState<Briefing | null>>;
  /** 用户编辑简报后保存 */
  topicUpdateBriefing(topicId: string, editedContent: string): Promise<DataSourceState<Briefing>>;
  /** 导出简报（Markdown / HTML） */
  topicExportBriefing(topicId: string, format: ExportFormat): Promise<DataSourceState<string>>;

  // --- AI Provider ---
  aiProviderList(): Promise<DataSourceState<AIProvider[]>>;
  aiProviderCreate(input: AIProviderCreateInput): Promise<DataSourceState<AIProvider>>;
  aiProviderUpdate(id: string, input: AIProviderUpdateInput): Promise<DataSourceState<AIProvider>>;
  aiProviderDelete(id: string): Promise<void>;
  aiProviderTest(id: string): Promise<{ ok: boolean; message: string }>;

  // --- AI 操作 ---
  aiGenerateSummary(articleId: string, language?: Language, detailLevel?: SummaryDetailLevel): Promise<{ ok: boolean; message: string }>;
  aiGetSummary(articleId: string): Promise<DataSourceState<string>>;
  aiGenerateTranslation(articleId: string, targetLanguage?: Language): Promise<{ ok: boolean; message: string }>;
  aiSubscribeTranslationProgress(articleId: string, listener: (event: AITranslationProgressEvent) => void): () => void;
  aiGetTranslation(articleId: string): Promise<DataSourceState<Array<{ index: number; original: string; translated: string }>>>;
  aiSuggestTags(articleId: string): Promise<{ ok: boolean; message: string }>;
  aiGetTagSuggestions(articleId: string): Promise<DataSourceState<Array<{ name: string; confidence: number; reason: string }>>>;

  // --- Settings ---
  settingsGet(): Promise<DataSourceState<AppSettings>>;
  settingsUpdate(settings: Partial<AppSettings>): Promise<DataSourceState<AppSettings>>;

  // --- Log ---
  logList(limit?: number): Promise<DataSourceState<LogEntry[]>>;
  logExport(): Promise<DataSourceState<string>>;

  // --- OPML（已存在，签名同步）---
  opmlImport(): Promise<DataSourceState<OpmlImportResult | null>>;
  /** Phase 4.1.6：feedIds 用于选择性导出 OPML */
  opmlExport(feedIds?: string[]): Promise<DataSourceState<boolean>>;

  // --- Content ---
  getCleanedMarkdown(articleId: string): Promise<DataSourceState<string>>;

  // --- Content（Phase 3.5.2 段落内翻译插槽：张宇凡 b53e7a2）---
  /** 把 cleaned HTML 切分为顶层块（每个块挂一个 TranslationSlot） */
  htmlBlockSplit(html: string): Promise<DataSourceState<HtmlBlock[]>>;
}

export class IpcDataSource implements FullDataSource {
  // Phase 3.7.1:上次 articles 查询的 total(IPC 已经返回,缓存到这里供 UI 同步读)
  private _lastArticleTotal = 0;

  async feeds(): Promise<DataSourceState<Feed[]>> {
    return unwrap(await window.api.feed.list());
  }

  async articles(filter: {
    feedId?: string;
    isRead?: boolean;
    isStarred?: boolean;
    tagIds?: string[];
    search?: string;
  }): Promise<DataSourceState<Article[]>> {
    const r = await window.api.article.list(filter);
    if (!r.success) return toError(r);
    this._lastArticleTotal = r.data.total;
    return { kind: 'ready', data: r.data.items };
  }

  // Phase 3.7.3：按 ID 获取单篇文章（搜索跳转保底）
  async getArticle(id: string): Promise<DataSourceState<Article>> {
    return unwrap(await window.api.article.get(id));
  }

  // Phase 3.7.1:上次 articles 查询的 total(供"加载更多"判断 hasMore)
  lastArticleTotal(): number {
    return this._lastArticleTotal;
  }

  async markRead(articleId: string, isRead: boolean): Promise<void> {
    const r = await window.api.article.markRead(articleId, isRead);
    throwOnError(r, 'markRead');
  }

  async markStarred(articleId: string, isStarred: boolean): Promise<void> {
    const r = await window.api.article.markStarred(articleId, isStarred);
    throwOnError(r, 'markStarred');
  }

  // Phase 4.1.3：将指定订阅源下所有未读文章批量标为已读
  async markAllReadByFeed(feedId: string): Promise<number> {
    const r = await window.api.article.markAllReadByFeed(feedId);
    if (!r.success) throw new Error(`${r.error.code}: ${r.error.message}`);
    return r.data;
  }

  // Phase 3.6.3：侧栏计数
  async articleCounts(): Promise<DataSourceState<{ all: number; unread: number; starred: number }>> {
    return unwrap(await window.api.article.counts());
  }

  // Phase 3.5.x:按 tag 统计文章数(侧栏 tab=tags 展示用)
  async articleCountsByTag(): Promise<DataSourceState<Record<string, number>>> {
    return unwrap(await window.api.article.countsByTag());
  }

  async syncFeed(feedId: string): Promise<FeedSyncOutcome> {
    const r = await window.api.sync.feed(feedId);
    if (!r.success) {
      const message = `${r.error.code}: ${r.error.message}`;
      return {
        ok: false,
        message,
        newArticles: 0,
        updatedArticles: 0,
        error: message,
        stages: []
      };
    }
    const result = r.data;
    if (result.success) {
      return {
        ok: true,
        message: `同步成功（新增 ${result.newArticles}，更新 ${result.updatedArticles}）`,
        newArticles: result.newArticles,
        updatedArticles: result.updatedArticles,
        error: null,
        stages: result.stages
      };
    }
    return {
      ok: false,
      message: result.error ?? '同步失败',
      newArticles: 0,
      updatedArticles: 0,
      error: result.error,
      stages: result.stages
    };
  }

  async syncProgress(): Promise<DataSourceState<SyncProgress>> {
    return unwrap(await window.api.sync.progress());
  }

  async createFeed(url: string, title?: string): Promise<DataSourceState<Feed>> {
    return unwrap(await window.api.feed.create({ url, title }));
  }

  // Phase 3.5.x: 更新订阅源(title / groupName / syncIntervalMin),
  // 侧栏"移动到组 / 重命名组"依赖
  async updateFeed(
    id: string,
    input: { title?: string; groupName?: string | null; syncIntervalMin?: number | null }
  ): Promise<DataSourceState<Feed>> {
    return unwrap(await window.api.feed.update(id, input));
  }

  // Phase 3.5.x: 列出订阅源组 + 删除组
  async feedListGroups(): Promise<DataSourceState<string[]>> {
    return unwrap(await window.api.feed.listGroups());
  }

  async feedClearGroup(groupName: string): Promise<DataSourceState<number>> {
    return unwrap(await window.api.feed.clearGroup(groupName));
  }

  async getCleanedHtml(articleId: string): Promise<DataSourceState<string>> {
    return unwrap(await window.api.content.getCleanedHtml(articleId));
  }

  async getCleanedMarkdown(articleId: string): Promise<DataSourceState<string>> {
    return unwrap(await window.api.content.getCleanedMarkdown(articleId));
  }

  async htmlBlockSplit(html: string): Promise<DataSourceState<HtmlBlock[]>> {
    return unwrap(await window.api.content.splitHtmlBlocks(html));
  }

  // ============== Tag ==============

  async tagList(): Promise<DataSourceState<Tag[]>> {
    return unwrap(await window.api.tag.list());
  }

  async tagCreate(input: TagCreateInput): Promise<DataSourceState<Tag>> {
    return unwrap(await window.api.tag.create(input));
  }

  async tagUpdate(id: string, input: TagUpdateInput): Promise<DataSourceState<Tag>> {
    return unwrap(await window.api.tag.update(id, input));
  }

  async tagDelete(id: string): Promise<void> {
    throwOnError(await window.api.tag.delete(id), 'tagDelete');
  }

  async tagAddToArticle(articleId: string, tagId: string): Promise<void> {
    throwOnError(await window.api.tag.addToArticle(articleId, tagId), 'tagAddToArticle');
  }

  async tagRemoveFromArticle(articleId: string, tagId: string): Promise<void> {
    throwOnError(
      await window.api.tag.removeFromArticle(articleId, tagId),
      'tagRemoveFromArticle'
    );
  }

  async tagGetByArticle(articleId: string): Promise<DataSourceState<Tag[]>> {
    return unwrap(await window.api.tag.getByArticle(articleId));
  }

  // ============== Note ==============

  async noteListByArticle(articleId: string): Promise<DataSourceState<Note[]>> {
    return unwrap(await window.api.note.listByArticle(articleId));
  }

  async noteCreate(input: NoteCreateInput): Promise<DataSourceState<Note>> {
    return unwrap(await window.api.note.create(input));
  }

  async noteUpdate(id: string, input: NoteUpdateInput): Promise<DataSourceState<Note>> {
    return unwrap(await window.api.note.update(id, input));
  }

  async noteDelete(id: string): Promise<void> {
    throwOnError(await window.api.note.delete(id), 'noteDelete');
  }

  // ============== Digest ==============

  async digestList(): Promise<DataSourceState<Digest[]>> {
    return unwrap(await window.api.digest.list());
  }

  async digestGet(id: string): Promise<DataSourceState<Digest>> {
    return unwrap(await window.api.digest.get(id));
  }

  async digestCreate(input: DigestCreateInput): Promise<DataSourceState<Digest>> {
    return unwrap(await window.api.digest.create(input));
  }

  async digestDelete(id: string): Promise<void> {
    throwOnError(await window.api.digest.delete(id), 'digestDelete');
  }

  async digestExport(id: string, format: ExportFormat): Promise<DataSourceState<string>> {
    return unwrap(await window.api.digest.export(id, format));
  }

  // ============== Topic ==============

  async topicList(): Promise<DataSourceState<Topic[]>> {
    return unwrap(await window.api.topic.list());
  }

  async topicGet(id: string): Promise<DataSourceState<Topic>> {
    return unwrap(await window.api.topic.get(id));
  }

  async topicCreate(input: TopicCreateInput): Promise<DataSourceState<Topic>> {
    return unwrap(await window.api.topic.create(input));
  }

  async topicUpdate(id: string, input: TopicUpdateInput): Promise<DataSourceState<Topic>> {
    return unwrap(await window.api.topic.update(id, input));
  }

  async topicDelete(id: string): Promise<void> {
    throwOnError(await window.api.topic.delete(id), 'topicDelete');
  }

  async topicGetArticles(topicId: string): Promise<DataSourceState<Article[]>> {
    return unwrap(await window.api.topic.getArticles(topicId));
  }

  async topicGetGraph(topicId: string): Promise<DataSourceState<TopicGraph>> {
    return unwrap(await window.api.topic.getGraph(topicId));
  }

  async topicGetTimeline(topicId: string): Promise<DataSourceState<TimelineEntry[]>> {
    return unwrap(await window.api.topic.getTimeline(topicId));
  }

  async topicGetEventGroups(topicId: string): Promise<DataSourceState<EventGroup[]>> {
    return unwrap(await window.api.topic.getEventGroups(topicId));
  }

  async topicGenerateBriefing(topicId: string): Promise<{ ok: boolean; message: string }> {
    const r = await window.api.topic.generateBriefing(topicId);
    return r.success ? { ok: true, message: '已生成' } : { ok: false, message: r.error?.message ?? '生成失败' };
  }

  async topicGetBriefing(topicId: string): Promise<DataSourceState<Briefing | null>> {
    return unwrap(await window.api.topic.getBriefing(topicId));
  }

  async topicUpdateBriefing(topicId: string, editedContent: string): Promise<DataSourceState<Briefing>> {
    return unwrap(await window.api.topic.updateBriefing(topicId, editedContent));
  }

  async topicExportBriefing(topicId: string, format: ExportFormat): Promise<DataSourceState<string>> {
    return unwrap(await window.api.topic.exportBriefing(topicId, format));
  }

  // ============== AI Provider ==============

  async aiProviderList(): Promise<DataSourceState<AIProvider[]>> {
    return unwrap(await window.api.ai.providerList());
  }

  async aiProviderCreate(input: AIProviderCreateInput): Promise<DataSourceState<AIProvider>> {
    return unwrap(await window.api.ai.providerCreate(input));
  }

  async aiProviderUpdate(id: string, input: AIProviderUpdateInput): Promise<DataSourceState<AIProvider>> {
    return unwrap(await window.api.ai.providerUpdate(id, input));
  }

  async aiProviderDelete(id: string): Promise<void> {
    throwOnError(await window.api.ai.providerDelete(id), 'aiProviderDelete');
  }

  async aiProviderTest(id: string): Promise<{ ok: boolean; message: string }> {
    const r = await window.api.ai.providerTest(id);
    if (!r.success) return { ok: false, message: `${r.error.code}: ${r.error.message}` };
    return r.data;
  }

  // ============== AI Operations ==============

  async aiGenerateSummary(
    articleId: string,
    language?: Language,
    detailLevel?: SummaryDetailLevel
  ): Promise<{ ok: boolean; message: string }> {
    const r = await window.api.ai.generateSummary(articleId, language, detailLevel);
    if (!r.success) return { ok: false, message: `${r.error.code}: ${r.error.message}` };
    return { ok: true, message: '摘要已生成' };
  }

  async aiGetSummary(articleId: string): Promise<DataSourceState<string>> {
    const r = await window.api.ai.getSummary(articleId);
    if (!r.success) return toError(r);
    if (!r.data) return { kind: 'error', error: 'AI_RESULT_NOT_FOUND: 未找到摘要结果' };
    return { kind: 'ready', data: r.data.content };
  }

  async aiGenerateTranslation(
    articleId: string,
    targetLanguage?: Language
  ): Promise<{ ok: boolean; message: string }> {
    const r = await window.api.ai.generateTranslation(articleId, targetLanguage);
    if (!r.success) return { ok: false, message: `${r.error.code}: ${r.error.message}` };
    return { ok: true, message: '翻译已生成' };
  }

  aiSubscribeTranslationProgress(
    articleId: string,
    listener: (event: AITranslationProgressEvent) => void
  ): () => void {
    return window.api.ai.onTranslationProgress((event) => {
      if (event.articleId === articleId) listener(event);
    });
  }

  async aiGetTranslation(articleId: string): Promise<DataSourceState<Array<{ index: number; original: string; translated: string }>>> {
    const r = await window.api.ai.getTranslation(articleId);
    if (!r.success) return toError(r);
    if (!r.data) return { kind: 'error', error: 'AI_RESULT_NOT_FOUND: 未找到翻译结果' };
    return { kind: 'ready', data: r.data.paragraphs };
  }

  async aiSuggestTags(articleId: string): Promise<{ ok: boolean; message: string }> {
    const r = await window.api.ai.suggestTags(articleId);
    if (!r.success) return { ok: false, message: `${r.error.code}: ${r.error.message}` };
    return { ok: true, message: '标签建议已生成' };
  }

  async aiGetTagSuggestions(articleId: string): Promise<DataSourceState<Array<{ name: string; confidence: number; reason: string }>>> {
    const r = await window.api.ai.getTagSuggestions(articleId);
    if (!r.success) return toError(r);
    if (!r.data) return { kind: 'error', error: 'AI_RESULT_NOT_FOUND: 未找到标签建议' };
    return { kind: 'ready', data: r.data.suggestions };
  }

  // ============== Settings ==============

  async settingsGet(): Promise<DataSourceState<AppSettings>> {
    return unwrap(await window.api.settings.get());
  }

  async settingsUpdate(settings: Partial<AppSettings>): Promise<DataSourceState<AppSettings>> {
    return unwrap(await window.api.settings.update(settings));
  }

  // ============== Log ==============

  async logList(limit?: number): Promise<DataSourceState<LogEntry[]>> {
    return unwrap(await window.api.log.list(limit));
  }

  async logExport(): Promise<DataSourceState<string>> {
    return unwrap(await window.api.log.export());
  }

  // ============== OPML ==============

  async opmlImport(): Promise<DataSourceState<OpmlImportResult | null>> {
    return unwrap(await window.api.opml.import());
  }

  async opmlExport(feedIds?: string[]): Promise<DataSourceState<boolean>> {
    return unwrap(await window.api.opml.export(feedIds));
  }
}
