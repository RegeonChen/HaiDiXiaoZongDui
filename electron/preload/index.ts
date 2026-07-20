/**
 * 聚合拾遗 — Preload 安全桥
 * Phase 2: Core Reading Workflow
 *
 * 职责：
 *  - 在 sandbox 环境下用 contextBridge 暴露 window.api
 *  - 只暴露 shared/ipc.ts 约定的 IPC 通道
 *  - 绝不暴露 ipcRenderer / process / require / fs 之类的底层 API
 */
import { contextBridge, ipcRenderer } from 'electron';
import type { IpcRendererEvent } from 'electron';
import {
  IPC_CHANNELS,
  IPC_EVENTS,
  type IpcResponse,
  type IpcArgs,
  type IpcChannel
} from '../../shared/ipc.js';
import type { AITranslationProgressEvent } from '../../shared/types.js';

// ============================================================
// 辅助：类型安全的 invoke 封装
// ============================================================

function invoke<C extends IpcChannel>(
  channel: C,
  args: IpcArgs<C>
): Promise<IpcResponse<C>> {
  return ipcRenderer.invoke(channel, args) as Promise<IpcResponse<C>>;
}

function invokeVoid<C extends IpcChannel>(
  channel: C
): Promise<IpcResponse<C>> {
  return ipcRenderer.invoke(channel) as Promise<IpcResponse<C>>;
}

// ============================================================
// 类型契约
// ============================================================

const api = {
  // —— Feed ——
  feed: {
    list: (): Promise<IpcResponse<typeof IPC_CHANNELS.FEED_LIST>> =>
      invokeVoid(IPC_CHANNELS.FEED_LIST),

    get: (id: string): Promise<IpcResponse<typeof IPC_CHANNELS.FEED_GET>> =>
      invoke(IPC_CHANNELS.FEED_GET, { id }),

    create: (input: IpcArgs<typeof IPC_CHANNELS.FEED_CREATE>['input']): Promise<IpcResponse<typeof IPC_CHANNELS.FEED_CREATE>> =>
      invoke(IPC_CHANNELS.FEED_CREATE, { input }),

    update: (id: string, input: IpcArgs<typeof IPC_CHANNELS.FEED_UPDATE>['input']): Promise<IpcResponse<typeof IPC_CHANNELS.FEED_UPDATE>> =>
      invoke(IPC_CHANNELS.FEED_UPDATE, { id, input }),

    delete: (id: string): Promise<IpcResponse<typeof IPC_CHANNELS.FEED_DELETE>> =>
      invoke(IPC_CHANNELS.FEED_DELETE, { id })
  },

  // —— Article ——
  article: {
    list: (filter?: IpcArgs<typeof IPC_CHANNELS.ARTICLE_LIST>['filter']): Promise<IpcResponse<typeof IPC_CHANNELS.ARTICLE_LIST>> =>
      invoke(IPC_CHANNELS.ARTICLE_LIST, { filter }),

    get: (id: string): Promise<IpcResponse<typeof IPC_CHANNELS.ARTICLE_GET>> =>
      invoke(IPC_CHANNELS.ARTICLE_GET, { id }),

    markRead: (id: string, isRead: boolean): Promise<IpcResponse<typeof IPC_CHANNELS.ARTICLE_MARK_READ>> =>
      invoke(IPC_CHANNELS.ARTICLE_MARK_READ, { id, isRead }),

    markStarred: (id: string, isStarred: boolean): Promise<IpcResponse<typeof IPC_CHANNELS.ARTICLE_MARK_STARRED>> =>
      invoke(IPC_CHANNELS.ARTICLE_MARK_STARRED, { id, isStarred }),

    batchMarkRead: (ids: string[], isRead: boolean): Promise<IpcResponse<typeof IPC_CHANNELS.ARTICLE_BATCH_MARK_READ>> =>
      invoke(IPC_CHANNELS.ARTICLE_BATCH_MARK_READ, { ids, isRead }),

    // Phase 3.6.3：侧栏计数
    counts: (): Promise<IpcResponse<typeof IPC_CHANNELS.ARTICLE_COUNTS>> =>
      invokeVoid(IPC_CHANNELS.ARTICLE_COUNTS)
  },

  // —— Sync ——
  sync: {
    feed: (feedId: string): Promise<IpcResponse<typeof IPC_CHANNELS.SYNC_FEED>> =>
      invoke(IPC_CHANNELS.SYNC_FEED, { feedId }),

    all: (): Promise<IpcResponse<typeof IPC_CHANNELS.SYNC_ALL>> =>
      invokeVoid(IPC_CHANNELS.SYNC_ALL),

    progress: (): Promise<IpcResponse<typeof IPC_CHANNELS.SYNC_PROGRESS>> =>
      invokeVoid(IPC_CHANNELS.SYNC_PROGRESS)
  },

  // —— Content ——
  content: {
    getCleanedHtml: (articleId: string): Promise<IpcResponse<typeof IPC_CHANNELS.CONTENT_GET_CLEANED_HTML>> =>
      invoke(IPC_CHANNELS.CONTENT_GET_CLEANED_HTML, { articleId }),

    getCleanedMarkdown: (articleId: string): Promise<IpcResponse<typeof IPC_CHANNELS.CONTENT_GET_CLEANED_MARKDOWN>> =>
      invoke(IPC_CHANNELS.CONTENT_GET_CLEANED_MARKDOWN, { articleId }),

    // Phase 3.5.2：cleaned HTML 切分为顶层块（段落内翻译插槽用）
    splitHtmlBlocks: (html: string): Promise<IpcResponse<typeof IPC_CHANNELS.HTML_BLOCK_SPLIT>> =>
      invoke(IPC_CHANNELS.HTML_BLOCK_SPLIT, { html })
  },

  // —— OPML ——
  opml: {
    import: (): Promise<IpcResponse<typeof IPC_CHANNELS.OPML_IMPORT>> =>
      invokeVoid(IPC_CHANNELS.OPML_IMPORT),

    export: (): Promise<IpcResponse<typeof IPC_CHANNELS.OPML_EXPORT>> =>
      invokeVoid(IPC_CHANNELS.OPML_EXPORT)
  },

  // —— Settings ——
  settings: {
    get: (): Promise<IpcResponse<typeof IPC_CHANNELS.SETTINGS_GET>> =>
      invokeVoid(IPC_CHANNELS.SETTINGS_GET),

    update: (settings: IpcArgs<typeof IPC_CHANNELS.SETTINGS_UPDATE>['settings']): Promise<IpcResponse<typeof IPC_CHANNELS.SETTINGS_UPDATE>> =>
      invoke(IPC_CHANNELS.SETTINGS_UPDATE, { settings })
  },

  // —— AI (Task 3.3) ——
  ai: {
    providerList: (): Promise<IpcResponse<typeof IPC_CHANNELS.AI_PROVIDER_LIST>> =>
      invokeVoid(IPC_CHANNELS.AI_PROVIDER_LIST),

    providerCreate: (input: IpcArgs<typeof IPC_CHANNELS.AI_PROVIDER_CREATE>['input']): Promise<IpcResponse<typeof IPC_CHANNELS.AI_PROVIDER_CREATE>> =>
      invoke(IPC_CHANNELS.AI_PROVIDER_CREATE, { input }),

    providerUpdate: (id: string, input: IpcArgs<typeof IPC_CHANNELS.AI_PROVIDER_UPDATE>['input']): Promise<IpcResponse<typeof IPC_CHANNELS.AI_PROVIDER_UPDATE>> =>
      invoke(IPC_CHANNELS.AI_PROVIDER_UPDATE, { id, input }),

    providerDelete: (id: string): Promise<IpcResponse<typeof IPC_CHANNELS.AI_PROVIDER_DELETE>> =>
      invoke(IPC_CHANNELS.AI_PROVIDER_DELETE, { id }),

    providerTest: (id: string): Promise<IpcResponse<typeof IPC_CHANNELS.AI_PROVIDER_TEST>> =>
      invoke(IPC_CHANNELS.AI_PROVIDER_TEST, { id }),

    generateSummary: (articleId: string, language?: IpcArgs<typeof IPC_CHANNELS.AI_GENERATE_SUMMARY>['language'], detailLevel?: IpcArgs<typeof IPC_CHANNELS.AI_GENERATE_SUMMARY>['detailLevel']): Promise<IpcResponse<typeof IPC_CHANNELS.AI_GENERATE_SUMMARY>> =>
      invoke(IPC_CHANNELS.AI_GENERATE_SUMMARY, { articleId, language, detailLevel }),

    generateTranslation: (articleId: string, targetLanguage?: IpcArgs<typeof IPC_CHANNELS.AI_GENERATE_TRANSLATION>['targetLanguage']): Promise<IpcResponse<typeof IPC_CHANNELS.AI_GENERATE_TRANSLATION>> =>
      invoke(IPC_CHANNELS.AI_GENERATE_TRANSLATION, { articleId, targetLanguage }),

    onTranslationProgress: (listener: (event: AITranslationProgressEvent) => void): (() => void) => {
      const handler = (_event: IpcRendererEvent, progress: AITranslationProgressEvent): void => {
        listener(progress);
      };
      ipcRenderer.on(IPC_EVENTS.AI_TRANSLATION_PROGRESS, handler);
      return () => ipcRenderer.removeListener(IPC_EVENTS.AI_TRANSLATION_PROGRESS, handler);
    },

    suggestTags: (articleId: string): Promise<IpcResponse<typeof IPC_CHANNELS.AI_SUGGEST_TAGS>> =>
      invoke(IPC_CHANNELS.AI_SUGGEST_TAGS, { articleId }),

    getSummary: (articleId: string): Promise<IpcResponse<typeof IPC_CHANNELS.AI_GET_SUMMARY>> =>
      invoke(IPC_CHANNELS.AI_GET_SUMMARY, { articleId }),

    getTranslation: (articleId: string): Promise<IpcResponse<typeof IPC_CHANNELS.AI_GET_TRANSLATION>> =>
      invoke(IPC_CHANNELS.AI_GET_TRANSLATION, { articleId }),

    getTagSuggestions: (articleId: string): Promise<IpcResponse<typeof IPC_CHANNELS.AI_GET_TAG_SUGGESTIONS>> =>
      invoke(IPC_CHANNELS.AI_GET_TAG_SUGGESTIONS, { articleId })
  },

  // —— Tag (Task 3.3) ——
  tag: {
    list: (): Promise<IpcResponse<typeof IPC_CHANNELS.TAG_LIST>> =>
      invokeVoid(IPC_CHANNELS.TAG_LIST),

    create: (input: IpcArgs<typeof IPC_CHANNELS.TAG_CREATE>['input']): Promise<IpcResponse<typeof IPC_CHANNELS.TAG_CREATE>> =>
      invoke(IPC_CHANNELS.TAG_CREATE, { input }),

    update: (id: string, input: IpcArgs<typeof IPC_CHANNELS.TAG_UPDATE>['input']): Promise<IpcResponse<typeof IPC_CHANNELS.TAG_UPDATE>> =>
      invoke(IPC_CHANNELS.TAG_UPDATE, { id, input }),

    delete: (id: string): Promise<IpcResponse<typeof IPC_CHANNELS.TAG_DELETE>> =>
      invoke(IPC_CHANNELS.TAG_DELETE, { id }),

    addToArticle: (articleId: string, tagId: string): Promise<IpcResponse<typeof IPC_CHANNELS.TAG_ADD_TO_ARTICLE>> =>
      invoke(IPC_CHANNELS.TAG_ADD_TO_ARTICLE, { articleId, tagId }),

    removeFromArticle: (articleId: string, tagId: string): Promise<IpcResponse<typeof IPC_CHANNELS.TAG_REMOVE_FROM_ARTICLE>> =>
      invoke(IPC_CHANNELS.TAG_REMOVE_FROM_ARTICLE, { articleId, tagId }),

    batchAdd: (articleIds: string[], tagIds: string[]): Promise<IpcResponse<typeof IPC_CHANNELS.TAG_BATCH_ADD>> =>
      invoke(IPC_CHANNELS.TAG_BATCH_ADD, { articleIds, tagIds }),
    // 获取某篇文章已应用的全部标签（ArticleReader 显示当前标签用）
    getByArticle: (articleId: string): Promise<IpcResponse<typeof IPC_CHANNELS.TAG_GET_BY_ARTICLE>> =>
      invoke(IPC_CHANNELS.TAG_GET_BY_ARTICLE, { articleId })
  },

  // —— Note (Task 3.3) ——
  note: {
    listByArticle: (articleId: string): Promise<IpcResponse<typeof IPC_CHANNELS.NOTE_LIST_BY_ARTICLE>> =>
      invoke(IPC_CHANNELS.NOTE_LIST_BY_ARTICLE, { articleId }),

    create: (input: IpcArgs<typeof IPC_CHANNELS.NOTE_CREATE>['input']): Promise<IpcResponse<typeof IPC_CHANNELS.NOTE_CREATE>> =>
      invoke(IPC_CHANNELS.NOTE_CREATE, { input }),

    update: (id: string, input: IpcArgs<typeof IPC_CHANNELS.NOTE_UPDATE>['input']): Promise<IpcResponse<typeof IPC_CHANNELS.NOTE_UPDATE>> =>
      invoke(IPC_CHANNELS.NOTE_UPDATE, { id, input }),

    delete: (id: string): Promise<IpcResponse<typeof IPC_CHANNELS.NOTE_DELETE>> =>
      invoke(IPC_CHANNELS.NOTE_DELETE, { id })
  },

  // —— Digest (Task 3.3) ——
  digest: {
    list: (): Promise<IpcResponse<typeof IPC_CHANNELS.DIGEST_LIST>> =>
      invokeVoid(IPC_CHANNELS.DIGEST_LIST),

    get: (id: string): Promise<IpcResponse<typeof IPC_CHANNELS.DIGEST_GET>> =>
      invoke(IPC_CHANNELS.DIGEST_GET, { id }),

    create: (input: IpcArgs<typeof IPC_CHANNELS.DIGEST_CREATE>['input']): Promise<IpcResponse<typeof IPC_CHANNELS.DIGEST_CREATE>> =>
      invoke(IPC_CHANNELS.DIGEST_CREATE, { input }),

    delete: (id: string): Promise<IpcResponse<typeof IPC_CHANNELS.DIGEST_DELETE>> =>
      invoke(IPC_CHANNELS.DIGEST_DELETE, { id }),

    export: (id: string, format: IpcArgs<typeof IPC_CHANNELS.DIGEST_EXPORT>['format']): Promise<IpcResponse<typeof IPC_CHANNELS.DIGEST_EXPORT>> =>
      invoke(IPC_CHANNELS.DIGEST_EXPORT, { id, format })
  },

  // —— Topic (Phase 4 接入：stub handler 现在返回 NOT_IMPLEMENTED) ——
  topic: {
    list: (): Promise<IpcResponse<typeof IPC_CHANNELS.TOPIC_LIST>> =>
      invokeVoid(IPC_CHANNELS.TOPIC_LIST),

    get: (id: string): Promise<IpcResponse<typeof IPC_CHANNELS.TOPIC_GET>> =>
      invoke(IPC_CHANNELS.TOPIC_GET, { id }),

    create: (input: IpcArgs<typeof IPC_CHANNELS.TOPIC_CREATE>['input']): Promise<IpcResponse<typeof IPC_CHANNELS.TOPIC_CREATE>> =>
      invoke(IPC_CHANNELS.TOPIC_CREATE, { input }),

    update: (id: string, input: IpcArgs<typeof IPC_CHANNELS.TOPIC_UPDATE>['input']): Promise<IpcResponse<typeof IPC_CHANNELS.TOPIC_UPDATE>> =>
      invoke(IPC_CHANNELS.TOPIC_UPDATE, { id, input }),

    delete: (id: string): Promise<IpcResponse<typeof IPC_CHANNELS.TOPIC_DELETE>> =>
      invoke(IPC_CHANNELS.TOPIC_DELETE, { id }),

    getArticles: (topicId: string): Promise<IpcResponse<typeof IPC_CHANNELS.TOPIC_GET_ARTICLES>> =>
      invoke(IPC_CHANNELS.TOPIC_GET_ARTICLES, { topicId }),

    getTimeline: (topicId: string): Promise<IpcResponse<typeof IPC_CHANNELS.TOPIC_GET_TIMELINE>> =>
      invoke(IPC_CHANNELS.TOPIC_GET_TIMELINE, { topicId }),

    getEventGroups: (topicId: string): Promise<IpcResponse<typeof IPC_CHANNELS.TOPIC_GET_EVENT_GROUPS>> =>
      invoke(IPC_CHANNELS.TOPIC_GET_EVENT_GROUPS, { topicId }),

    generateBriefing: (topicId: string): Promise<IpcResponse<typeof IPC_CHANNELS.TOPIC_GENERATE_BRIEFING>> =>
      invoke(IPC_CHANNELS.TOPIC_GENERATE_BRIEFING, { topicId }),

    getBriefing: (topicId: string): Promise<IpcResponse<typeof IPC_CHANNELS.TOPIC_GET_BRIEFING>> =>
      invoke(IPC_CHANNELS.TOPIC_GET_BRIEFING, { topicId }),

    updateBriefing: (topicId: string, editedContent: string): Promise<IpcResponse<typeof IPC_CHANNELS.TOPIC_UPDATE_BRIEFING>> =>
      invoke(IPC_CHANNELS.TOPIC_UPDATE_BRIEFING, { topicId, editedContent }),

    exportBriefing: (topicId: string, format: IpcArgs<typeof IPC_CHANNELS.TOPIC_EXPORT_BRIEFING>['format']): Promise<IpcResponse<typeof IPC_CHANNELS.TOPIC_EXPORT_BRIEFING>> =>
      invoke(IPC_CHANNELS.TOPIC_EXPORT_BRIEFING, { topicId, format })
  },

  // —— Log (Phase 4 接入：stub handler 现在返回 NOT_IMPLEMENTED) ——
  log: {
    list: (limit?: number): Promise<IpcResponse<typeof IPC_CHANNELS.LOG_LIST>> =>
      invoke(IPC_CHANNELS.LOG_LIST, { limit }),

    export: (): Promise<IpcResponse<typeof IPC_CHANNELS.LOG_EXPORT>> =>
      invokeVoid(IPC_CHANNELS.LOG_EXPORT)
  }
} as const;

export type AppApi = typeof api;

// ============================================================
// 安全暴露
// ============================================================

contextBridge.exposeInMainWorld('api', api);
