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
    throw new Error(`${r.error.code}: ${r.error.message}`);
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

  // --- Topic（Phase 3.3 已实现，UI 暂时只 list/create/update/delete）---
  topicList(): Promise<DataSourceState<Topic[]>>;
  topicGet(id: string): Promise<DataSourceState<Topic>>;
  topicCreate(input: TopicCreateInput): Promise<DataSourceState<Topic>>;
  topicUpdate(id: string, input: TopicUpdateInput): Promise<DataSourceState<Topic>>;
  topicDelete(id: string): Promise<void>;
  topicGetArticles(topicId: string): Promise<DataSourceState<Article[]>>;

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
  opmlExport(): Promise<DataSourceState<boolean>>;

  // --- Content ---
  getCleanedMarkdown(articleId: string): Promise<DataSourceState<string>>;
}

export class IpcDataSource implements FullDataSource {
  async feeds(): Promise<DataSourceState<Feed[]>> {
    return unwrap(await window.api.feed.list());
  }

  async articles(filter: {
    feedId?: string;
    isRead?: boolean;
    isStarred?: boolean;
  }): Promise<DataSourceState<Article[]>> {
    const r = await window.api.article.list(filter);
    if (!r.success) return toError(r);
    return { kind: 'ready', data: r.data.items };
  }

  async markRead(articleId: string, isRead: boolean): Promise<void> {
    const r = await window.api.article.markRead(articleId, isRead);
    throwOnError(r, 'markRead');
  }

  async markStarred(articleId: string, isStarred: boolean): Promise<void> {
    const r = await window.api.article.markStarred(articleId, isStarred);
    throwOnError(r, 'markStarred');
  }

  async syncFeed(feedId: string): Promise<{ ok: boolean; message: string }> {
    const r = await window.api.sync.feed(feedId);
    if (!r.success) return { ok: false, message: `${r.error.code}: ${r.error.message}` };
    const result = r.data;
    if (result.success) {
      return {
        ok: true,
        message: `同步成功（新增 ${result.newArticles}，更新 ${result.updatedArticles}）`
      };
    }
    return { ok: false, message: result.error ?? '同步失败' };
  }

  async createFeed(url: string, title?: string): Promise<DataSourceState<Feed>> {
    return unwrap(await window.api.feed.create({ url, title }));
  }

  async getCleanedHtml(articleId: string): Promise<DataSourceState<string>> {
    return unwrap(await window.api.content.getCleanedHtml(articleId));
  }

  async getCleanedMarkdown(articleId: string): Promise<DataSourceState<string>> {
    return unwrap(await window.api.content.getCleanedMarkdown(articleId));
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
    return unwrap(await window.api.ai.getSummary(articleId));
  }

  async aiGenerateTranslation(
    articleId: string,
    targetLanguage?: Language
  ): Promise<{ ok: boolean; message: string }> {
    const r = await window.api.ai.generateTranslation(articleId, targetLanguage);
    if (!r.success) return { ok: false, message: `${r.error.code}: ${r.error.message}` };
    return { ok: true, message: '翻译已生成' };
  }

  async aiGetTranslation(articleId: string): Promise<DataSourceState<Array<{ index: number; original: string; translated: string }>>> {
    return unwrap(await window.api.ai.getTranslation(articleId));
  }

  async aiSuggestTags(articleId: string): Promise<{ ok: boolean; message: string }> {
    const r = await window.api.ai.suggestTags(articleId);
    if (!r.success) return { ok: false, message: `${r.error.code}: ${r.error.message}` };
    return { ok: true, message: '标签建议已生成' };
  }

  async aiGetTagSuggestions(articleId: string): Promise<DataSourceState<Array<{ name: string; confidence: number; reason: string }>>> {
    return unwrap(await window.api.ai.getTagSuggestions(articleId));
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

  async opmlExport(): Promise<DataSourceState<boolean>> {
    return unwrap(await window.api.opml.export());
  }
}
