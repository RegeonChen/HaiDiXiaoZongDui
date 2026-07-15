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
import {
  IPC_CHANNELS,
  type IpcResponse,
  type IpcArgs,
  type IpcChannel
} from '../../shared/ipc.js';

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
      invoke(IPC_CHANNELS.ARTICLE_BATCH_MARK_READ, { ids, isRead })
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
      invoke(IPC_CHANNELS.CONTENT_GET_CLEANED_MARKDOWN, { articleId })
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
      invoke(IPC_CHANNELS.TAG_BATCH_ADD, { articleIds, tagIds })
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
  }
  // 后续按 Phase 接入时在这里加：topic / log
} as const;

export type AppApi = typeof api;

// ============================================================
// 安全暴露
// ============================================================

contextBridge.exposeInMainWorld('api', api);
