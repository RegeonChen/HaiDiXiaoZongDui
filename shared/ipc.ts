// ============================================================
// shared/ipc.ts — IPC 通道定义与请求/响应类型
// Task 1.2: Shared Contracts (Phase 1)
//
// 本文件由张晨阳、张宇凡、陈冠中共同维护。
// 跨模块接口变更需要三人确认并同步更新本文件。
//
// 设计约束：
//   - 每个 IPC 请求在 Main 进程验证，返回结构化成功/错误结果
//   - Renderer 不得直接访问 Node.js、文件系统、Shell 或 SQLite
//   - 所有能力通过预定义的 channels 暴露，preload 仅桥接这些 channels
// ============================================================

import type {
  Feed, FeedCreateInput, FeedUpdateInput,
  Article, ArticleFilter,
  Tag, TagCreateInput, TagUpdateInput,
  Note, NoteCreateInput, NoteUpdateInput,
  Digest, DigestCreateInput, ExportFormat,
  Topic, TopicCreateInput, TopicUpdateInput,
  EventGroup, Briefing, TimelineEntry, TopicGraph,
  AIProvider, AIProviderCreateInput, AIProviderUpdateInput,
  AISummary, AITranslation, AITagSuggestion, SummaryDetailLevel,
  SyncResult, SyncProgress,
  AppSettings,
  LogEntry,
  OpmlImportResult,
  Language,
  HtmlBlock,
} from './types';

// ============================================================
// 标准响应格式
// ============================================================

/** 所有 IPC 调用的统一响应格式 */
export type IpcResult<T> =
  | { success: true; data: T }
  | { success: false; error: IpcError };

export interface IpcError {
  /** 机器可读的错误码 */
  code: string;
  /** 面向用户的可读消息（已本地化） */
  message: string;
  /** 调试用详情（不含敏感信息） */
  detail?: string;
}

/** 无返回数据的成功响应辅助类型 */
export type IpcVoidResult = IpcResult<void>;

// ============================================================
// IPC 通道名称
// ============================================================

/**
 * 所有 IPC 通道名称常量。
 * Main 进程用 ipcMain.handle 注册，preload 桥接暴露给 Renderer。
 *
 * 命名规范：`domain:action`
 *   - feed:*     订阅源管理（张宇凡）
 *   - article:*  文章与阅读（张晨阳读取，张宇凡/陈冠中写入）
 *   - sync:*     同步操作（张宇凡）
 *   - content:*  内容清洗（张宇凡）
 *   - tag:*      标签管理（陈冠中）
 *   - note:*     笔记与摘录（陈冠中）
 *   - digest:*   文摘（陈冠中）
 *   - topic:*    专题追踪（陈冠中，张晨阳读取）
 *   - ai:*       AI 服务（陈冠中）
 *   - settings:* 用户设置（张晨阳）
 *   - log:*      日志（全员）
 *   - opml:*     OPML 导入导出（张宇凡）
 */

export const IPC_CHANNELS = {
  // -- Feed（订阅源） --
  FEED_LIST:       'feed:list',
  FEED_GET:        'feed:get',
  FEED_CREATE:     'feed:create',
  FEED_UPDATE:     'feed:update',
  FEED_DELETE:     'feed:delete',

  // -- Article（文章） --
  ARTICLE_LIST:    'article:list',
  ARTICLE_GET:     'article:get',
  ARTICLE_MARK_READ:    'article:markRead',
  ARTICLE_MARK_STARRED: 'article:markStarred',
  ARTICLE_BATCH_MARK_READ: 'article:batchMarkRead',

  // -- Article Counts（Phase 3.6.3：侧栏计数） --
  ARTICLE_COUNTS:  'article:counts',
  // Phase 3.5.x:按 tag 统计文章数(侧栏 tab=tags 展示用)
  ARTICLE_COUNTS_BY_TAG: 'article:countsByTag',

  // -- Sync（同步） --
  SYNC_ALL:        'sync:all',
  SYNC_FEED:       'sync:feed',
  SYNC_PROGRESS:   'sync:progress',

  // -- Content（内容清洗） --
  CONTENT_GET_CLEANED_HTML:      'content:getCleanedHtml',
  CONTENT_GET_CLEANED_MARKDOWN:  'content:getCleanedMarkdown',
  // Phase 3.5.2（张宇凡 b53e7a2）：切分 cleaned HTML 为独立块，给段落内翻译插槽用
  HTML_BLOCK_SPLIT:              'content:splitHtmlBlocks',

  // -- Tag（标签） --
  TAG_LIST:        'tag:list',
  TAG_CREATE:      'tag:create',
  TAG_UPDATE:      'tag:update',
  TAG_DELETE:      'tag:delete',
  TAG_ADD_TO_ARTICLE:      'tag:addToArticle',
  TAG_REMOVE_FROM_ARTICLE: 'tag:removeFromArticle',
  TAG_BATCH_ADD:           'tag:batchAdd',
  /** 获取某篇文章已应用的全部标签（用于 ArticleReader 显示当前 tag 列表） */
  TAG_GET_BY_ARTICLE:      'tag:getByArticle',

  // -- Note（笔记） --
  NOTE_LIST_BY_ARTICLE: 'note:listByArticle',
  NOTE_CREATE:          'note:create',
  NOTE_UPDATE:          'note:update',
  NOTE_DELETE:          'note:delete',

  // -- Digest（文摘） --
  DIGEST_LIST:     'digest:list',
  DIGEST_GET:      'digest:get',
  DIGEST_CREATE:   'digest:create',
  DIGEST_DELETE:   'digest:delete',
  DIGEST_EXPORT:   'digest:export',

  // -- Topic（专题） --
  TOPIC_LIST:          'topic:list',
  TOPIC_GET:           'topic:get',
  TOPIC_CREATE:        'topic:create',
  TOPIC_UPDATE:        'topic:update',
  TOPIC_DELETE:        'topic:delete',
  TOPIC_GET_ARTICLES:  'topic:getArticles',
  TOPIC_GET_GRAPH:     'topic:getGraph',
  TOPIC_GET_TIMELINE:  'topic:getTimeline',
  TOPIC_GET_EVENT_GROUPS: 'topic:getEventGroups',
  TOPIC_GENERATE_BRIEFING: 'topic:generateBriefing',
  TOPIC_GET_BRIEFING:  'topic:getBriefing',
  TOPIC_UPDATE_BRIEFING: 'topic:updateBriefing',
  TOPIC_EXPORT_BRIEFING: 'topic:exportBriefing',

  // -- AI Provider（AI 模型配置） --
  AI_PROVIDER_LIST:       'ai:providerList',
  AI_PROVIDER_CREATE:     'ai:providerCreate',
  AI_PROVIDER_UPDATE:     'ai:providerUpdate',
  AI_PROVIDER_DELETE:     'ai:providerDelete',
  AI_PROVIDER_TEST:       'ai:providerTest',

  // -- AI 操作 --
  AI_GENERATE_SUMMARY:    'ai:generateSummary',
  AI_GENERATE_TRANSLATION:'ai:generateTranslation',
  AI_SUGGEST_TAGS:        'ai:suggestTags',
  AI_GET_SUMMARY:         'ai:getSummary',
  AI_GET_TRANSLATION:     'ai:getTranslation',
  AI_GET_TAG_SUGGESTIONS: 'ai:getTagSuggestions',

  // -- Settings（设置） --
  SETTINGS_GET:    'settings:get',
  SETTINGS_UPDATE: 'settings:update',

  // -- Log（日志） --
  LOG_LIST:        'log:list',
  LOG_EXPORT:      'log:export',

  // -- OPML --
  OPML_IMPORT:     'opml:import',
  OPML_EXPORT:     'opml:export',
} as const;

export type IpcChannel = typeof IPC_CHANNELS[keyof typeof IPC_CHANNELS];

/**
 * 单向进度事件。它们不是 `ipcRenderer.invoke()` 请求，故不放入 IpcRequestMap。
 */
export const IPC_EVENTS = {
  AI_TRANSLATION_PROGRESS: 'ai:translationProgress'
} as const;

// ============================================================
// 请求/响应类型映射
// ============================================================

/**
 * 每个 IPC 通道的请求参数和响应数据类型。
 *
 * 使用方式：
 *   Main:  ipcMain.handle(channel, (_, args: IpcRequest<T>) => IpcResponse<T>)
 *   Preload:  ipcRenderer.invoke(channel, args)
 *   Renderer:  window.api.method(args) => Promise<IpcResult<Data>>
 */

export interface IpcRequestMap {
  // -- Feed --
  [IPC_CHANNELS.FEED_LIST]:   { args: void;                     result: Feed[] };
  [IPC_CHANNELS.FEED_GET]:    { args: { id: string };           result: Feed };
  [IPC_CHANNELS.FEED_CREATE]: { args: { input: FeedCreateInput }; result: Feed };
  [IPC_CHANNELS.FEED_UPDATE]: { args: { id: string; input: FeedUpdateInput }; result: Feed };
  [IPC_CHANNELS.FEED_DELETE]: { args: { id: string };           result: void };

  // -- Article --
  [IPC_CHANNELS.ARTICLE_LIST]:            { args: { filter?: ArticleFilter }; result: { items: Article[]; total: number } };
  [IPC_CHANNELS.ARTICLE_GET]:             { args: { id: string };             result: Article };
  [IPC_CHANNELS.ARTICLE_MARK_READ]:       { args: { id: string; isRead: boolean };      result: void };
  [IPC_CHANNELS.ARTICLE_MARK_STARRED]:    { args: { id: string; isStarred: boolean };   result: void };
  [IPC_CHANNELS.ARTICLE_BATCH_MARK_READ]: { args: { ids: string[]; isRead: boolean };   result: void };

  // -- Article Counts（Phase 3.6.3） --
  [IPC_CHANNELS.ARTICLE_COUNTS]: { args: void; result: { all: number; unread: number; starred: number } };
  // Phase 3.5.x:按 tag 统计文章数
  [IPC_CHANNELS.ARTICLE_COUNTS_BY_TAG]: { args: void; result: Record<string, number> };

  // -- Sync --
  [IPC_CHANNELS.SYNC_ALL]:      { args: void;                                  result: SyncResult[] };
  [IPC_CHANNELS.SYNC_FEED]:     { args: { feedId: string };                    result: SyncResult };
  [IPC_CHANNELS.SYNC_PROGRESS]: { args: void;                                  result: SyncProgress };

  // -- Content --
  [IPC_CHANNELS.CONTENT_GET_CLEANED_HTML]:     { args: { articleId: string }; result: string };
  [IPC_CHANNELS.CONTENT_GET_CLEANED_MARKDOWN]: { args: { articleId: string }; result: string };
  // Phase 3.5.2: 段落内翻译切块 — UI 端按块挂 TranslationSlot，主进程用 JSDOM 切顶层块级元素
  [IPC_CHANNELS.HTML_BLOCK_SPLIT]:             { args: { html: string };    result: HtmlBlock[] };

  // -- Tag --
  [IPC_CHANNELS.TAG_LIST]:               { args: void;                                           result: Tag[] };
  [IPC_CHANNELS.TAG_CREATE]:             { args: { input: TagCreateInput };                      result: Tag };
  [IPC_CHANNELS.TAG_UPDATE]:             { args: { id: string; input: TagUpdateInput };          result: Tag };
  [IPC_CHANNELS.TAG_DELETE]:             { args: { id: string };                                 result: void };
  [IPC_CHANNELS.TAG_ADD_TO_ARTICLE]:     { args: { articleId: string; tagId: string };           result: void };
  [IPC_CHANNELS.TAG_REMOVE_FROM_ARTICLE]:{ args: { articleId: string; tagId: string };           result: void };
  [IPC_CHANNELS.TAG_BATCH_ADD]:          { args: { articleIds: string[]; tagIds: string[] };     result: void };
  [IPC_CHANNELS.TAG_GET_BY_ARTICLE]:     { args: { articleId: string };                          result: Tag[] };

  // -- Note --
  [IPC_CHANNELS.NOTE_LIST_BY_ARTICLE]: { args: { articleId: string };                  result: Note[] };
  [IPC_CHANNELS.NOTE_CREATE]:          { args: { input: NoteCreateInput };              result: Note };
  [IPC_CHANNELS.NOTE_UPDATE]:          { args: { id: string; input: NoteUpdateInput };  result: Note };
  [IPC_CHANNELS.NOTE_DELETE]:          { args: { id: string };                          result: void };

  // -- Digest --
  [IPC_CHANNELS.DIGEST_LIST]:   { args: void;                                    result: Digest[] };
  [IPC_CHANNELS.DIGEST_GET]:    { args: { id: string };                          result: Digest };
  [IPC_CHANNELS.DIGEST_CREATE]: { args: { input: DigestCreateInput };            result: Digest };
  [IPC_CHANNELS.DIGEST_DELETE]: { args: { id: string };                          result: void };
  [IPC_CHANNELS.DIGEST_EXPORT]: { args: { id: string; format: ExportFormat };    result: string };

  // -- Topic --
  [IPC_CHANNELS.TOPIC_LIST]:              { args: void;                                                result: Topic[] };
  [IPC_CHANNELS.TOPIC_GET]:               { args: { id: string };                                      result: Topic };
  [IPC_CHANNELS.TOPIC_CREATE]:            { args: { input: TopicCreateInput };                         result: Topic };
  [IPC_CHANNELS.TOPIC_UPDATE]:            { args: { id: string; input: TopicUpdateInput };             result: Topic };
  [IPC_CHANNELS.TOPIC_DELETE]:            { args: { id: string };                                      result: void };
  [IPC_CHANNELS.TOPIC_GET_ARTICLES]:      { args: { topicId: string };                                 result: Article[] };
  [IPC_CHANNELS.TOPIC_GET_GRAPH]:         { args: { topicId: string };                                 result: TopicGraph };
  [IPC_CHANNELS.TOPIC_GET_TIMELINE]:      { args: { topicId: string };                                 result: TimelineEntry[] };
  [IPC_CHANNELS.TOPIC_GET_EVENT_GROUPS]:  { args: { topicId: string };                                 result: EventGroup[] };
  [IPC_CHANNELS.TOPIC_GENERATE_BRIEFING]: { args: { topicId: string };                                 result: Briefing };
  [IPC_CHANNELS.TOPIC_GET_BRIEFING]:      { args: { topicId: string };                                 result: Briefing | null };
  [IPC_CHANNELS.TOPIC_UPDATE_BRIEFING]:   { args: { topicId: string; editedContent: string };          result: Briefing };
  [IPC_CHANNELS.TOPIC_EXPORT_BRIEFING]:   { args: { topicId: string; format: ExportFormat };           result: string };

  // -- AI Provider --
  [IPC_CHANNELS.AI_PROVIDER_LIST]:   { args: void;                                         result: AIProvider[] };
  [IPC_CHANNELS.AI_PROVIDER_CREATE]: { args: { input: AIProviderCreateInput };             result: AIProvider };
  [IPC_CHANNELS.AI_PROVIDER_UPDATE]: { args: { id: string; input: AIProviderUpdateInput }; result: AIProvider };
  [IPC_CHANNELS.AI_PROVIDER_DELETE]: { args: { id: string };                               result: void };
  [IPC_CHANNELS.AI_PROVIDER_TEST]:   { args: { id: string };                               result: { ok: boolean; message: string } };

  // -- AI 操作 --
  [IPC_CHANNELS.AI_GENERATE_SUMMARY]:     { args: { articleId: string; language?: Language; detailLevel?: SummaryDetailLevel }; result: AISummary };
  [IPC_CHANNELS.AI_GENERATE_TRANSLATION]: { args: { articleId: string; targetLanguage?: Language };                               result: AITranslation };
  [IPC_CHANNELS.AI_SUGGEST_TAGS]:         { args: { articleId: string };                                                          result: AITagSuggestion };
  [IPC_CHANNELS.AI_GET_SUMMARY]:          { args: { articleId: string };                                                          result: AISummary | null };
  [IPC_CHANNELS.AI_GET_TRANSLATION]:      { args: { articleId: string };                                                          result: AITranslation | null };
  [IPC_CHANNELS.AI_GET_TAG_SUGGESTIONS]:  { args: { articleId: string };                                                          result: AITagSuggestion | null };

  // -- Settings --
  [IPC_CHANNELS.SETTINGS_GET]:    { args: void;                               result: AppSettings };
  [IPC_CHANNELS.SETTINGS_UPDATE]: { args: { settings: Partial<AppSettings> }; result: AppSettings };

  // -- Log --
  [IPC_CHANNELS.LOG_LIST]:  { args: { limit?: number };  result: LogEntry[] };
  [IPC_CHANNELS.LOG_EXPORT]:{ args: void;                 result: string };

  // -- OPML --
  /** Main 进程显示原生文件选择器；Renderer 不得传入任意路径。null 表示用户取消。 */
  [IPC_CHANNELS.OPML_IMPORT]: { args: void; result: OpmlImportResult | null };
  /** Main 进程显示原生保存对话框；false 表示用户取消。 */
  [IPC_CHANNELS.OPML_EXPORT]: { args: void; result: boolean };
}

// ============================================================
// 辅助类型：从 IpcRequestMap 提取单个通道的请求/响应类型
// ============================================================

/** 提取指定 channel 的请求参数类型 */
export type IpcArgs<C extends IpcChannel> = IpcRequestMap[C]['args'];

/** 提取指定 channel 的响应数据类型 */
export type IpcData<C extends IpcChannel> = IpcRequestMap[C]['result'];

/** 提取指定 channel 的完整 IpcResult 类型 */
export type IpcResponse<C extends IpcChannel> = IpcResult<IpcData<C>>;
